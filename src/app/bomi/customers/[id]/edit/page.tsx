"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import CustomerForm, { EMPTY_CUSTOMER_FORM, type CustomerFormValues } from "../../customer-form";

type CustomerApiShape = {
  name: string;
  phone: string;
  address: string;
  postalCode: string;
  birthDate: string | null;
  gender: string | null;
  occupation: string;
  familyNote: string;
  financialNote: string;
  memo: string;
};

export default function EditBomiCustomerPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const customerId = params.id;
  const [initial, setInitial] = useState<CustomerFormValues | null>(null);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/api/bomi/customers/${customerId}`);
        const data = (await response.json()) as { customer?: CustomerApiShape; message?: string };
        if (!response.ok || !data.customer) {
          throw new Error(data.message || "고객 정보를 불러오지 못했습니다.");
        }
        if (cancelled) return;
        const c = data.customer;
        setInitial({
          ...EMPTY_CUSTOMER_FORM,
          name: c.name,
          phone: c.phone,
          address: c.address,
          postalCode: c.postalCode,
          birthDate: c.birthDate ?? "",
          gender: c.gender ?? "",
          occupation: c.occupation,
          familyNote: c.familyNote,
          financialNote: c.financialNote,
          memo: c.memo
        });
      } catch (error) {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : "조회 실패");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [customerId]);

  const onSubmit = async (values: CustomerFormValues) => {
    const response = await fetch(`/api/bomi/customers/${customerId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values)
    });
    const data = (await response.json()) as { customer?: { id: string }; message?: string };
    if (!response.ok || !data.customer) {
      throw new Error(data.message || "수정 실패");
    }
    router.push(`/customers/${customerId}`);
  };

  if (loadError) {
    return <div className="surface-card mt-6 rounded-2xl p-6 text-sm text-rose-700">{loadError}</div>;
  }
  if (!initial) {
    return <div className="mt-6 text-sm text-slate-500">불러오는 중...</div>;
  }

  return (
    <div className="py-6">
      <CustomerForm
        initial={initial}
        onSubmit={onSubmit}
        submitLabel="저장"
        submittingLabel="저장 중..."
        kicker="고객카드 수정"
        title="고객 정보 수정"
      />
    </div>
  );
}
