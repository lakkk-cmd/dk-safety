"use client";

import { ORDER_FULFILLMENT_STEPS, type OrderFulfillmentStepKey } from "@/lib/service-journey";

export default function FourStepFlow({ current }: { current: OrderFulfillmentStepKey }) {
  const currentIndex = ORDER_FULFILLMENT_STEPS.findIndex((step) => step.key === current);
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-2">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {ORDER_FULFILLMENT_STEPS.map((step, index) => {
          const isCurrent = step.key === current;
          const isDone = index < currentIndex;
          return (
            <div
              key={step.key}
              className={`rounded-xl px-2 py-2 text-center text-xs font-bold ${
                isCurrent
                  ? "bg-primary text-white"
                  : isDone
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-slate-100 text-slate-500"
              }`}
            >
              {step.label}
            </div>
          );
        })}
      </div>
    </div>
  );
}
