import Link from "next/link";
import { HardHat } from "lucide-react";

import { cn } from "@/lib/utils";

export function BrandLogo({ className }: { compact?: boolean; className?: string }) {
  return (
    <Link
      href="/"
      className={cn(
        "inline-flex items-center gap-2 rounded-control focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-signal/90 focus-visible:ring-offset-[3px] focus-visible:ring-offset-paper",
        className,
      )}
      aria-label="工友权益助手首页"
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-control bg-ink text-surface">
        <HardHat className="h-4 w-4" strokeWidth={2.2} />
      </span>
      <span className="text-[15px] font-bold text-ink">工友权益助手</span>
    </Link>
  );
}