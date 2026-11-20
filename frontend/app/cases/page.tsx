"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, Loader2, Trash2 } from "lucide-react";

import { DemoCaseButton } from "@/components/home/start-actions";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/services/api";
import type { CaseBrief } from "@/types/api";
import { cn, formatAmount, formatDate, statusLabel } from "@/lib/utils";

const nextStep = (item: CaseBrief) =>
  item.status === "collecting"
    ? "补齐案件信息"
    : item.status === "ready"
      ? "查看案件分析"
      : "按行动步骤继续办理";

export default function CasesPage() {
  const [cases, setCases] = React.useState<CaseBrief[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [deleteTarget, setDeleteTarget] = React.useState<CaseBrief | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await api.listCases();
      setCases(result.cases);
    } catch (err) {
      setError(err instanceof Error ? err.message : "暂时无法读取案件，请稍后重试。");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.deleteCase(deleteTarget.id);
      setCases((current) => current.filter((item) => item.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除失败，请稍后重试。");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-[1180px] flex-1 px-4 py-10 sm:px-6">
        <div className="flex flex-col gap-5 border-b border-rule pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-extrabold tracking-[-0.03em] text-ink sm:text-3xl">我的案件</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
              案件与当前浏览器的匿名会话绑定，其他会话无法读取；清除浏览器数据后将无法恢复。
            </p>
          </div>
          <DemoCaseButton label="先看演示案件" variant="ghost" size="default" />
        </div>

        {error && (
          <Alert variant="danger" className="mt-5">
            {error}
          </Alert>
        )}

        {loading ? (
          <div className="flex min-h-[30vh] items-center justify-center">
            <Spinner label="正在读取案件…" />
          </div>
        ) : cases.length === 0 ? (
          <div className="mt-10 border-t border-rule pt-9">
            <p className="text-lg font-extrabold text-ink">还没有案件</p>
            <p className="mt-2 max-w-md text-sm leading-6 text-muted">
              说说遇到的欠薪情况，一次回答一个问题，整理成可用的维权材料。也可以先看一份虚构演示，了解会得到什么。
            </p>
            <p className="mt-4 text-sm text-muted">
              从上方“开始整理”新建案件，或
              <span className="mx-1 font-bold text-signal-deep">先看演示案件</span>
              熟悉流程。
            </p>
          </div>
        ) : (
          <ul className="mt-2 divide-y divide-rule">
            {cases.map((item) => (
              <li key={item.id} className="grid gap-4 py-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/case/${item.id}`}
                      className="max-w-full truncate text-base font-extrabold text-ink hover:text-signal-deep"
                    >
                      {item.title}
                    </Link>
                    <Badge
                      variant={
                        item.status === "collecting"
                          ? "warning"
                          : item.status === "ready"
                            ? "success"
                            : "default"
                      }
                    >
                      {statusLabel(item.status)}
                    </Badge>
                    {item.is_demo && <Badge variant="neutral">虚构演示</Badge>}
                  </div>

                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                    <span>{[item.city, item.district].filter(Boolean).join(" · ") || "地点待核实"}</span>
                    <span>{item.work_type || "工种待核实"}</span>
                    <span className={cn("font-bold", item.owed_amount ? "text-signal-deep" : "text-muted")}>
                      {item.owed_amount
                        ? `欠薪 ${formatAmount(item.owed_amount, item.owed_amount_approx)}`
                        : "欠薪金额待核实"}
                    </span>
                    <span>{formatDate(item.updated_at)}</span>
                  </div>

                  <div className="mt-3 flex max-w-sm items-center gap-3">
                    <span className="shrink-0 text-[11px] text-muted">信息完整度</span>
                    <Progress value={item.progress.percent} className="max-w-[180px]" />
                    <span className="shrink-0 font-mono text-[11px] font-bold text-ink">
                      {item.progress.done}/{item.progress.total}
                    </span>
                  </div>

                  <p className="mt-2 text-xs text-muted">
                    下一步：<span className="font-bold text-signal-deep">{nextStep(item)}</span>
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <Link
                    href={`/case/${item.id}`}
                    className={cn(buttonVariants({ size: "sm" }), "min-w-20")}
                  >
                    继续
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setDeleteTarget(item)}
                    aria-label={`删除案件：${item.title}`}
                    className="h-11 w-11 text-muted hover:bg-signal-wash hover:text-signal-deep"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <p className="mt-6 border-t border-rule pt-4 text-xs leading-6 text-muted">
          删除案件会同时删除聊天记录和已勾选的行动步骤，且不可恢复。
        </p>
      </main>
      <SiteFooter />

      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => (deleting ? null : setDeleteTarget(null))}
        title="删除这个案件？"
        description="案件、聊天记录和行动步骤进度都会被删除，且无法恢复。"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              取消
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleting}>
              {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
              确认删除
            </Button>
          </>
        }
      >
        <p className="text-sm font-bold text-ink">{deleteTarget?.title}</p>
      </Modal>
    </div>
  );
}