"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, ClipboardList, FileText, MessageSquareText, Plus, Route } from "lucide-react";

import { useCase } from "@/components/case/case-provider";
import { StartCaseButton } from "@/components/home/start-actions";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { caseDisplayTitle } from "@/lib/case-title";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "", label: "对话", icon: MessageSquareText },
  { href: "/analysis", label: "案件分析", icon: ClipboardList },
  { href: "/action-plan", label: "行动步骤", icon: Route },
  { href: "/form-assistant", label: "填报参考", icon: FileText },
];

export function CaseShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { caseId, caseData, loading, error } = useCase();
  const base = `/case/${caseId}`;
  const analysisRoute = pathname.endsWith("/analysis");
  const actionRoute = pathname.endsWith("/action-plan");

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner label="正在读取案件…" />
      </div>
    );
  }

  if (error || !caseData) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="text-xl font-extrabold text-ink">无法打开这个案件</h1>
        <p className="max-w-md text-sm leading-6 text-muted">
          {error || "案件不存在或无权访问。案件只对创建它的本浏览器会话可见。"}
        </p>
        <div className="flex gap-3">
          <Link
            href="/cases"
            className="rounded-control border border-rule bg-surface px-4 py-2 text-sm font-bold text-ink hover:bg-sand"
          >
            查看我的案件
          </Link>
          <Link
            href="/"
            className="rounded-control bg-ink px-4 py-2 text-sm font-bold text-surface hover:bg-signal"
          >
            返回首页
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-20 lg:pb-0">
      <header className="sticky top-0 z-40 border-b border-rule bg-paper">
        <div className="mx-auto max-w-[1180px] px-4 sm:px-6">
          <div className="flex h-16 items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <Link
                href="/cases"
                className="flex shrink-0 items-center gap-1 rounded-control px-1.5 py-1.5 text-sm text-muted transition hover:bg-sand hover:text-ink"
                aria-label="返回我的案件"
              >
                <ArrowLeft className="h-4 w-4" />
                <span className="hidden sm:inline">我的案件</span>
              </Link>
              <div className="flex min-w-0 items-center gap-2">
                <h1 className="truncate text-sm font-extrabold text-ink sm:text-base">{caseDisplayTitle(caseData)}</h1>
                {caseData.is_demo && <Badge variant="neutral">虚构演示</Badge>}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-4">
              <div className="hidden items-center gap-4 sm:flex">
                {!actionRoute && (
                  <div className="text-right">
                    <p className="text-xs leading-4 text-muted">{caseData.intake.confirmed ? "信息已核对" : caseData.progress.done === caseData.progress.total ? "核心已够，待核对" : "信息完整度"}</p>
                    <p className="font-mono text-xs font-bold leading-4 text-ink">
                      {caseData.progress.done} / {caseData.progress.total}
                    </p>
                  </div>
                )}
                {!analysisRoute && (
                  <div className="text-right">
                    <p className="text-xs leading-4 text-muted">办理进度</p>
                    <p className="font-mono text-xs font-bold leading-4 text-signal-deep">
                      {caseData.step_progress.done} / {caseData.step_progress.total}
                    </p>
                  </div>
                )}
              </div>
              <StartCaseButton variant="outline" size="default" showArrow={false}>
                <Plus className="h-3.5 w-3.5" />
                新建
              </StartCaseButton>
            </div>
          </div>

          <nav className="no-scrollbar -mb-px hidden gap-1 overflow-x-auto lg:flex" aria-label="案件工作台导航">
            {tabs.map((tab) => {
              const href = `${base}${tab.href}`;
              const active = tab.href === "" ? pathname === base : pathname.startsWith(href);
              return (
                <Link
                  key={tab.href}
                  href={href}
                  className={cn(
                    "shrink-0 border-b-2 px-3 py-2.5 text-sm font-bold transition",
                    active
                      ? "border-signal text-ink"
                      : "border-transparent text-muted hover:text-ink",
                  )}
                >
                  {tab.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      {caseData.is_demo && (
        <div className="border-b border-rule bg-sand">
          <p className="mx-auto max-w-[1180px] px-4 py-1.5 text-xs text-muted sm:px-6">
            虚构演示：人物、项目、公司名称均为虚构，仅用于体验流程。
          </p>
        </div>
      )}

      <main className="mx-auto max-w-[1180px] px-4 py-5 sm:px-6">{children}</main>

      <footer className="mx-auto max-w-[1180px] px-4 pb-8 pt-2 text-xs leading-6 text-muted sm:px-6">
        内容仅供参考，重要信息请核实。需要专业帮助可拨打 12348。
      </footer>

      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-rule bg-surface px-2 pt-1 lg:hidden" aria-label="案件工作台导航">
        <div className="mx-auto flex max-w-lg items-center justify-around">
          {tabs.map((tab) => {
            const href = `${base}${tab.href}`;
            const active = tab.href === "" ? pathname === base : pathname.startsWith(href);
            const Icon = tab.icon;
            return (
              <Link
                key={tab.href}
                href={href}
                className={cn(
                  "flex min-w-16 flex-col items-center gap-0.5 rounded-control px-3 py-1.5 text-[11px] font-bold transition",
                  active ? "text-signal-deep" : "text-muted",
                )}
              >
                <Icon className="h-5 w-5" />
                {tab.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}