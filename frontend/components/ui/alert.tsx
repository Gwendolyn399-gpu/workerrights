import * as React from "react";
import { AlertTriangle, CheckCircle2, Info, ShieldAlert } from "lucide-react";

import { cn } from "@/lib/utils";

const styles = {
  info: "border-brand-200 bg-brand-50/80 text-brand-950",
  warning: "border-amber-200 bg-amber-50 text-amber-950",
  success: "border-emerald-200 bg-emerald-50 text-emerald-950",
  danger: "border-red-200 bg-red-50 text-red-950",
};

const icons = {
  info: Info,
  warning: AlertTriangle,
  success: CheckCircle2,
  danger: ShieldAlert,
};

export function Alert({
  variant = "info",
  title,
  children,
  className,
  action,
}: {
  variant?: keyof typeof styles;
  title?: string;
  children?: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}) {
  const Icon = icons[variant];
  return (
    <div className={cn("flex gap-3 rounded-xl border px-4 py-3.5 text-sm", styles[variant], className)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn("leading-relaxed", title && "mt-1 opacity-90")}>{children}</div>}
      </div>
      {action}
    </div>
  );
}
