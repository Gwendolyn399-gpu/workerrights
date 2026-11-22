"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  ChevronDown,
  Download,
  ExternalLink,
  Loader2,
} from "lucide-react";

import { RouteRail, type RouteStageView } from "@/components/case/route-rail";
import { useCase } from "@/components/case/case-provider";
import { StaleResultNotice } from "@/components/case/stale-result-notice";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import { getCurrentStageKey, groupActionSteps } from "@/lib/action-stages";
import { api } from "@/services/api";
import type { ActionPlanResponse, ActionStep, ChannelInfo } from "@/types/api";
import { cn, verificationLabel } from "@/lib/utils";

export default function ActionPlanPage() {
  const { caseId, setCaseData } = useCase();
  const [plan, setPlan] = React.useState<ActionPlanResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [completedStep, setCompletedStep] = React.useState<string | null>(null);
  const [pendingStep, setPendingStep] = React.useState<string | null>(null);
  const [exporting, setExporting] = React.useState<"docx" | "pdf" | null>(null);
  const [actionError, setActionError] = React.useState("");
  const [openStages, setOpenStages] = React.useState<Set<string>>(new Set());
  const [openSteps, setOpenSteps] = React.useState<Set<string>>(new Set());
  const initialized = React.useRef(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setPlan(await api.getActionPlan(caseId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "无法生成行动步骤。");
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const groups = React.useMemo(() => groupActionSteps(plan?.steps ?? []), [plan]);
  const currentStageKey = React.useMemo(() => getCurrentStageKey(groups), [groups]);
  const currentStep = plan?.steps.find((step) => !step.done) ?? null;

  React.useEffect(() => {
    if (!plan || initialized.current) return;
    initialized.current = true;
    const currentGroups = groupActionSteps(plan.steps);
    setOpenStages(new Set([getCurrentStageKey(currentGroups)]));
    const firstOpen = plan.steps.find((step) => !step.done);
    if (firstOpen) setOpenSteps(new Set([firstOpen.id]));
  }, [plan]);

  const toggleStep = async (step: ActionStep) => {
    if (pendingStep) return;
    setPendingStep(step.id);
    setActionError("");
    try {
      const updated = await api.updateStep(caseId, step.id, !step.done);
      setPlan(updated);
      setCompletedStep(step.done ? null : step.id);
      const nextStageKey = getCurrentStageKey(groupActionSteps(updated.steps));
      const nextOpenStep = updated.steps.find((item) => !item.done);
      setOpenStages(new Set([nextStageKey]));
      setOpenSteps((current) => {
        const next = new Set(current);
        if (!step.done) next.delete(step.id);
        if (nextOpenStep) next.add(nextOpenStep.id);
        return next;
      });
      setCaseData((current) =>
        current
          ? {
              ...current,
              step_progress: updated.progress,
              status: updated.case_status ?? current.status,
            }
          : current,
      );
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "更新步骤状态失败。");
    } finally {
      setPendingStep(null);
    }
  };

  const download = async (format: "docx" | "pdf") => {
    setExporting(format);
    setActionError("");
    try {
      await api.downloadExport(caseId, format);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "导出失败。");
    } finally {
      setExporting(null);
    }
  };

  const toggleStage = (key: string) => {
    setOpenStages((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleStepDetails = (id: string) => {
    setOpenSteps((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner label="正在规划办理路线…" />
      </div>
    );
  }

  if (error || !plan) {
    return (
      <Alert
        variant="danger"
        title="无法生成行动步骤"
        action={
          <Button variant="outline" className="h-11 shrink-0" onClick={() => void load()}>
            重试
          </Button>
        }
      >
        {error || "请稍后重试。"}
      </Alert>
    );
  }

  const channelsById = new Map(plan.channels.map((channel) => [channel.id, channel]));
  const primary =
    channelsById.get(plan.primary_channel_id) ??
    plan.channels.find((channel) => channel.recommended) ??
    null;
  const stageViews: RouteStageView[] = groups.map((group) => ({
    key: group.key,
    label: group.label,
    done: group.done,
    total: group.total,
    state:
      group.total > 0 && group.done === group.total
        ? "done"
        : group.key === currentStageKey
          ? "current"
          : "upcoming",
  }));
  const usedChannelIds = new Set(plan.steps.map((step) => step.channel_id).filter(Boolean));
  const otherChannels = plan.channels.filter((channel) => !usedChannelIds.has(channel.id));

  return (
    <div className="flex flex-col pb-2">
      <StaleResultNotice generatedFromRevision={plan.generated_from_revision} />
      {plan.preliminary && (
        <Alert
          variant="warning"
          title="这份行动步骤基于尚未确认的档案"
          className="order-1 mb-6 lg:order-none"
          action={
            <Link
              href={`/case/${caseId}`}
              className="inline-flex min-h-11 shrink-0 items-center text-xs font-bold underline underline-offset-4"
            >
              返回对话核对
            </Link>
          }
        >
          {plan.preliminary_note || "先把事实核对完整，步骤会更可靠。"}
        </Alert>
      )}

      <header className="order-2 border-b border-rule pb-5 sm:pb-6 lg:order-none">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 max-w-[720px]">
            <h1 className="fusion-kai text-3xl font-bold text-ink sm:text-4xl">行动步骤</h1>
            <p className="mt-2 text-base leading-7 text-ink">先做这 3 件事；有些渠道可以同时准备。</p>
            <p className="mt-1 text-[11px] leading-5 text-muted sm:text-xs">
              步骤是建议，不是法律结论；受理与材料以官方告知为准。
            </p>
            <div className="mt-3 flex max-w-sm items-center gap-3">
              <Progress value={plan.progress.percent} className="flex-1" />
              <span className="shrink-0 text-xs font-bold text-ink">
                办理进度 {plan.progress.done}/{plan.progress.total} 步
              </span>
            </div>
          </div>
          <div className="hidden shrink-0 flex-wrap gap-2 lg:flex">
            <Button
              variant="outline"
              className="h-11"
              onClick={() => download("docx")}
              disabled={Boolean(exporting)}
              aria-label="导出 DOCX 材料"
            >
              {exporting === "docx" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              DOCX
            </Button>
            <Button
              variant="outline"
              className="h-11"
              onClick={() => download("pdf")}
              disabled={Boolean(exporting)}
              aria-label="导出 PDF 材料"
            >
              {exporting === "pdf" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              PDF
            </Button>
            <Link
              href={`/case/${caseId}/form-assistant`}
              className={cn(buttonVariants({ variant: "outline", size: "default" }), "h-11 justify-center")}
            >
              填报参考
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
        {actionError && <Alert variant="danger" className="mt-4">{actionError}</Alert>}
      </header>

      <section className="order-6 mt-6 border-y border-rule py-4 lg:order-none">
        <div className="grid gap-4 lg:grid-cols-[1.05fr_1fr] lg:gap-8">
          <div>
            <p className="text-[11px] font-bold text-muted">优先渠道</p>
            {primary ? (
              <>
                <p className="mt-1 text-lg font-extrabold leading-7 text-ink">{primary.name}</p>
                <p className="mt-1 text-sm leading-6 text-ink">{primary.reason}</p>
                <ChannelVerification channel={primary} />
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  {primary.official_url ? (
                    <a
                      href={primary.official_url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className={cn(buttonVariants({ variant: "outline", size: "default" }), "h-11")}
                    >
                      官方入口（本人提交）
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  ) : (
                    <span className="text-xs font-bold text-note">官方入口待核实，先拨 12333 确认。</span>
                  )}
                  <span className="text-xs text-muted">12333 可确认受理机构</span>
                </div>
              </>
            ) : (
              <p className="mt-1 text-sm text-muted">优先渠道待核实，可以先查看下面步骤。</p>
            )}
          </div>

          <div className="border-t border-rule pt-3 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] font-bold text-muted">正式陈述（摘要）</p>
              <Link
                href={`/case/${caseId}/form-assistant`}
                className="inline-flex min-h-11 items-center text-xs font-bold text-signal-deep underline-offset-4 hover:underline"
              >
                去填报参考查看全文
              </Link>
            </div>
            <p className="line-clamp-2 text-sm leading-6 text-ink">{plan.formal_statement}</p>
            <div className="mt-3 flex gap-2 lg:hidden">
              <Button
                variant="outline"
                className="h-11"
                onClick={() => download("docx")}
                disabled={Boolean(exporting)}
                aria-label="导出 DOCX 材料"
              >
                {exporting === "docx" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                导出 DOCX
              </Button>
              <Button
                variant="outline"
                className="h-11"
                onClick={() => download("pdf")}
                disabled={Boolean(exporting)}
                aria-label="导出 PDF 材料"
              >
                {exporting === "pdf" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                导出 PDF
              </Button>
            </div>
          </div>
        </div>

        <details className="mt-3 border-l-2 border-note bg-note-wash px-3 py-2 text-xs text-note">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 font-bold [&::-webkit-details-marker]:hidden">
            办理边界与提醒（不承诺追回或胜诉）
            <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" />
          </summary>
          <ul className="mt-2 space-y-1.5">
            {plan.risks.map((risk) => (
              <li key={risk}>{risk}</li>
            ))}
          </ul>
        </details>
      </section>

      <div className="order-3 mt-4 border-b border-rule pb-4 sm:mt-6 sm:pb-5 lg:order-none">
        <RouteRail stages={stageViews} />
      </div>

      <div className="order-4 mt-4 space-y-4 sm:mt-6 lg:order-none">
        {groups
          .filter((group) => group.total > 0)
          .map((group, groupIndex) => {
            const open = openStages.has(group.key);
            const state =
              group.done === group.total
                ? "done"
                : group.key === currentStageKey
                  ? "current"
                  : "upcoming";
            return (
              <section key={group.key} id={`stage-${group.key}`} className="border-t border-rule pt-1">
                <button
                  type="button"
                  onClick={() => toggleStage(group.key)}
                  aria-expanded={open}
                  className="flex min-h-14 w-full items-start gap-3 py-3 text-left focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-signal/90"
                >
                  <span
                    className={cn(
                      "mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-sm font-extrabold",
                      state === "done"
                        ? "border-field bg-field text-surface"
                        : state === "current"
                          ? "border-signal bg-signal text-surface"
                          : "border-route text-route",
                    )}
                  >
                    {state === "done" ? <Check className="h-4 w-4" strokeWidth={3} /> : groupIndex + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-xl font-extrabold text-ink">{group.label}</span>
                      {state === "current" && <Badge variant="default">当前</Badge>}
                      {state === "done" && <Badge variant="success">已完成</Badge>}
                    </span>
                    <span className="mt-0.5 block text-sm leading-6 text-muted">{group.hint}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2 pt-1 text-xs font-bold text-muted">
                    {group.done}/{group.total}
                    <ChevronDown className={cn("h-4 w-4 transition", open && "rotate-180")} aria-hidden="true" />
                  </span>
                </button>

                {open && (
                  <ol className="pb-2">
                    {group.steps.map((step, index) => {
                      const isDone = step.done;
                      const isCurrent = step.id === currentStep?.id;
                      const channel = step.channel_id ? channelsById.get(step.channel_id) : null;
                      const stepDeadlines = deadlinesForStep(step.step_key, plan.deadlines);
                      const detailsOpen = openSteps.has(step.id);
                      return (
                        <li key={step.id} data-step-key={step.step_key} className={cn("relative pb-5 pl-10 last:pb-1", isCurrent && "fusion-current-step")}>
                          {index < group.steps.length - 1 && (
                            <span
                              aria-hidden="true"
                              className="absolute bottom-0 left-4 top-7 w-px bg-rule"
                            />
                          )}
                          <span
                            className={cn(
                              "absolute left-0 top-0 flex h-6 w-8 items-center justify-center rounded-[3px] border font-mono text-[10px] font-bold",
                              isDone
                                ? "border-field bg-field text-surface"
                                : isCurrent
                                  ? "border-signal bg-signal text-surface"
                                  : "border-route bg-surface text-route",
                            )}
                          >
                            {isDone ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : `${groupIndex + 1}.${index + 1}`}
                          </span>

                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                              {isCurrent && <p className="mb-1 text-xs font-bold text-signal-deep">现在先做</p>}
                              <h3
                                className={cn(
                                  "text-base font-bold leading-6",
                                  isDone ? "text-muted" : "text-ink",
                                )}
                              >
                                {step.title}
                              </h3>
                              {(detailsOpen || isCurrent) && (
                                <p className="mt-1 text-sm leading-6 text-ink/90">{step.why}</p>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => void toggleStep(step)}
                              disabled={pendingStep !== null}
                              className={cn(
                                "fusion-press inline-flex h-11 w-full shrink-0 items-center justify-center gap-1.5 rounded-control border px-4 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-signal/90 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto",
                                isDone
                                  ? "border-field bg-field-wash text-field"
                                  : isCurrent
                                    ? "border-ink bg-ink text-surface hover:bg-signal"
                                    : "border-rule bg-surface text-ink hover:bg-sand",
                              )}
                            >
                              {pendingStep === step.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : isDone ? (
                                <Check className={cn("h-3.5 w-3.5", completedStep === step.id && "fusion-draw-check")} />
                              ) : null}
                              {isDone ? "已完成" : "标记完成"}
                            </button>
                          </div>

                          <button
                            type="button"
                            onClick={() => toggleStepDetails(step.id)}
                            aria-expanded={detailsOpen}
                            className="mt-1 inline-flex min-h-11 items-center gap-1.5 text-xs font-bold text-signal-deep underline-offset-4 hover:underline"
                          >
                            {detailsOpen ? "收起准备内容" : "看这一步怎么做"}
                            <ChevronDown className={cn("h-3.5 w-3.5 transition", detailsOpen && "rotate-180")} />
                          </button>

                          {detailsOpen && (
                            <div className="fusion-reveal mt-2">
                              {step.prepare.length > 0 && (
                                <div>
                                  <p className="text-xs font-bold text-muted">需要准备</p>
                                  <ul className="mt-1 list-disc space-y-1 pl-5 text-sm leading-6 text-ink">
                                    {step.prepare.map((item) => (
                                      <li key={item}>{item}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}

                              {step.draft_text && (
                                <div className="mt-3 border-l-2 border-field bg-field-wash px-3 py-3">
                                  <div className="flex items-center justify-between gap-2">
                                    <p className="text-xs font-bold text-field">可复制沟通话术</p>
                                    <CopyButton text={step.draft_text} label="复制话术" compact />
                                  </div>
                                  <p className="mt-1.5 whitespace-pre-wrap text-sm leading-6 text-ink">
                                    {step.draft_text}
                                  </p>
                                </div>
                              )}

                              {(step.deadline_note || step.risk_note || stepDeadlines.length > 0) && (
                                <div className="mt-3 space-y-2">
                                  {step.deadline_note && (
                                    <p className="border-l-2 border-note bg-note-wash px-3 py-2 text-xs leading-5 text-note">
                                      期限：{step.deadline_note}
                                    </p>
                                  )}
                                  {stepDeadlines.map((deadline) => (
                                    <div
                                      key={deadline.title}
                                      className="border-l-2 border-note bg-note-wash px-3 py-2 text-xs leading-5 text-note"
                                    >
                                      <p className="font-bold">
                                        {deadline.title} · {deadline.urgency}
                                      </p>
                                      <p className="mt-0.5">{deadline.detail}</p>
                                    </div>
                                  ))}
                                  {step.risk_note && (
                                    <p className="border-l-2 border-signal bg-signal-wash px-3 py-2 text-xs leading-5 text-signal-deep">
                                      风险：{step.risk_note}
                                    </p>
                                  )}
                                </div>
                              )}

                              {channel && (
                                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-rule pt-3">
                                  <p className="text-sm font-bold text-ink">{channel.name}</p>
                                  <ChannelVerification channel={channel} />
                                  {channel.official_url ? (
                                    <a
                                      href={channel.official_url}
                                      target="_blank"
                                      rel="noreferrer noopener"
                                      className="inline-flex min-h-11 items-center gap-1 text-xs font-bold text-signal-deep underline-offset-4 hover:underline"
                                    >
                                      官方入口
                                      <ExternalLink className="h-3 w-3" />
                                    </a>
                                  ) : (
                                    <span className="text-xs text-note">入口待核实，先拨 12333。</span>
                                  )}
                                  {channel.access_note && (
                                    <span className="text-xs leading-5 text-muted">{channel.access_note}</span>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ol>
                )}
              </section>
            );
          })}
      </div>

      {otherChannels.length > 0 && (
        <section className="order-7 mt-8 border-t border-rule pt-6 lg:order-none">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 className="text-xl font-extrabold text-ink">还可以咨询</h2>
            <p className="text-xs leading-5 text-muted">
              不在上面 {plan.progress.total} 步中，可并行了解；入口以官方页面为准。
            </p>
          </div>
          <ul className="mt-4 grid divide-y divide-rule border-y border-rule md:grid-cols-3 md:divide-y-0 md:border-y-0">
            {otherChannels.map((channel, index) => (
              <li
                key={channel.id}
                className={cn(
                  "flex flex-col gap-2 py-3 md:py-1 md:pl-5",
                  index === 0 ? "md:pl-0" : "md:border-l md:border-rule",
                )}
              >
                <div>
                  <p className="text-base font-bold leading-6 text-ink">{channel.name}</p>
                  <p className="mt-0.5 text-xs leading-5 text-muted">
                    {channelCategoryLabel(channel.category)} · {verificationLabel(channel.verification_status)}
                  </p>
                </div>
                {channel.official_url ? (
                  <a
                    href={channel.official_url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="mt-auto inline-flex min-h-9 w-fit items-center gap-1 text-xs font-bold text-signal-deep underline-offset-4 hover:underline"
                  >
                    官方入口
                    <ExternalLink className="h-3 w-3" />
                  </a>
                ) : (
                  <span className="mt-auto text-xs text-note">入口待核实</span>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] leading-5 text-muted">
            链接仅用于查找官方渠道，不代表已核验的直接办理页；具体以当地官方告知为准。
          </p>
        </section>
      )}

      <p className="order-8 mt-6 text-xs leading-6 text-muted lg:order-none">{plan.disclaimer}</p>
    </div>
  );
}

function ChannelVerification({ channel }: { channel: ChannelInfo }) {
  return (
    <div className="mt-2 basis-full text-xs leading-5 text-muted">
      <p>{verificationLabel(channel.verification_status)} · 具体受理入口以官方页面为准</p>
      {channel.source_note && <p>{channel.source_note}</p>}
      {channel.official_url && <p>链接用于查找官方渠道，不代表已核验的直接办理页。</p>}
    </div>
  );
}

function deadlinesForStep(
  stepKey: string,
  deadlines: ActionPlanResponse["deadlines"],
): ActionPlanResponse["deadlines"] {
  if (stepKey === "labor-supervision") {
    return deadlines.filter((deadline) => deadline.title.includes("监察"));
  }
  if (stepKey === "labor-arbitration") {
    return deadlines.filter((deadline) => deadline.title.includes("仲裁"));
  }
  return [];
}

const CHANNEL_CATEGORY_LABELS: Record<string, string> = {
  official_platform: "国家级线上平台",
  hotline: "服务热线",
  labor_supervision: "劳动保障监察",
  industry_authority: "行业主管部门",
  arbitration: "劳动仲裁",
  legal_aid: "法律援助",
  litigation: "司法途径",
};

function channelCategoryLabel(category: string) {
  return CHANNEL_CATEGORY_LABELS[category] || "其他渠道";
}
