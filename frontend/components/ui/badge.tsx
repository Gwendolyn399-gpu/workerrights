import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-control px-1.5 py-0.5 text-[11px] font-bold leading-4 whitespace-nowrap",
  {
    variants: {
      variant: {
        default: "bg-signal-wash text-signal-deep",
        neutral: "bg-sand text-muted",
        success: "bg-field-wash text-field",
        warning: "bg-note-wash text-note",
        danger: "bg-signal-wash text-signal-deep",
        accent: "bg-note-wash text-note",
        dark: "bg-ink text-surface",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}