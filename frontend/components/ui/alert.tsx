import * as React from "react";
import { AlertTriangle, CheckCircle2, Info, ShieldAlert } from "lucide-react";

import { cn } from "@/lib/utils";

const styles = {
  info: "bg-sand text-ink",
  warning: "bg-note-wash text-note",
  success: "bg-field-wash text-field",
  danger: "bg-signal-wash text-signal-deep",
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
    <div className={cn("flex gap-2.5 rounded-card px-3.5 py-3 text-sm", styles[variant], className)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        {title && <p className="font-bold">{title}</p>}
        {children && <div className={cn("leading-6", title && "mt-0.5")}>{children}</div>}
      </div>
      {action}
    </div>
  );
}