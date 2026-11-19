"use client";

import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

export function Checkbox({
  checked,
  onChange,
  label,
  description,
  disabled,
  className,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "flex min-h-[44px] w-full items-start gap-2.5 rounded-control px-2 py-2 text-left transition hover:bg-sand focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-signal/90 focus-visible:ring-offset-[3px] focus-visible:ring-offset-paper disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-control border transition",
          checked ? "border-ink bg-ink text-surface" : "border-ink-300 bg-surface text-transparent",
        )}
      >
        <Check className="h-3 w-3" strokeWidth={3} />
      </span>
      <span className="min-w-0">
        <span className="block text-sm text-ink">{label}</span>
        {description && <span className="mt-0.5 block text-xs leading-5 text-muted">{description}</span>}
      </span>
    </button>
  );
}