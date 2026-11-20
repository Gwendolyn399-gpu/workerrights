import Link from "next/link";
import { FolderOpen } from "lucide-react";

const casesLink =
  "inline-flex h-10 items-center gap-2 rounded-full border border-ink-200/80 bg-white/70 px-4 text-sm font-semibold text-ink-600 transition hover:border-brand-200 hover:bg-brand-50 hover:text-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500";

export function SiteNav() {
  return (
    <>
      <nav aria-label="主导航" className="hidden lg:mx-auto lg:block">
        <Link href="/cases" className={casesLink}>
          <FolderOpen className="h-4 w-4" aria-hidden="true" />
          我的案件
        </Link>
      </nav>
      <Link
        href="/cases"
        aria-label="我的案件"
        className="ml-auto inline-flex h-10 w-10 items-center justify-center rounded-full border border-ink-200/80 bg-white/70 text-ink-600 transition hover:border-brand-200 hover:bg-brand-50 hover:text-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 lg:hidden"
      >
        <FolderOpen className="h-4 w-4" aria-hidden="true" />
      </Link>
    </>
  );
}
