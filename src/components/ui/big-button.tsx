import * as React from "react";
import { cn } from "@/lib/utils";

type BigButtonVariant = "primary" | "secondary" | "danger" | "ghost";

export interface BigButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: BigButtonVariant;
  icon?: React.ReactNode;
  fullWidth?: boolean;
}

const variantClass: Record<BigButtonVariant, string> = {
  primary: "bg-dk-blue text-white shadow-[0_8px_20px_rgba(26,92,255,0.28)] hover:brightness-105 active:brightness-95",
  secondary: "border-2 border-dk-navy bg-white text-dk-navy hover:bg-dk-sky",
  danger: "bg-dk-red text-white shadow-[0_8px_20px_rgba(229,62,62,0.28)] hover:brightness-105 active:brightness-95",
  ghost: "bg-transparent text-dk-navy hover:bg-dk-gray"
};

const BigButton = React.forwardRef<HTMLButtonElement, BigButtonProps>(
  ({ className, variant = "primary", icon, fullWidth = true, type = "button", children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        type={type}
        className={cn(
          "inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl px-5 text-base font-bold tracking-[-0.01em] transition disabled:pointer-events-none disabled:opacity-50",
          fullWidth && "w-full",
          variantClass[variant],
          className
        )}
        {...props}
      >
        {icon ? <span className="text-xl leading-none">{icon}</span> : null}
        <span>{children}</span>
      </button>
    );
  }
);
BigButton.displayName = "BigButton";

export { BigButton };
