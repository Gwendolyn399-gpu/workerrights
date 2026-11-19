"use client";

import Link from "next/link";
import { ArrowRight, FolderOpen } from "lucide-react";

import { BrandLogo } from "@/components/brand-logo";
import { buttonVariants } from "@/components/ui/button";
import { PressLink } from "@/components/ui/press-feedback";
import { cn } from "@/lib/utils";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-ink-200/70 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <BrandLogo />
        <nav className="hidden items-center gap-1 lg:flex" aria-label="主导航">
          <Link href="/#how" className="rounded-lg px-3 py-2 text-sm font-medium text-ink-600 transition hover:bg-ink-100 hover:text-ink-900">
            工作原理
          </Link>
          <Link href="/#scope" className="rounded-lg px-3 py-2 text-sm font-medium text-ink-600 transition hover:bg-ink-100 hover:text-ink-900">
            服务范围
          </Link>
          <Link href="/#sources" className="rounded-lg px-3 py-2 text-sm font-medium text-ink-600 transition hover:bg-ink-100 hover:text-ink-900">
            官方来源
          </Link>
          <Link href="/cases" className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-ink-600 transition hover:bg-ink-100 hover:text-ink-900">
            <FolderOpen className="h-4 w-4" />
            我的案件
          </Link>
        </nav>
        <div className="flex items-center gap-2">
          <Link
            href="/cases"
            className="rounded-lg p-2 text-ink-600 transition hover:bg-ink-100 lg:hidden"
            aria-label="我的案件"
          >
            <FolderOpen className="h-5 w-5" />
          </Link>
          <PressLink href="/#scenes" className={cn(buttonVariants({ size: "sm" }), "h-10 px-4")}>
            开始咨询
            <ArrowRight className="h-3.5 w-3.5" />
          </PressLink>
        </div>
      </div>
    </header>
  );
}
