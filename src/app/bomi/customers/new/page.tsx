"use client";

import { useRouter } from "next/navigation";
import CustomerForm, { EMPTY_CUSTOMER_FORM, type CustomerFormValues } from "../customer-form";

export default function NewBomiCustomerPage() {
  const router = useRouter();

  const onSubmit = async (values: CustomerFormValues) => {
    const response = await fetch("/api/bomi/customers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values)
    });
    const data = (await response.json()) as { customer?: { id: string }; message?: string };
    if (!response.ok || !data.customer) {
      throw new Error(data.message || "등록 실패");
    }
    router.push(`/customers/${data.customer.id}`);
  };

  return (
    <div className="py-6">
      <CustomerForm
        initial={EMPTY_CUSTOMER_FORM}
        onSubmit={onSubmit}
        submitLabel="등록"
        submittingLabel="등록 중..."
        kicker="고객카드"
        title="새 고객 등록"
      />
    </div>
  );
}
