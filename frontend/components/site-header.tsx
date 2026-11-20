"use client";

import { ArrowRight } from "lucide-react";

import { BrandLogo } from "@/components/brand-logo";
import { SiteNav } from "@/components/site-nav";
import { buttonVariants } from "@/components/ui/button";
import { PressLink } from "@/components/ui/press-feedback";
import { cn } from "@/lib/utils";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-ink-200/70 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <BrandLogo />
        <SiteNav />
        <div className="flex items-center gap-2">
          <PressLink href="/#scenes" className={cn(buttonVariants({ size: "sm" }), "h-10 px-4")}>
            开始咨询
            <ArrowRight className="h-3.5 w-3.5" />
          </PressLink>
        </div>
      </div>
    </header>
  );
}
