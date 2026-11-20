import Link from "next/link";

import { BrandLogo } from "@/components/brand-logo";
import { StartCaseButton } from "@/components/home/start-actions";
import { buttonVariants } from "@/components/ui/button";

export function SiteHeader({ startHref }: { startHref?: string } = {}) {
  return (
    <header className="sticky top-0 z-40 border-b border-rule bg-paper">
      <div className="mx-auto flex h-16 max-w-[1180px] items-center justify-between gap-4 px-4 sm:px-6">
        <BrandLogo />
        <div className="flex items-center gap-2">
          <Link
            href="/cases"
            className="hidden rounded-control px-3 py-2 text-sm font-bold text-muted transition hover:bg-sand hover:text-ink sm:inline-flex"
          >
            我的案件
          </Link>
          {startHref ? (
            <a href={startHref} className={buttonVariants()}>开始整理</a>
          ) : (
            <StartCaseButton size="default" showArrow={false}>
              开始整理
            </StartCaseButton>
          )}
        </div>
      </div>
    </header>
  );
}