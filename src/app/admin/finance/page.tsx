"use client";

import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Wallet, CheckCircle2, Clock, Building2 } from "lucide-react";
import BusinessMainAccountForm from "@/components/admin/business-main-account-form";

// 가상계좌 입금 모니터링 관리자 화면
export default function FinanceAdminPage() {
  // 실제 구현시 Supabase Realtime으로 데이터를 연동합니다.
  const [orders] = useState([
    { id: 1, apt_name: '대경아파트', unit: '101동 502호', v_account: '기업 123-456-78901', amount: 50000, status: 'PAID', time: '10:30' },
    { id: 2, apt_name: '안심단지', unit: '203동 1201호', v_account: '기업 987-654-32109', amount: 50000, status: 'PENDING', time: '11:15' },
  ]);

  return (
    <div className="space-y-6 p-6">
      <header>
        <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100">금융 / 가상계좌 관리</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">입금·가상계좌 모니터링과 사업자 주계좌(고객 입금 안내)를 관리합니다.</p>
      </header>

      {/* 1. 상단 현황 카드 (특허 기반 실시간 통계) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">오늘 입금 완료</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">12건</div>
            <p className="text-xs text-muted-foreground">금일 총 600,000원</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">입금 대기 중</CardTitle>
            <Clock className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">3건</div>
            <p className="text-xs text-muted-foreground">가상계좌 발급 후 미입금</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">관리계좌 잔액</CardTitle>
            <Wallet className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">기업 2,450,000원</div>
            <p className="text-xs text-muted-foreground">대경안심전기 주계좌</p>
          </CardContent>
        </Card>
      </div>

      {/* 2. 가상계좌 입금 모니터링 테이블 (특허 청구항 12항 로직) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Building2 className="h-5 w-5" /> 실시간 가상계좌 입금 현황
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>단지명</TableHead>
                <TableHead>동/호수</TableHead>
                <TableHead>발급 가상계좌 (기업은행)</TableHead>
                <TableHead>입금액</TableHead>
                <TableHead>상태</TableHead>
                <TableHead>요청시간</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell className="font-medium">{order.apt_name}</TableCell>
                  <TableCell>{order.unit}</TableCell>
                  <TableCell className="font-mono text-blue-600">{order.v_account}</TableCell>
                  <TableCell>{order.amount.toLocaleString()}원</TableCell>
                  <TableCell>
                    {order.status === 'PAID' ? (
                      <Badge className="bg-green-100 text-green-700">입금 완료</Badge>
                    ) : (
                      <Badge className="border-amber-300 bg-amber-50 text-amber-600">입금 대기</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-slate-500">{order.time}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <BusinessMainAccountForm />
    </div>
  );
}
