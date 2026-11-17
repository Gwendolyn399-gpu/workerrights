import Link from "next/link";
import { HardHat } from "lucide-react";

import { cn } from "@/lib/utils";

export function BrandLogo({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <Link
      href="/"
      className={cn("group inline-flex items-center gap-2.5 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500", className)}
      aria-label="工友权益助手首页"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-900 text-white shadow-sm transition group-hover:bg-brand-800">
        <HardHat className="h-5 w-5" strokeWidth={2.2} />
      </span>
      <span className="leading-tight">
        <span className="block text-[15px] font-bold tracking-tight text-ink-900">工友权益助手</span>
        {!compact && (
          <span className="block text-[10px] font-medium uppercase tracking-[0.16em] text-ink-400">
            WorkerRights
          </span>
        )}
      </span>
    </Link>
  );
}
