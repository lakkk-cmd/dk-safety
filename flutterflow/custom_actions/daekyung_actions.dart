// FlutterFlow Custom Actions (Daekyung x Supabase)
// NOTE:
// - orders table in artifact == reservations in current backend
// - technicians table in artifact == workers in current backend

import 'dart:convert';
import 'package:supabase_flutter/supabase_flutter.dart';

final SupabaseClient _sb = Supabase.instance.client;

String? parseAptCodeFromUrl(String? currentUri) {
  if (currentUri == null || currentUri.trim().isEmpty) return null;
  final uri = Uri.tryParse(currentUri.trim());
  if (uri == null) return null;
  final id = uri.queryParameters['id']?.trim().toUpperCase();
  if (id == null || id.isEmpty) return null;
  final re = RegExp(r'^[A-Z0-9_-]{3,20}$');
  return re.hasMatch(id) ? id : null;
}

Future<Map<String, dynamic>?> loadApartmentData(String aptCode) async {
  final row = await _sb
      .from('apartments')
      .select('id, apt_code, name, logo_url, base_fee, discount_rate, discount_label, bank_account, is_active')
      .eq('apt_code', aptCode)
      .eq('is_active', true)
      .maybeSingle();
  return row;
}

Future<String> createOrder({
  required String aptId,
  required String userName,
  required String userPhone,
  required String userDong,
  required String userHo,
  required String serviceType,
  required String preferredDate,
  required String preferredTime,
  String userMemo = '',
  int baseFee = 50000,
}) async {
  final payload = {
    'apartment_id': aptId,
    'name': userName,
    'phone': userPhone,
    'address': '${userDong}동 ${userHo}호',
    'detail': userMemo,
    'service_type': serviceType,
    'preferred_date': preferredDate,
    'preferred_time': preferredTime,
    'status': 'waiting_payment',
    'payment_status': 'PENDING',
    'base_fee': baseFee,
    'extra_fee': 0,
    'total_amount': baseFee,
    'is_paid': false,
    'prepayment_confirmed': false
  };
  final inserted = await _sb.from('reservations').insert(payload).select('id').single();
  return inserted['id'] as String;
}

Future<bool> confirmPrepayment({
  required String orderId,
  required String txId,
  required int paidAmount,
  required int baseFee,
}) async {
  if (paidAmount < baseFee) return false;
  if (txId.trim().isEmpty) return false;

  await _sb.from('reservations').update({
    'is_paid': true,
    'paid_at': DateTime.now().toIso8601String(),
    'prepayment_confirmed': true,
    'prepayment_confirmed_at': DateTime.now().toIso8601String(),
    'prepayment_tx_id': txId,
    'payment_status': 'PREPAID',
    'status': '접수'
  }).eq('id', orderId);

  await _sb.from('order_logs').insert({
    'reservation_id': orderId,
    'status_from': 'PENDING',
    'status_to': 'PREPAID',
    'actor': 'USER',
    'note': '선결제 완료 — 배정 활성화'
  });
  return true;
}

Future<void> assignTechnician(String orderId, String workerId) async {
  final row = await _sb
      .from('reservations')
      .select('id, prepayment_confirmed, payment_status')
      .eq('id', orderId)
      .single();
  if (row['prepayment_confirmed'] != true) {
    throw Exception('prepayment_confirmed=false 주문은 배정할 수 없습니다.');
  }
  await _sb.from('reservations').update({
    'worker_id': workerId,
    'payment_status': 'ASSIGNED',
    'status': '진행중'
  }).eq('id', orderId);
}

Future<String> uploadSitePhoto({
  required String orderId,
  required List<int> bytes,
  String bucket = 'dk-safety-uploads',
}) async {
  final path = 'site-photos/$orderId/${DateTime.now().millisecondsSinceEpoch}.jpg';
  await _sb.storage.from(bucket).uploadBinary(path, bytes);
  return _sb.storage.from(bucket).getPublicUrl(path);
}

Future<void> submitExtraFee({
  required String orderId,
  required int extraFee,
  required String note,
  required List<String> photoUrls,
}) async {
  await _sb.from('reservations').update({
    'extra_fee': extraFee,
    'extra_fee_note': note,
    'extra_fee_added_at': DateTime.now().toIso8601String(),
    'image_urls': photoUrls,
    'payment_status': 'CONFIRMING'
  }).eq('id', orderId);
}

Future<void> confirmExtraFee(String orderId) async {
  await _sb.from('reservations').update({
    'extra_confirmed': true,
    'extra_confirmed_at': DateTime.now().toIso8601String(),
    'payment_status': 'CONFIRMED'
  }).eq('id', orderId);
}

Future<Map<String, dynamic>?> verifyWarranty(String warrantyNumber) async {
  final row = await _sb
      .from('warranties')
      .select('id, warranty_number, reservation_id, verify_url, status, final_amount, warranty_start, warranty_end')
      .eq('warranty_number', warrantyNumber.trim().toUpperCase())
      .eq('status', 'ISSUED')
      .maybeSingle();
  return row;
}

Future<void> updateServiceFee({
  required String serviceItemId,
  required int minFee,
  required int maxFee,
}) async {
  if (minFee <= 0 || maxFee <= 0 || minFee > maxFee) {
    throw Exception('요금 범위가 유효하지 않습니다.');
  }
  await _sb.from('service_items').update({
    'min_fee': minFee,
    'max_fee': maxFee,
    'updated_at': DateTime.now().toIso8601String()
  }).eq('id', serviceItemId);
}

String prettyJson(Map<String, dynamic> value) => const JsonEncoder.withIndent('  ').convert(value);

/// 특허 청구항 g단계 — 정산 계산 + SETTLED 상태 업데이트
Future<Map<String, dynamic>> calculateAndSettle({
  required String reservationId,
}) async {
  final res = await _sb
      .from('reservations')
      .select('base_fee, extra_fee, service_type')
      .eq('id', reservationId)
      .single();

  final baseFee = (res['base_fee'] as num?)?.toInt() ?? 50000;
  final extraFee = (res['extra_fee'] as num?)?.toInt() ?? 0;
  final isDeductible = (res['service_type'] as String? ?? '') == 'VISIT' && extraFee > 0;
  final deductAmt = isDeductible ? baseFee : 0;
  final totalFee = baseFee + extraFee - deductAmt;

  await _sb.from('reservations').update({
    'total_amount': totalFee,
    'payment_status': 'SETTLED',
    'status': '완료',
    'extra_fee_confirmed': true,
    'extra_fee_confirmed_at': DateTime.now().toIso8601String(),
    'extra_fee_confirmed_by': 'ADMIN',
  }).eq('id', reservationId);

  return {
    'base_fee': baseFee,
    'extra_fee': extraFee,
    'deductible_applied': isDeductible,
    'deductible_amount': deductAmt,
    'total_fee': totalFee,
  };
}

/// 특허 청구항 8, 13 — 보증서 자동 발급 + 진위확인 URL
Future<Map<String, dynamic>> issueWarranty({
  required String reservationId,
  required int finalAmount,
  String serviceType = 'VISIT',
}) async {
  final res = await _sb
      .from('reservations')
      .select('apartment_id, worker_id, detail, image_urls, apartments(apt_code)')
      .eq('id', reservationId)
      .single();

  final aptRaw = (res['apartments'] as Map<String, dynamic>?)?['apt_code'] as String?;
  final aptCode = (aptRaw ?? 'APT').toUpperCase();
  final year = DateTime.now().year;
  final seq = reservationId.replaceAll('-', '').substring(0, 5).toUpperCase();
  final warrantyNumber = 'WST-$year-$aptCode-$seq';

  final start = DateTime.now();
  final end = start.add(const Duration(days: 365));
  const baseUrl = String.fromEnvironment('SITE_URL', defaultValue: 'http://www.dkansim.com');
  final verifyUrl = '$baseUrl/verify/$warrantyNumber';

  final inserted = await _sb.from('warranties').insert({
    'warranty_number': warrantyNumber,
    'reservation_id': reservationId,
    'apt_id': res['apartment_id'],
    'technician_id': res['worker_id'],
    'service_type': serviceType,
    'service_summary': res['detail'],
    'warranty_months': 12,
    'warranty_start': start.toIso8601String().substring(0, 10),
    'warranty_end': end.toIso8601String().substring(0, 10),
    'final_amount': finalAmount,
    'site_photos': res['image_urls'],
    'verify_url': verifyUrl,
    'status': 'ISSUED',
    'issued_at': start.toIso8601String(),
  }).select('id, warranty_number, verify_url').single();

  await _sb.from('reservations').update({
    'warranty_id': inserted['id'],
    'warranty_status': 'ISSUED',
  }).eq('id', reservationId);

  return {
    'warranty_id': inserted['id'],
    'warranty_number': inserted['warranty_number'],
    'verify_url': inserted['verify_url'],
  };
}

/// 특허 청구항 f, 14 — 확인 요청 + 재요청 카운트
Future<Map<String, dynamic>> requestExtraFeeConfirm({
  required String reservationId,
  bool isResend = false,
}) async {
  final res = await _sb
      .from('reservations')
      .select('extra_fee_confirm_request_count, extra_fee_confirmed')
      .eq('id', reservationId)
      .single();

  if (res['extra_fee_confirmed'] == true) {
    return {'success': false, 'message': '이미 확인 완료된 추가비용입니다.'};
  }

  final currentCount = (res['extra_fee_confirm_request_count'] as num?)?.toInt() ?? 0;
  const maxRequests = 3;

  if (isResend && currentCount >= maxRequests) {
    return {'success': false, 'message': '최대 재요청 횟수 초과. 관리자 직접 처리 필요.'};
  }

  final newCount = currentCount + 1;
  await _sb.from('reservations').update({
    'extra_fee_confirm_request_count': newCount,
    'extra_fee_confirm_requested_at': DateTime.now().toIso8601String(),
    'status': 'extra_fee_confirming',
  }).eq('id', reservationId);

  return {
    'success': true,
    'request_count': newCount,
    'max_requests': maxRequests,
    'is_final_request': newCount >= maxRequests,
    'message': isResend ? '재요청 $newCount/$maxRequests 발송 완료' : '확인 요청 발송 완료',
  };
}
