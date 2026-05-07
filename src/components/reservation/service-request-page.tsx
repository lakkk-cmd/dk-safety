"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase-browser";
import LiveNotificationToast from "@/components/live/live-notification-toast";
import DepositPaymentPanel from "@/components/payment/deposit-payment-panel";
import { validateReservationInput } from "@/lib/reservation-validation";
import { formatResidentDongHoDepositHolder } from "@/lib/resident-unit-label";
import { cn } from "@/lib/utils";
import {
  ACTIVE_RESERVATION_CHANGED_EVENT,
  ACTIVE_RESERVATION_STORAGE_KEY,
  type StoredReservation
} from "@/components/reservation/reservation-status-bar";

type ApartmentInfo = {
  id: string;
  code: string;
  name: string;
  logoUrl: string | null;
  baseFee: number;
  bankInfo?: { bankName: string; accountNumber: string; accountHolder: string };
};

type ServiceItemInfo = {
  id: string;
  serviceType: string;
  name: string;
  minFee: number | null;
  maxFee: number | null;
};

type RequestType = "repair" | "emergency" | "etc-check";
type FlowStatus = "draft" | "pending_payment" | "assigned_waiting" | "assigned_done";
type WarrantyBrief = { warrantyNumber: string; verifyUrl: string | null };
type VirtualAccountInfo = {
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  dueAt: string | null;
  amount: number;
};

type Props = {
  apartment: ApartmentInfo;
  requestType: RequestType;
};

const PHOTO_SLOT_COUNT = 5;

const requestInfo: Record<RequestType, { title: string; serviceType: string; serviceItemKey: string; detail: string; gatewayTitle: string }> = {
  repair: {
    title: "점검/수리",
    serviceType: "점검/수리",
    serviceItemKey: "OUTLET",
    detail: "점검/수리 버튼 접수",
    gatewayTitle: "점검/수리 예약금 결제 게이트웨이"
  },
  emergency: {
    title: "긴급출동",
    serviceType: "긴급출동",
    serviceItemKey: "LEAKAGE",
    detail: "긴급출동 버튼 접수",
    gatewayTitle: "긴급출동 예약금 결제 게이트웨이"
  },
  "etc-check": {
    title: "기타점검",
    serviceType: "기타점검",
    serviceItemKey: "VISIT",
    detail: "기타점검 버튼 접수",
    gatewayTitle: "기타점검 예약금 결제 게이트웨이"
  }
};

export default function ServiceRequestPage({ apartment, requestType }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [serviceItems, setServiceItems] = useState<ServiceItemInfo[]>([]);
  const [reservationId, setReservationId] = useState("");
  const [orderId, setOrderId] = useState("");
  const [flowStatus, setFlowStatus] = useState<FlowStatus>("draft");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [paymentPopupOpen, setPaymentPopupOpen] = useState(false);
  const [serviceKickoffVisible, setServiceKickoffVisible] = useState(false);
  const [orderPaymentStatus, setOrderPaymentStatus] = useState<"PENDING" | "WAITING_FOR_DEPOSIT" | "PAID" | "FAILED" | "UNKNOWN">("UNKNOWN");
  const [orderDispatchStatus, setOrderDispatchStatus] = useState<
    "BLOCKED" | "READY" | "ASSIGNED" | "IN_PROGRESS" | "DONE" | "CANCELLED" | "IDLE" | "ACTIVE" | "UNKNOWN"
  >("UNKNOWN");
  const [orderFinalPaymentStatus, setOrderFinalPaymentStatus] = useState<"PENDING" | "REQUESTED" | "PAID" | "FAILED" | "CANCELLED" | "UNKNOWN">("UNKNOWN");
  const [orderTotalFinalFee, setOrderTotalFinalFee] = useState<number | null>(null);
  const [orderWarrantyIssuedAt, setOrderWarrantyIssuedAt] = useState<string | null>(null);
  const [additionalDueAmount, setAdditionalDueAmount] = useState<number>(0);
  const [showSettlementDetail, setShowSettlementDetail] = useState(false);
  const [warranty, setWarranty] = useState<WarrantyBrief | null>(null);
  const [virtualAccount, setVirtualAccount] = useState<VirtualAccountInfo | null>(null);
  const [taskStatus, setTaskStatus] = useState<"assigned" | "in_progress" | "completed" | null>(null);
  const prepaymentAmount = requestType === "emergency" ? 100000 : 50000;
  const isEmergency = requestType === "emergency";
  const scheduleSelectButtonLabel = isEmergency ? "긴급출동요청" : "예약 날짜/시간 선택";
  const profileStorageKey = `dk-safety:request-profile:${apartment.code}`;
  const globalProfileStorageKey = "dk-safety:request-profile:global";
  const [residentName, setResidentName] = useState("");
  const [residentPhone, setResidentPhone] = useState("");
  const [dong, setDong] = useState("");
  const [ho, setHo] = useState("");
  const [requestDetailText, setRequestDetailText] = useState("");
  const [photoSlots, setPhotoSlots] = useState<(File | null)[]>(() => Array(PHOTO_SLOT_COUNT).fill(null));
  const [pickerSlot, setPickerSlot] = useState<number | null>(null);
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [schedulePrereqHint, setSchedulePrereqHint] = useState(false);
  const [draftPreferredDate, setDraftPreferredDate] = useState("");
  const [draftPreferredTime, setDraftPreferredTime] = useState("");
  /** 일정 팝업 달력에서 보이는 연·월 */
  const [scheduleViewYM, setScheduleViewYM] = useState<{ y: number; m: number }>(() => {
    const t = new Date();
    return { y: t.getFullYear(), m: t.getMonth() };
  });
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const scheduleTimeInputRef = useRef<HTMLInputElement>(null);
  const pendingSlotRef = useRef<number | null>(null);
  const flowStatusRef = useRef<FlowStatus>("draft");
  const paymentRedirectTimerRef = useRef<number | null>(null);

  const requestPhotos = useMemo(() => photoSlots.filter((f): f is File => f != null), [photoSlots]);

  const photoPreviewUrls = useMemo(() => photoSlots.map((f) => (f ? URL.createObjectURL(f) : null)), [photoSlots]);
  useEffect(() => {
    return () => {
      photoPreviewUrls.forEach((u) => u && URL.revokeObjectURL(u));
    };
  }, [photoPreviewUrls]);

  const hasRequiredInfo = Boolean(residentName && residentPhone && dong && ho);

  const depositHolderLabel = useMemo(() => formatResidentDongHoDepositHolder(dong, ho), [dong, ho]);

  /** 요청 텍스트는 API 검증(2~500자)과 동일하게 최소 2자 */
  const requestDetailOk = requestDetailText.trim().length >= 2;
  const hasPhotos = requestPhotos.length >= 1;
  const canOpenSchedule = hasRequiredInfo && requestDetailOk && hasPhotos;

  useEffect(() => {
    if (canOpenSchedule) setSchedulePrereqHint(false);
  }, [canOpenSchedule]);

  useEffect(() => {
    const qName = (searchParams.get("name") ?? "").trim();
    const qPhone = (searchParams.get("phone") ?? "").replaceAll(/[^0-9]/g, "").slice(0, 11);
    const qDong = (searchParams.get("dong") ?? "").replaceAll(/[^0-9]/g, "");
    const qHo = (searchParams.get("ho") ?? "").replaceAll(/[^0-9]/g, "");
    if (qName || qPhone || qDong || qHo) {
      setResidentName(qName);
      setResidentPhone(qPhone);
      setDong(qDong);
      setHo(qHo);
      return;
    }
    try {
      const raw = window.sessionStorage.getItem(profileStorageKey);
      const globalRaw = window.sessionStorage.getItem(globalProfileStorageKey);
      const source = raw || globalRaw;
      if (!source) return;
      const parsed = JSON.parse(source) as { name?: string; phone?: string; dong?: string; ho?: string };
      setResidentName(String(parsed.name ?? "").trim());
      setResidentPhone(String(parsed.phone ?? "").replaceAll(/[^0-9]/g, "").slice(0, 11));
      setDong(String(parsed.dong ?? "").replaceAll(/[^0-9]/g, ""));
      setHo(String(parsed.ho ?? "").replaceAll(/[^0-9]/g, ""));
    } catch {
      // ignore storage parse errors
    }
  }, [profileStorageKey, globalProfileStorageKey, searchParams]);

  useEffect(() => {
    if (!residentName && !residentPhone && !dong && !ho) return;
    try {
      window.sessionStorage.setItem(
        profileStorageKey,
        JSON.stringify({
          name: residentName.trim(),
          phone: residentPhone.trim(),
          dong: dong.trim(),
          ho: ho.trim()
        })
      );
      window.sessionStorage.setItem(
        globalProfileStorageKey,
        JSON.stringify({
          name: residentName.trim(),
          phone: residentPhone.trim(),
          dong: dong.trim(),
          ho: ho.trim()
        })
      );
    } catch {
      // ignore storage errors
    }
  }, [profileStorageKey, globalProfileStorageKey, residentName, residentPhone, dong, ho]);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch(`/api/public/apt/${encodeURIComponent(apartment.code)}/service-items`, { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as { serviceItems?: ServiceItemInfo[] };
        setServiceItems(data.serviceItems ?? []);
      } catch {
        // ignore
      }
    })();
  }, [apartment.code]);

  useEffect(() => {
    flowStatusRef.current = flowStatus;
  }, [flowStatus]);

  useEffect(() => {
    return () => {
      if (paymentRedirectTimerRef.current !== null) {
        window.clearTimeout(paymentRedirectTimerRef.current);
      }
    };
  }, []);

  const closePaymentPopupAfterPaid = useCallback(() => {
    setPaymentPopupOpen(false);
    if (flowStatusRef.current === "assigned_waiting" || flowStatusRef.current === "assigned_done") return;
    if (paymentRedirectTimerRef.current !== null) {
      window.clearTimeout(paymentRedirectTimerRef.current);
    }
    paymentRedirectTimerRef.current = window.setTimeout(() => {
      if (flowStatusRef.current === "assigned_waiting" || flowStatusRef.current === "assigned_done") return;
      router.push(`/apt/${apartment.code}`);
    }, 2000);
  }, [apartment.code, router]);

  useEffect(() => {
    if (!reservationId) return;
    let unsubscribe = () => {};
    try {
      const supabase = createBrowserSupabase();
      const channel = supabase
        .channel(`reservation-watch-${reservationId}`)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "reservations", filter: `id=eq.${reservationId}` },
          (payload) => {
            const row = payload.new as { prepayment_confirmed?: boolean; payment_status?: string; task_status?: string | null };
            const rowTaskStatus = (row.task_status ?? null) as "assigned" | "in_progress" | "completed" | null;
            if (rowTaskStatus) {
              setTaskStatus(rowTaskStatus);
              setFlowStatus("assigned_done");
              setServiceKickoffVisible(true);
              setPaymentPopupOpen(false);
              return;
            }
            if (row.prepayment_confirmed) {
              setServiceKickoffVisible(true);
              if (row.payment_status === "ASSIGNED" || row.payment_status === "IN_PROGRESS" || row.payment_status === "SETTLED") {
                setFlowStatus("assigned_done");
              } else {
                setFlowStatus("assigned_waiting");
              }
              closePaymentPopupAfterPaid();
            }
          }
        )
        .subscribe();
      unsubscribe = () => {
        void supabase.removeChannel(channel);
      };
    } catch {
      // ignore realtime setup failure
    }
    return () => unsubscribe();
  }, [closePaymentPopupAfterPaid, reservationId]);

  useEffect(() => {
    if (!reservationId) return;
    let unsubscribe = () => {};
    try {
      const supabase = createBrowserSupabase();
      const channel = supabase
        .channel(`task-watch-${reservationId}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "tasks", filter: `reservation_id=eq.${reservationId}` },
          (payload) => {
            const row = (payload.new ?? payload.old) as { status?: string } | null;
            const next = (row?.status ?? null) as "assigned" | "in_progress" | "completed" | null;
            if (!next) return;
            setTaskStatus(next);
            setFlowStatus("assigned_done");
            setServiceKickoffVisible(true);
            setPaymentPopupOpen(false);
          }
        )
        .subscribe();
      unsubscribe = () => {
        void supabase.removeChannel(channel);
      };
    } catch {
      // ignore realtime setup failure
    }
    return () => unsubscribe();
  }, [reservationId]);

  useEffect(() => {
    if (!reservationId) return;
    const tick = async () => {
      try {
        const response = await fetch(`/api/reservations/${encodeURIComponent(reservationId)}`, { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as {
          reservation?: { taskStatus?: "assigned" | "in_progress" | "completed" | null; isPaid?: boolean };
        };
        const nextTask = data.reservation?.taskStatus ?? null;
        if (nextTask) {
          setTaskStatus(nextTask);
          setFlowStatus("assigned_done");
          setServiceKickoffVisible(true);
          setPaymentPopupOpen(false);
          return;
        }
        if (data.reservation?.isPaid) {
          setFlowStatus((prev) => (prev === "assigned_done" ? prev : "assigned_waiting"));
          closePaymentPopupAfterPaid();
        }
        if (orderId) {
          try {
            const supabase = createBrowserSupabase();
            const { data: orderRow } = await supabase
              .from("orders")
              .select("payment_status, dispatch_status")
              .eq("id", orderId)
              .maybeSingle();
            if (orderRow) {
              const payment = String(orderRow.payment_status ?? "").trim().toUpperCase();
              const dispatch = String(orderRow.dispatch_status ?? "").trim().toUpperCase();
              if (payment === "PAID" || dispatch === "READY" || dispatch === "ACTIVE") {
                if (payment === "PAID") setOrderPaymentStatus("PAID");
                if (dispatch === "READY" || dispatch === "ACTIVE") setOrderDispatchStatus("READY");
                setFlowStatus((prev) => (prev === "assigned_done" ? prev : "assigned_waiting"));
                setServiceKickoffVisible(true);
                closePaymentPopupAfterPaid();
              }
            }
          } catch {
            // ignore order poll (RLS 등)
          }
        }
      } catch {
        // ignore polling errors
      }
    };
    void tick();
    const id = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void tick();
    }, 3500);
    return () => window.clearInterval(id);
  }, [closePaymentPopupAfterPaid, reservationId, orderId]);

  useEffect(() => {
    if (!orderId) return;
    let unsubscribe = () => {};
    try {
      const supabase = createBrowserSupabase();
      const channel = supabase
        .channel(`order-watch-${orderId}`)
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders", filter: `id=eq.${orderId}` }, (payload) => {
          const row = payload.new as {
            payment_status?: string;
            dispatch_status?: string;
            final_payment_status?: string;
            total_final_fee?: number | null;
            warranty_issued_at?: string | null;
            virtual_account_bank?: string | null;
            virtual_account_number?: string | null;
            virtual_account_holder?: string | null;
            virtual_account_due_at?: string | null;
            virtual_account_amount?: number | null;
          };
          const payment = (row.payment_status ?? "UNKNOWN").toUpperCase() as "PENDING" | "WAITING_FOR_DEPOSIT" | "PAID" | "FAILED" | "UNKNOWN";
          const dispatch = String(row.dispatch_status ?? "UNKNOWN")
            .trim()
            .toUpperCase() as
            | "BLOCKED"
            | "READY"
            | "ASSIGNED"
            | "IN_PROGRESS"
            | "DONE"
            | "CANCELLED"
            | "IDLE"
            | "ACTIVE"
            | "UNKNOWN";
          const finalPayment = (row.final_payment_status ?? "UNKNOWN").toUpperCase() as
            | "PENDING"
            | "REQUESTED"
            | "PAID"
            | "FAILED"
            | "CANCELLED"
            | "UNKNOWN";
          setOrderPaymentStatus(payment);
          setOrderDispatchStatus(dispatch);
          setOrderFinalPaymentStatus(finalPayment);
          setOrderTotalFinalFee(typeof row.total_final_fee === "number" ? row.total_final_fee : null);
          setOrderWarrantyIssuedAt(row.warranty_issued_at ?? null);
          if (row.virtual_account_number) {
            setVirtualAccount({
              bankName: row.virtual_account_bank ?? "기업은행",
              accountNumber: row.virtual_account_number,
              accountHolder:
                row.virtual_account_holder?.trim() ||
                formatResidentDongHoDepositHolder(dong, ho) ||
                apartment.name,
              dueAt: row.virtual_account_due_at ?? null,
              amount: typeof row.virtual_account_amount === "number" ? row.virtual_account_amount : prepaymentAmount
            });
          }
          if (dispatch === "ACTIVE" || dispatch === "READY" || payment === "PAID") {
            setFlowStatus("assigned_waiting");
            setServiceKickoffVisible(true);
            closePaymentPopupAfterPaid();
          }
        })
        .subscribe();
      unsubscribe = () => {
        void supabase.removeChannel(channel);
      };
    } catch {
      // ignore realtime setup failure
    }
    return () => unsubscribe();
  }, [apartment.name, closePaymentPopupAfterPaid, dong, ho, orderId, prepaymentAmount]);

  useEffect(() => {
    const base = prepaymentAmount;
    if (orderTotalFinalFee == null) {
      setAdditionalDueAmount(0);
      return;
    }
    setAdditionalDueAmount(Math.max(0, Math.round(orderTotalFinalFee - base)));
  }, [orderTotalFinalFee, prepaymentAmount]);

  useEffect(() => {
    if (!reservationId || orderFinalPaymentStatus !== "PAID") return;
    void (async () => {
      try {
        const response = await fetch(`/api/warranties/by-reservation/${encodeURIComponent(reservationId)}`, { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as { warranty?: { warrantyNumber: string; verifyUrl: string | null } };
        if (data.warranty) {
          setWarranty({ warrantyNumber: data.warranty.warrantyNumber, verifyUrl: data.warranty.verifyUrl ?? null });
        }
      } catch {
        // ignore
      }
    })();
  }, [orderFinalPaymentStatus, reservationId]);

  const feeGuide = useMemo(() => {
    const item = serviceItems.find((row) => row.serviceType === requestInfo[requestType].serviceItemKey);
    if (!item || item.minFee === null || item.maxFee === null) return "예상 기술료 정보 준비 중";
    if (item.minFee === item.maxFee) return `예상 기술료 ${item.minFee.toLocaleString("ko-KR")}원`;
    return `예상 기술료 ${item.minFee.toLocaleString("ko-KR")} ~ ${item.maxFee.toLocaleString("ko-KR")}원`;
  }, [requestType, serviceItems]);

  const openScheduleModal = useCallback(() => {
    if (!hasRequiredInfo) {
      setSchedulePrereqHint(false);
      setMessage("메인페이지 팝업에서 동/호수, 성명, 연락처를 입력해 주세요.");
      return;
    }
    if (!requestDetailOk || !hasPhotos) {
      setSchedulePrereqHint(true);
      setMessage("");
      return;
    }
    setSchedulePrereqHint(false);
    const next = new Date(Date.now() + 60 * 60 * 1000);
    setDraftPreferredDate(
      `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`
    );
    setDraftPreferredTime(`${String(next.getHours()).padStart(2, "0")}:${String(next.getMinutes()).padStart(2, "0")}`);
    setScheduleViewYM({ y: next.getFullYear(), m: next.getMonth() });
    setScheduleModalOpen(true);
    setMessage("");
  }, [hasRequiredInfo, hasPhotos, requestDetailOk]);

  const todayInputMin = useMemo(() => {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
  }, []);

  const scheduleCalendarGrid = useMemo(() => {
    const { y, m } = scheduleViewYM;
    const first = new Date(y, m, 1);
    const lastDay = new Date(y, m + 1, 0).getDate();
    const startPad = first.getDay();
    const minDay = new Date(`${todayInputMin}T12:00:00`);
    type Cell = { kind: "blank" } | { kind: "day"; day: number; date: Date; disabled: boolean };
    const cells: Cell[] = [];
    for (let i = 0; i < startPad; i++) cells.push({ kind: "blank" });
    for (let d = 1; d <= lastDay; d++) {
      const date = new Date(y, m, d);
      const t0 = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      const m0 = new Date(minDay.getFullYear(), minDay.getMonth(), minDay.getDate());
      cells.push({ kind: "day", day: d, date, disabled: t0 < m0 });
    }
    while (cells.length % 7 !== 0) cells.push({ kind: "blank" });
    const rows: Cell[][] = [];
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
    return rows;
  }, [scheduleViewYM, todayInputMin]);

  const scheduleMonthLabel = useMemo(() => {
    const d = new Date(scheduleViewYM.y, scheduleViewYM.m, 1);
    return d.toLocaleDateString("ko-KR", { year: "numeric", month: "long" });
  }, [scheduleViewYM]);

  const minMonthFirst = useMemo(() => {
    const [yy, mm] = todayInputMin.split("-").map(Number);
    return new Date(yy, mm - 1, 1);
  }, [todayInputMin]);

  const canGoSchedulePrevMonth = useMemo(() => {
    const curFirst = new Date(scheduleViewYM.y, scheduleViewYM.m, 1);
    return curFirst > minMonthFirst;
  }, [scheduleViewYM, minMonthFirst]);

  const bumpScheduleMonth = useCallback(
    (delta: number) => {
      setScheduleViewYM((prev) => {
        const next = new Date(prev.y, prev.m + delta, 1);
        const nf = new Date(next.getFullYear(), next.getMonth(), 1);
        if (nf < minMonthFirst) return prev;
        return { y: next.getFullYear(), m: next.getMonth() };
      });
    },
    [minMonthFirst]
  );

  const selectedDateLabel = useMemo(() => {
    if (!draftPreferredDate) return "";
    const [yy, mm, dd] = draftPreferredDate.split("-").map(Number);
    const d = new Date(yy, mm - 1, dd);
    return d.toLocaleDateString("ko-KR", { weekday: "short", year: "numeric", month: "long", day: "numeric" });
  }, [draftPreferredDate]);

  const formattedDraftTimeLabel = useMemo(() => {
    if (!draftPreferredTime || !/^\d{1,2}:\d{2}/.test(draftPreferredTime)) {
      return "시간을 눌러 선택하세요";
    }
    const [hh, mm] = draftPreferredTime.split(":").map(Number);
    const d = new Date(1970, 0, 1, hh, mm, 0, 0);
    return d.toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit", hour12: true });
  }, [draftPreferredTime]);

  const openTimePicker = useCallback(() => {
    if (loading) return;
    const el = scheduleTimeInputRef.current;
    if (!el) return;
    try {
      if (typeof el.showPicker === "function") {
        void el.showPicker();
      } else {
        el.focus();
        el.click();
      }
    } catch {
      el.click();
    }
  }, [loading]);

  const createReservation = async (preferredDate: string, preferredTime: string): Promise<boolean> => {
    if (!hasRequiredInfo) {
      setMessage("메인페이지 팝업에서 동/호수, 성명, 연락처를 입력해 주세요.");
      return false;
    }
    if (!requestDetailOk || !hasPhotos) {
      setMessage("요청 내용(2자 이상)과 사진 1장 이상을 입력한 뒤 다시 시도해 주세요.");
      return false;
    }
    setLoading(true);
    setMessage("");
    try {
      const combinedDetail = [requestDetailText.trim(), requestInfo[requestType].detail]
        .filter((s) => s.length > 0)
        .join("\n\n")
        .slice(0, 500);

      const photos = requestPhotos.slice(0, 5);
      let response: Response;
      if (photos.length > 0) {
        const formData = new FormData();
        formData.append("apartmentId", apartment.id);
        formData.append("apartmentName", apartment.name);
        formData.append("apartmentCode", apartment.code);
        formData.append("name", residentName);
        formData.append("phone", residentPhone);
        formData.append("address", `${apartment.name} ${dong}동 ${ho}호`);
        formData.append("serviceType", requestInfo[requestType].serviceType);
        formData.append("preferredDate", preferredDate);
        formData.append("preferredTime", preferredTime);
        formData.append("detail", combinedDetail || requestInfo[requestType].detail);
        for (const file of photos) {
          formData.append("photos", file);
        }
        response = await fetch("/api/reservations", { method: "POST", body: formData });
      } else {
        response = await fetch("/api/reservations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            apartmentId: apartment.id,
            apartmentName: apartment.name,
            apartmentCode: apartment.code,
            name: residentName,
            phone: residentPhone,
            address: `${apartment.name} ${dong}동 ${ho}호`,
            serviceType: requestInfo[requestType].serviceType,
            preferredDate,
            preferredTime,
            detail: combinedDetail || requestInfo[requestType].detail
          })
        });
      }
      const data = (await response.json()) as { message?: string; reservation?: { id?: string } };
      if (!response.ok || !data.reservation?.id) throw new Error(data.message ?? "접수 생성 실패");
      setReservationId(data.reservation.id);
      const orderResponse = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          aptId: apartment.id,
          reservationId: data.reservation.id,
          residentInfo: { name: residentName, phone: residentPhone, dong, ho },
          baseFee: prepaymentAmount
        })
      });
      const orderData = (await orderResponse.json()) as { message?: string; order?: { id?: string } };
      if (!orderResponse.ok || !orderData.order?.id) throw new Error(orderData.message ?? "주문 생성 실패");
      setOrderId(orderData.order.id);
      try {
        const active: StoredReservation = {
          reservationId: data.reservation.id,
          orderId: orderData.order.id,
          aptCode: apartment.code,
          serviceType: requestInfo[requestType].serviceType,
          submittedAt: new Date().toISOString()
        };
        window.localStorage.setItem(ACTIVE_RESERVATION_STORAGE_KEY, JSON.stringify(active));
        window.dispatchEvent(new CustomEvent(ACTIVE_RESERVATION_CHANGED_EVENT));
      } catch {
        /* ignore quota / private mode */
      }
      setOrderPaymentStatus("PENDING");
      setOrderDispatchStatus("BLOCKED");
      setFlowStatus("pending_payment");
      setPaymentPopupOpen(true);
      setMessage("접수가 생성되었습니다. 팝업에서 계좌 입금 안내를 확인해 주세요.");
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "접수 생성 실패");
      return false;
    } finally {
      setLoading(false);
    }
  };

  const confirmScheduleAndSubmit = async () => {
    if (!requestDetailOk) {
      setMessage(
        requestDetailText.trim().length === 0
          ? "요청 내용을 입력해 주세요. (2자 이상)"
          : "요청 내용은 2자 이상 입력해 주세요."
      );
      return;
    }
    if (!hasPhotos) {
      setMessage("현장 사진을 1장 이상 첨부해 주세요.");
      return;
    }
    const vErr = validateReservationInput({
      name: residentName,
      phone: residentPhone,
      address: `${apartment.name} ${dong}동 ${ho}호`,
      serviceType: requestInfo[requestType].serviceType,
      preferredDate: draftPreferredDate,
      preferredTime: draftPreferredTime,
      detail: requestDetailText.trim() || undefined
    });
    if (vErr) {
      setMessage(vErr);
      return;
    }
    const ok = await createReservation(draftPreferredDate, draftPreferredTime);
    if (ok) setScheduleModalOpen(false);
  };

  /** 긴급출동: 일정 팝업 없이 접수 생성 후 곧바로 입금 팝업으로 이어짐 (희망 일시는 접수 시점 기준 1시간 뒤로 자동 설정) */
  const submitEmergencyRequest = async () => {
    if (!hasRequiredInfo) {
      setSchedulePrereqHint(false);
      setMessage("메인페이지 팝업에서 동/호수, 성명, 연락처를 입력해 주세요.");
      return;
    }
    if (!requestDetailOk) {
      setSchedulePrereqHint(true);
      setMessage(
        requestDetailText.trim().length === 0
          ? "요청 내용을 입력해 주세요. (2자 이상)"
          : "요청 내용은 2자 이상 입력해 주세요."
      );
      return;
    }
    if (!hasPhotos) {
      setSchedulePrereqHint(true);
      setMessage("현장 사진을 1장 이상 첨부해 주세요.");
      return;
    }
    setSchedulePrereqHint(false);
    const next = new Date(Date.now() + 60 * 60 * 1000);
    const preferredDate = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;
    const preferredTime = `${String(next.getHours()).padStart(2, "0")}:${String(next.getMinutes()).padStart(2, "0")}`;
    const vErr = validateReservationInput({
      name: residentName,
      phone: residentPhone,
      address: `${apartment.name} ${dong}동 ${ho}호`,
      serviceType: requestInfo.emergency.serviceType,
      preferredDate,
      preferredTime,
      detail: requestDetailText.trim() || undefined
    });
    if (vErr) {
      setMessage(vErr);
      return;
    }
    await createReservation(preferredDate, preferredTime);
  };

  const requestFinalPayment = async () => {
    if (!orderId) {
      setMessage("주문 정보가 없어 최종 결제를 시작할 수 없습니다.");
      return;
    }
    if (additionalDueAmount <= 0) {
      setMessage("추가 결제 금액이 없습니다.");
      return;
    }
    const tossClientKey = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY?.trim() ?? "";
    if (!tossClientKey) {
      setMessage("Toss 결제 키가 설정되지 않았습니다.");
      return;
    }
    try {
      const scriptId = "toss-payments-sdk";
      if (!document.getElementById(scriptId)) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement("script");
          script.id = scriptId;
          script.src = "https://js.tosspayments.com/v1/payment";
          script.onload = () => resolve();
          script.onerror = () => reject(new Error("결제 SDK 로드 실패"));
          document.body.appendChild(script);
        });
      }
      const tossFactory = (window as typeof window & { TossPayments?: (clientKey: string) => { requestPayment: (method: string, payload: Record<string, unknown>) => Promise<void> } }).TossPayments;
      if (!tossFactory) throw new Error("Toss SDK를 불러오지 못했습니다.");
      const toss = tossFactory(tossClientKey);
      const origin = window.location.origin;
      const successUrl = `${origin}/payment/success?flow=final&reservationId=${encodeURIComponent(reservationId)}`;
      const failUrl = `${origin}/payment/fail?flow=final&reservationId=${encodeURIComponent(reservationId)}`;
      await toss.requestPayment("카드", {
        amount: additionalDueAmount,
        orderId,
        orderName: `최종 정산 ${additionalDueAmount.toLocaleString("ko-KR")}원`,
        customerName: residentName,
        customerMobilePhone: residentPhone,
        successUrl,
        failUrl
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "최종 결제 호출 실패");
    }
  };

  const markWaitingForDeposit = async () => {
    if (!orderId) {
      setMessage("주문 정보가 없어 입금 대기 처리를 할 수 없습니다.");
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}/deposit`, { method: "PATCH" });
      const data = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(data.message ?? "입금대기 상태 변경 실패");
      setOrderPaymentStatus("WAITING_FOR_DEPOSIT");
      setPaymentPopupOpen(false);
      setMessage("입금 완료 요청이 접수되었습니다. 관리자가 확인하면 서비스가 시작됩니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "입금대기 처리 실패");
    } finally {
      setLoading(false);
    }
  };

  const issueVirtualAccount = useCallback(async () => {
    if (!orderId) {
      setMessage("주문 정보가 없어 가상계좌를 발급할 수 없습니다.");
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}/virtual-account`, { method: "POST" });
      const data = (await response.json()) as {
        message?: string;
        order?: {
          virtual_account_bank?: string;
          virtual_account_number?: string;
          virtual_account_holder?: string;
          virtual_account_due_at?: string | null;
          virtual_account_amount?: number;
          payment_status?: string;
        };
      };
      if (!response.ok || !data.order) throw new Error(data.message ?? "가상계좌 발급 실패");
      setVirtualAccount({
        bankName: data.order.virtual_account_bank ?? "기업은행",
        accountNumber: data.order.virtual_account_number ?? "-",
        accountHolder:
          data.order.virtual_account_holder?.trim() ||
          formatResidentDongHoDepositHolder(dong, ho) ||
          apartment.name,
        dueAt: data.order.virtual_account_due_at ?? null,
        amount: typeof data.order.virtual_account_amount === "number" ? data.order.virtual_account_amount : prepaymentAmount
      });
      setOrderPaymentStatus((data.order.payment_status?.toUpperCase() as typeof orderPaymentStatus) ?? "WAITING_FOR_DEPOSIT");
      setMessage("기업은행 가상계좌가 자동 발급되었습니다. 입금하면 자동 확인됩니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "가상계좌 발급 실패");
    } finally {
      setLoading(false);
    }
  }, [orderId, prepaymentAmount, dong, ho, apartment.name]);

  useEffect(() => {
    if (!orderId || virtualAccount) return;
    void issueVirtualAccount();
  }, [issueVirtualAccount, orderId, virtualAccount]);

  const requestFinalSettlement = async () => {
    if (!orderId) return;
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}/final-payment`, { method: "PATCH" });
      const data = (await response.json()) as { message?: string; order?: { additional_due_amount?: number; final_payment_status?: string } };
      if (!response.ok) throw new Error(data.message ?? "최종 정산 요청 실패");
      if (typeof data.order?.additional_due_amount === "number") {
        setAdditionalDueAmount(Math.max(0, Math.round(data.order.additional_due_amount)));
      }
      setOrderFinalPaymentStatus((data.order?.final_payment_status?.toUpperCase() as typeof orderFinalPaymentStatus) ?? "REQUESTED");
      setMessage("최종 정산 요청이 생성되었습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "최종 정산 요청 실패");
    } finally {
      setLoading(false);
    }
  };

  const showPricingAfterSubmit = Boolean(reservationId);

  const assignFileToSlot = useCallback((slotIndex: number, file: File | undefined) => {
    if (!file || !file.type.startsWith("image/")) return;
    setPhotoSlots((prev) => {
      const next = [...prev];
      next[slotIndex] = file;
      return next;
    });
  }, []);

  const clearPhotoSlot = useCallback((index: number) => {
    setPhotoSlots((prev) => {
      const next = [...prev];
      next[index] = null;
      return next;
    });
  }, []);

  const commitPendingSlotFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      const slot = pendingSlotRef.current;
      pendingSlotRef.current = null;
      if (slot === null || !file) return;
      assignFileToSlot(slot, file);
    },
    [assignFileToSlot]
  );

  const triggerCameraForPendingSlot = useCallback(() => {
    if (pickerSlot === null) return;
    pendingSlotRef.current = pickerSlot;
    setPickerSlot(null);
    requestAnimationFrame(() => cameraInputRef.current?.click());
  }, [pickerSlot]);

  const triggerGalleryForPendingSlot = useCallback(() => {
    if (pickerSlot === null) return;
    pendingSlotRef.current = pickerSlot;
    setPickerSlot(null);
    requestAnimationFrame(() => galleryInputRef.current?.click());
  }, [pickerSlot]);

  return (
    <main className={cn("mx-auto w-full max-w-2xl space-y-3 pb-4", isEmergency && "emergency-request")}>
      <section className="warranty-band rounded-3xl p-5">
        <h1 className={cn("text-2xl font-extrabold", isEmergency ? "text-red-950" : "text-slate-900")}>{requestInfo[requestType].title}</h1>
        {isEmergency && !showPricingAfterSubmit ? (
          <p className="mt-2 rounded-xl border border-red-200/80 bg-red-50/90 px-3 py-2 text-xs font-bold leading-relaxed text-red-900">
            화재·누수·감전 의심 등 긴급 상황입니다. 요청 내용과 현장 사진을 남긴 뒤 곧바로 요청해 주세요.
          </p>
        ) : null}
        {showPricingAfterSubmit ? (
          <>
            <p className={cn("mt-2 text-sm", isEmergency ? "text-red-950/90" : "text-slate-700")}>
              접수 후 기본 출장비 {prepaymentAmount.toLocaleString("ko-KR")}원을 먼저 결제해 주세요.
            </p>
            <p className={cn("mt-1 text-xs", isEmergency ? "text-red-800/80" : "text-slate-600")}>{feeGuide}</p>
          </>
        ) : null}
      </section>

      {flowStatus === "draft" ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between text-xs font-bold text-slate-500">
            <span>진행 단계</span>
            <span>1/3 · 기본 정보 입력</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full w-1/3 rounded-full bg-gradient-to-r from-dk-navy to-dk-blue" />
          </div>
        </section>
      ) : null}

      <section className="surface-card rounded-2xl p-4">
        <p className={cn("text-sm font-black", isEmergency ? "text-red-950" : "text-slate-900")}>
          {requestInfo[requestType].title} 요청 내용{" "}
          <span className={cn("text-sm font-bold", isEmergency ? "text-red-600" : "text-rose-600")}>(필수 · 2자 이상)</span>
        </p>
        <textarea
          value={requestDetailText}
          onChange={(e) => setRequestDetailText(e.target.value.slice(0, 500))}
          disabled={showPricingAfterSubmit}
          placeholder="증상·희망 일정 등 접수 시 전달할 내용을 적어 주세요. (필수, 2자 이상)"
          rows={4}
          className="soft-input mt-2 w-full resize-y text-sm disabled:bg-slate-100 disabled:text-slate-500"
        />
        <p className={cn("mt-3 text-sm font-black", isEmergency ? "text-red-950" : "text-slate-900")}>
          사진 첨부{" "}
          <span className={cn("text-sm font-bold", isEmergency ? "text-red-600" : "text-rose-600")}>(필수 · 1장 이상, 최대 5장)</span>
        </p>
        <p className={cn("mt-0.5 text-xs", isEmergency ? "text-red-800/75" : "text-slate-500")}>
          {isEmergency
            ? "슬롯을 누른 뒤 촬영하거나 갤러리에서 선택하세요. 긴급출동 요청 전에 반드시 첨부해 주세요."
            : "슬롯을 누른 뒤 촬영하거나 갤러리에서 선택하세요. 예약 일시 선택 전에 반드시 첨부해 주세요."}
        </p>
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          tabIndex={-1}
          onChange={commitPendingSlotFile}
        />
        <input
          ref={galleryInputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          tabIndex={-1}
          onChange={commitPendingSlotFile}
        />
        <div className="mt-3 grid w-full grid-cols-[repeat(5,minmax(0,1fr))] gap-1.5 sm:gap-2">
          {photoSlots.map((file, index) => {
            const url = photoPreviewUrls[index];
            return (
              <div key={index} className="relative min-h-0 min-w-0 aspect-square">
                <button
                  type="button"
                  disabled={showPricingAfterSubmit}
                  onClick={() => {
                    if (showPricingAfterSubmit) return;
                    setPickerSlot(index);
                  }}
                  className={cn(
                    "flex h-full min-h-0 w-full min-w-0 touch-manipulation flex-col items-center justify-center overflow-hidden rounded-lg border border-dashed text-[10px] font-semibold leading-tight transition-colors sm:rounded-xl sm:border-2 sm:text-xs disabled:cursor-not-allowed disabled:opacity-50",
                    file
                      ? "border-transparent p-px sm:p-0.5"
                      : isEmergency
                        ? "border-red-300/90 bg-red-50/90 text-red-800 hover:border-red-500 hover:bg-amber-50/90"
                        : "border-slate-300 bg-slate-50/80 text-slate-500 hover:border-slate-400 hover:bg-slate-100"
                  )}
                >
                  {url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- blob: preview URLs
                    <img src={url} alt="첨부 미리보기" className="h-full w-full min-h-0 min-w-0 rounded-md object-cover sm:rounded-lg" />
                  ) : (
                    <span className="max-w-full px-0.5 text-center [word-break:keep-all]">
                      사진
                      <br />
                      {index + 1}
                    </span>
                  )}
                </button>
                {file && !showPricingAfterSubmit ? (
                  <button
                    type="button"
                    aria-label="첨부 삭제"
                    onClick={(e) => {
                      e.stopPropagation();
                      clearPhotoSlot(index);
                    }}
                    className={cn(
                      "absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-white shadow-md touch-manipulation",
                      isEmergency ? "bg-red-800" : "bg-slate-900"
                    )}
                  >
                    ×
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
        {pickerSlot !== null ? (
          <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-labelledby="photo-picker-title">
            <button type="button" className="absolute inset-0 bg-black/45" aria-label="닫기" onClick={() => setPickerSlot(null)} />
            <div className="relative z-10 mb-0 w-full max-w-sm rounded-t-2xl border border-slate-200 bg-white p-4 shadow-xl sm:mb-0 sm:rounded-2xl">
              <p id="photo-picker-title" className={cn("text-center text-sm font-black", isEmergency ? "text-red-950" : "text-slate-900")}>
                사진 {pickerSlot + 1} 입력
              </p>
              <p className={cn("mt-1 text-center text-xs", isEmergency ? "text-red-800/80" : "text-slate-500")}>직접 촬영하거나 갤러리에서 고르세요.</p>
              <div className="mt-4 grid gap-2">
                <button
                  type="button"
                  onClick={triggerCameraForPendingSlot}
                  className={cn(
                    "h-12 rounded-xl text-sm font-extrabold text-white touch-manipulation",
                    isEmergency ? "bg-gradient-to-r from-red-700 to-orange-600 shadow-md shadow-red-500/30" : "bg-dk-navy"
                  )}
                >
                  사진 촬영
                </button>
                <button
                  type="button"
                  onClick={triggerGalleryForPendingSlot}
                  className={cn(
                    "h-12 rounded-xl border-2 bg-white text-sm font-extrabold touch-manipulation",
                    isEmergency ? "border-red-300 text-red-950" : "border-slate-300 text-slate-800"
                  )}
                >
                  사진 선택
                </button>
                <button type="button" onClick={() => setPickerSlot(null)} className="h-11 rounded-xl text-sm font-bold text-slate-600 touch-manipulation">
                  취소
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </section>

      <section className="surface-card rounded-2xl p-4">
        <p className={cn("text-sm font-black", isEmergency ? "text-red-950" : "text-slate-900")}>접수 정보</p>
        <div className={cn("mt-2 grid grid-cols-2 gap-2 text-sm", isEmergency ? "text-red-900" : "text-slate-700")}>
          <p className={cn("rounded-lg px-3 py-2", isEmergency ? "border border-red-100 bg-red-50/80" : "bg-slate-50")}>동: {dong || "-"}</p>
          <p className={cn("rounded-lg px-3 py-2", isEmergency ? "border border-red-100 bg-red-50/80" : "bg-slate-50")}>호수: {ho || "-"}</p>
          <p className={cn("rounded-lg px-3 py-2", isEmergency ? "border border-red-100 bg-red-50/80" : "bg-slate-50")}>성명: {residentName || "-"}</p>
          <p className={cn("rounded-lg px-3 py-2", isEmergency ? "border border-red-100 bg-red-50/80" : "bg-slate-50")}>연락처: {residentPhone || "-"}</p>
        </div>
        {!reservationId ? (
          <>
            <button
              type="button"
              onClick={() => {
                if (requestType === "emergency") void submitEmergencyRequest();
                else openScheduleModal();
              }}
              disabled={loading || !hasRequiredInfo}
              className="btn-primary mt-4 h-16 w-full text-lg font-extrabold disabled:opacity-50"
            >
              {loading ? "접수 중..." : scheduleSelectButtonLabel}
            </button>
            {!loading && hasRequiredInfo && schedulePrereqHint && !canOpenSchedule ? (
              <p
                className={cn(
                  "mt-2 rounded-lg border px-3 py-2.5 text-xs leading-relaxed",
                  isEmergency ? "border-red-300 bg-red-50 text-red-950" : "border-amber-300 bg-amber-50 text-amber-950"
                )}
              >
                요청 내용(2자 이상)과 현장 사진(1장 이상)을 모두 입력한 뒤 &quot;{scheduleSelectButtonLabel}&quot;을 눌러 주세요.
              </p>
            ) : null}
          </>
        ) : null}
        {scheduleModalOpen && requestType !== "emergency" ? (
          <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-labelledby="schedule-modal-title">
            <button type="button" className="absolute inset-0 bg-black/45" aria-label="닫기" onClick={() => !loading && setScheduleModalOpen(false)} />
            <div className="relative z-10 mb-0 w-full max-w-md rounded-t-2xl border border-slate-200 bg-white p-4 shadow-xl sm:mb-0 sm:rounded-2xl">
              <p id="schedule-modal-title" className="text-center text-base font-black text-slate-900">
                방문 희망 일시
              </p>
              <p className="mt-1 text-center text-xs text-slate-500">날짜와 시간을 선택한 뒤 접수합니다.</p>
              <div className="mt-4 space-y-3">
                <div>
                  <span className="text-xs font-semibold text-slate-700">희망 날짜</span>
                  <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50/80 p-2">
                    <div className="mb-2 flex items-center justify-between gap-2 px-1">
                      <button
                        type="button"
                        disabled={loading || !canGoSchedulePrevMonth}
                        onClick={() => bumpScheduleMonth(-1)}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-sm font-bold text-slate-700 disabled:opacity-40"
                        aria-label="이전 달"
                      >
                        ‹
                      </button>
                      <span className="min-w-0 flex-1 text-center text-sm font-black text-slate-900">{scheduleMonthLabel}</span>
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => bumpScheduleMonth(1)}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-sm font-bold text-slate-700 disabled:opacity-40"
                        aria-label="다음 달"
                      >
                        ›
                      </button>
                    </div>
                    <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] font-semibold text-slate-500 sm:text-[11px]">
                      {["일", "월", "화", "수", "목", "금", "토"].map((w) => (
                        <span key={w} className="py-1">
                          {w}
                        </span>
                      ))}
                    </div>
                    <div className="mt-1 space-y-0.5">
                      {scheduleCalendarGrid.map((row, ri) => (
                        <div key={ri} className="grid grid-cols-7 gap-0.5">
                          {row.map((cell, ci) =>
                            cell.kind === "blank" ? (
                              <span key={`b-${ri}-${ci}`} className="aspect-square min-h-[2.25rem] sm:min-h-[2.5rem]" />
                            ) : (
                              <button
                                key={`d-${cell.day}`}
                                type="button"
                                disabled={loading || cell.disabled}
                                onClick={() => {
                                  const dt = cell.date;
                                  const ymd = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
                                  setDraftPreferredDate(ymd);
                                }}
                                className={`aspect-square min-h-[2.25rem] rounded-lg text-xs font-bold transition-colors sm:min-h-[2.5rem] sm:text-sm ${
                                  cell.disabled
                                    ? "cursor-not-allowed text-slate-300"
                                    : draftPreferredDate ===
                                        `${cell.date.getFullYear()}-${String(cell.date.getMonth() + 1).padStart(2, "0")}-${String(cell.date.getDate()).padStart(2, "0")}`
                                      ? "bg-dk-navy text-white shadow-inner"
                                      : "bg-white text-slate-800 hover:bg-slate-100"
                                }`}
                              >
                                {cell.day}
                              </button>
                            )
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                  {selectedDateLabel ? (
                    <p className="mt-2 text-center text-[11px] text-slate-600">선택: {selectedDateLabel}</p>
                  ) : null}
                </div>
                <div className="block">
                  <span className="text-xs font-semibold text-slate-700">희망 시간</span>
                  <input
                    ref={scheduleTimeInputRef}
                    id="schedule-time-input"
                    type="time"
                    step={900}
                    value={draftPreferredTime}
                    disabled={loading}
                    onChange={(e) => setDraftPreferredTime(e.target.value)}
                    className="sr-only"
                    aria-label="희망 시간 선택"
                  />
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => openTimePicker()}
                    className="soft-input mt-1 flex w-full items-center justify-between gap-3 rounded-xl py-3.5 pl-4 pr-4 text-left transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span className="min-w-0 flex-1 text-base font-semibold leading-snug tracking-tight text-slate-900">
                      {formattedDraftTimeLabel}
                    </span>
                    <span className="shrink-0 text-[11px] font-semibold text-slate-400">변경</span>
                  </button>
                </div>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => setScheduleModalOpen(false)}
                  className="h-12 rounded-xl border-2 border-slate-300 bg-white text-sm font-bold text-slate-700"
                >
                  취소
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => void confirmScheduleAndSubmit()}
                  className="h-12 rounded-xl bg-dk-navy text-sm font-extrabold text-white"
                >
                  {loading ? "접수 중..." : "접수하기"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </section>

      {message ? (
        <p
          className={cn(
            "rounded-xl border px-3 py-2 text-sm",
            isEmergency ? "border-red-200 bg-white text-red-900" : "border-slate-200 bg-white text-slate-700"
          )}
        >
          {message}
        </p>
      ) : null}
      {orderPaymentStatus === "WAITING_FOR_DEPOSIT" ? (
        <p
          className={cn(
            "rounded-xl border px-3 py-2 text-lg font-extrabold",
            isEmergency ? "border-orange-400 bg-orange-50 text-orange-900" : "border-amber-300 bg-amber-50 text-amber-700"
          )}
        >
          입금 대기
        </p>
      ) : null}
      {taskStatus ? (
        <p className="rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-2xl font-black text-emerald-700">
          {taskStatus === "completed" ? "작업 완료" : "기사 배정 완료"}
        </p>
      ) : orderPaymentStatus === "PAID" || orderDispatchStatus === "READY" || orderDispatchStatus === "ACTIVE" ? (
        <p className="rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-2xl font-black text-emerald-700">기사 배정 중</p>
      ) : null}
      {orderTotalFinalFee !== null ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-900">
          최종 정산금액: {orderTotalFinalFee.toLocaleString("ko-KR")}원 · 최종결제상태: {orderFinalPaymentStatus}
          {orderWarrantyIssuedAt ? ` · 보증서 발급: ${new Date(orderWarrantyIssuedAt).toLocaleString("ko-KR")}` : ""}
        </div>
      ) : null}
      {flowStatus === "assigned_done" || orderFinalPaymentStatus === "REQUESTED" || orderFinalPaymentStatus === "PAID" ? (
        <section className="rounded-3xl border border-dk-blue bg-gradient-to-b from-[#eef4ff] to-white p-4">
          <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
            <p className="text-sm font-extrabold text-emerald-800">✅ 작업 완료 — 최종 정산 확인</p>
          </div>
          <p className="text-base font-black text-dk-navy">최종 정산 확인</p>
          <p className="mt-2 text-lg font-extrabold text-dk-blue">
            총 {additionalDueAmount.toLocaleString("ko-KR")}원이 추가되었습니다.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setShowSettlementDetail((prev) => !prev)}
              className="h-14 rounded-xl border border-dk-blue bg-white text-base font-black text-dk-blue"
            >
              상세내역 보기
            </button>
            <button
              type="button"
              onClick={() => {
                if (orderFinalPaymentStatus === "PENDING" || orderFinalPaymentStatus === "UNKNOWN") {
                  void requestFinalSettlement();
                  return;
                }
                if (orderFinalPaymentStatus === "REQUESTED") {
                  void requestFinalPayment();
                }
              }}
              disabled={loading || orderFinalPaymentStatus === "PAID"}
              className="h-14 rounded-xl bg-gradient-to-r from-dk-navy to-dk-blue text-base font-black text-white disabled:opacity-60"
            >
              {orderFinalPaymentStatus === "PAID" ? "보증서 발급 완료" : "결제하고 보증서 받기"}
            </button>
          </div>
          {showSettlementDetail ? (
            <p className="mt-2 rounded-xl bg-white px-3 py-2 text-sm font-semibold text-slate-700">
              예약금 결제 {prepaymentAmount.toLocaleString("ko-KR")}원 이후, 현장 점검 결과를 반영한 최종 정산입니다.
            </p>
          ) : null}
        </section>
      ) : null}
      {orderFinalPaymentStatus === "PAID" ? (
        <section className="rounded-3xl border-2 border-[#c89a2c] bg-gradient-to-b from-dk-navy to-[#123a77] p-4 text-white shadow-xl">
          <p className="text-lg font-black">🛡️ 안심 보증서가 발급되었습니다</p>
          <p className="mt-1 text-sm text-slate-100">대경 안심 전기가 디지털 기술 보증서를 보관하고 있습니다.</p>
          {warranty?.warrantyNumber ? (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <a
                href={`/api/warranties/${encodeURIComponent(warranty.warrantyNumber)}/image`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-12 items-center justify-center rounded-xl bg-white font-black text-dk-navy"
              >
                보증서 이미지
              </a>
              <a
                href={`/api/warranties/${encodeURIComponent(warranty.warrantyNumber)}/pdf`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-12 items-center justify-center rounded-xl bg-[#c89a2c] font-black text-dk-navy"
              >
                보증서 PDF
              </a>
            </div>
          ) : null}
        </section>
      ) : null}
      {serviceKickoffVisible ? (
        <section className="surface-card rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <div className="rounded-xl border border-emerald-300 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-100 text-xl">🔨</div>
              <div>
                <p className="text-base font-extrabold text-emerald-800">기사님이 배정되었습니다</p>
                <p className="text-sm text-slate-600">현장 도착 전 연락드립니다</p>
              </div>
            </div>
            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-xs font-bold text-slate-600">접수 정보</p>
              <p className="mt-1 text-sm font-semibold text-slate-800">접수번호: {reservationId || "-"}</p>
              <p className="mt-1 text-sm text-slate-600">
                배정 상태: {taskStatus ? (taskStatus === "completed" ? "작업 완료" : "배정 완료") : flowStatus === "assigned_done" ? "배정 완료" : "매칭 진행 중"}
              </p>
            </div>
            <div className="mt-3 overflow-hidden rounded-full bg-emerald-100">
              <div className="animate-pulse bg-gradient-to-r from-emerald-500 to-emerald-400 px-3 py-1 text-center text-xs font-bold text-white">
                기사님 이동 중
              </div>
            </div>
            <p className="mt-2 text-xs text-slate-500">확정 즉시 기사 정보가 자동 갱신됩니다.</p>
          </div>
        </section>
      ) : null}
      <LiveNotificationToast role="resident" phoneDigits={residentPhone} />

      {paymentPopupOpen ? (
        <div className={cn("fixed inset-0 z-50 flex items-center justify-center p-4", isEmergency ? "bg-red-950/55" : "bg-slate-950/50")}>
          <div
            className={cn(
              "w-full max-w-md rounded-2xl bg-white p-4 shadow-2xl",
              isEmergency && "border-2 border-red-500 ring-4 ring-red-500/20"
            )}
          >
            <p className={cn("text-sm font-bold", isEmergency ? "text-red-700" : "text-slate-500")}>예약금 결제 게이트웨이</p>
            <h2 className={cn("mt-1 text-xl font-extrabold", isEmergency ? "text-red-950" : "text-slate-900")}>
              {requestInfo[requestType].gatewayTitle.replace(/ 게이트웨이$/, "")}
            </h2>
            <p className={cn("mt-2 text-sm", isEmergency ? "text-red-900/90" : "text-slate-700")}>
              기본 출장비 {prepaymentAmount.toLocaleString("ko-KR")}원 입금이 확인되면 서비스가 시작됩니다.
            </p>
            <div className="mt-4">
              <DepositPaymentPanel
                apartmentName={apartment.name}
                bankInfo={apartment.bankInfo}
                depositHolderLabel={depositHolderLabel}
                virtualAccount={virtualAccount}
                loading={loading}
                disabled={!reservationId || !orderId}
                onMarkDepositDone={() => {
                  void markWaitingForDeposit();
                }}
              />
            </div>
            <button
              type="button"
              onClick={() => setPaymentPopupOpen(false)}
              disabled={loading}
              className={cn(
                "mt-2 h-12 w-full rounded-xl border text-sm font-bold disabled:opacity-50",
                isEmergency ? "border-red-200 bg-red-50/60 text-red-900" : "border-slate-300 text-slate-700"
              )}
            >
              닫기
            </button>
          </div>
        </div>
      ) : null}
    </main>
  );
}
