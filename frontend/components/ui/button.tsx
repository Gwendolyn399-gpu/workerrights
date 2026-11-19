import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-control text-sm font-bold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-signal/90 focus-visible:ring-offset-[3px] focus-visible:ring-offset-paper disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-ink text-surface hover:bg-signal",
        secondary: "bg-signal-wash text-signal-deep hover:bg-signal/15",
        outline: "border border-rule bg-surface text-ink hover:bg-sand",
        ghost: "text-muted hover:bg-sand hover:text-ink",
        destructive: "bg-signal text-surface hover:bg-signal-deep",
      },
      size: {
        default: "h-11 px-4",
        sm: "h-9 px-3 text-xs",
        lg: "h-12 px-5 text-[15px]",
        icon: "h-11 w-11",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  ),
);
Button.displayName = "Button";