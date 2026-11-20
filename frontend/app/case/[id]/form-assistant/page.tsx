"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, CheckCircle2, Download, ExternalLink, Loader2 } from "lucide-react";

import { useCase } from "@/components/case/case-provider";
import { StaleResultNotice } from "@/components/case/stale-result-notice";
import { CopyButton } from "@/components/ui/copy-button";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/services/api";
import type { FormAssistantResponse, FormField } from "@/types/api";
import { cn } from "@/lib/utils";

const statusStyle: Record<FormField["status"], { label: string; variant: "success" | "warning" | "neutral" }> = {
  ready: { label: "可参考", variant: "success" },
  missing: { label: "待补充", variant: "warning" },
  verify: { label: "需核对", variant: "warning" },
  official_only: { label: "仅官方填写", variant: "neutral" },
};

export default function FormAssistantPage() {
  const { caseId } = useCase();
  const [data, setData] = React.useState<FormAssistantResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [activeStep, setActiveStep] = React.useState(0);
  const [attempt, setAttempt] = React.useState(0);
  const [exporting, setExporting] = React.useState<"docx" | "pdf" | null>(null);
  const [actionError, setActionError] = React.useState("");
  const stepHeading = React.useRef<HTMLHeadingElement>(null);
  const focusStep = React.useRef(false);

  React.useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setActionError("");
    setActiveStep(0);
    focusStep.current = false;
    api.getFormAssistant(caseId)
      .then((result) => { if (active) setData(result); })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : "无法生成填报参考。");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [caseId, attempt]);

  React.useEffect(() => {
    if (!focusStep.current || !stepHeading.current) return;
    focusStep.current = false;
    stepHeading.current.focus({ preventScroll: true });
    stepHeading.current.scrollIntoView({ block: "start", behavior: "instant" });
  }, [activeStep]);

  const changeStep = (index: number) => {
    if (index === activeStep) return;
    focusStep.current = true;
    setActiveStep(index);
  };

  const download = async (format: "docx" | "pdf") => {
    setExporting(format);
    setActionError("");
    try {
      await api.downloadExport(caseId, format);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "导出失败，请重试。");
    } finally {
      setExporting(null);
    }
  };

  if (loading) {
    return <div className="flex min-h-[50vh] items-center justify-center"><Spinner label="正在整理填报参考…" /></div>;
  }

  if (error || !data) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-extrabold text-ink">填报参考</h1>
        <Alert variant="danger" title="无法生成填报参考">{error || "请稍后重试。"}</Alert>
        <Button variant="outline" onClick={() => setAttempt((value) => value + 1)}>重新加载</Button>
      </div>
    );
  }

  const step = data.steps[activeStep];
  const fields = data.steps.flatMap((item) => item.fields);
  const readyFields = fields.filter((field) => field.status === "ready").length;
  const officialFields = fields.filter((field) => field.status === "official_only").length;
  const lastStep = activeStep === data.steps.length - 1;

  return (
    <div className="space-y-6 pb-24 text-base leading-7 text-ink lg:pb-10" data-form-assistant>
      <StaleResultNotice generatedFromRevision={data.generated_from_revision} />
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">填报参考</h1>
        <p className="mt-3 max-w-[36em]">本人去官方平台填写，本产品不登录、不代填、不自动提交。</p>
        <p className="mt-1 max-w-[36em] text-muted">参考常见填报顺序整理，具体以官方页面为准</p>
        <p className="mt-3 text-xs leading-5 text-muted" data-field-progress>
          填报准备：共 {fields.length} 个字段，{readyFields} 项可参考，{officialFields} 项仅由本人在官方填写；其余请补充或核对。
        </p>
      </header>

      {data.preliminary && (
        <Alert variant="warning" title="案件信息尚未确认" action={
          <Link href={`/case/${caseId}`} className="inline-flex min-h-11 shrink-0 items-center text-sm font-bold text-note underline underline-offset-4">返回对话</Link>
        }><span className="text-base leading-7">{data.preliminary_note}</span></Alert>
      )}

      <div className="flex flex-wrap gap-2" aria-label="带走参考材料">
        <CopyButton text={data.copy_summary} label="复制全部字段" />
        {(["docx", "pdf"] as const).map((format) => (
          <Button key={format} variant="outline" onClick={() => download(format)} disabled={Boolean(exporting)}>
            {exporting === format ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Download aria-hidden="true" className="h-4 w-4" />}
            {format.toUpperCase()}
          </Button>
        ))}
      </div>
      {actionError && <div role="alert"><Alert variant="danger"><span className="text-base">{actionError} 请重试下载。</span></Alert></div>}

      <div className="grid min-w-0 gap-6 border-t border-rule pt-6 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-10">
        <div className="min-w-0">
          <div className="lg:hidden">
            <label htmlFor="form-step-select" className="mb-2 block text-sm font-bold">选择填报步骤</label>
            <select id="form-step-select" value={activeStep} onChange={(event) => changeStep(Number(event.target.value))}
              className="min-h-11 w-full min-w-0 rounded-control border border-rule bg-surface px-3 text-base text-ink focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-signal">
              {data.steps.map((item, index) => <option key={item.id} value={index}>{index + 1}. {item.title}</option>)}
            </select>
          </div>
          <nav aria-label="填报参考步骤" className="hidden lg:block">
            <ol className="space-y-1">
              {data.steps.map((item, index) => (
                <li key={item.id}>
                  <button type="button" data-step-index={index} aria-current={activeStep === index ? "step" : undefined}
                    onClick={() => changeStep(index)}
                    className={cn("flex min-h-11 w-full items-start gap-3 rounded-control border px-3 py-3 text-left focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-signal",
                      activeStep === index ? "border-rule bg-surface font-bold text-signal-deep" : "border-transparent text-muted hover:bg-sand hover:text-ink")}>
                    <span className="tabular-nums">{index + 1}.</span>
                    <span className="min-w-0">{item.title}<span className="mt-1 block text-xs font-normal text-muted">{item.fields.length ? `${item.fields.length} 个字段` : "操作说明"}</span></span>
                  </button>
                </li>
              ))}
            </ol>
          </nav>
        </div>

        <div className="min-w-0 space-y-8">
          {step ? (
            <section aria-labelledby="form-step-heading" data-current-step={activeStep + 1} data-step-count={data.steps.length}>
              <h2 ref={stepHeading} tabIndex={-1} id="form-step-heading"
                className="scroll-mt-24 rounded-control text-xl font-extrabold leading-8 focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-4 focus-visible:outline-signal lg:scroll-mt-32">{step.title}</h2>
              <p className="mt-1 text-xs font-bold tabular-nums text-muted" aria-live="polite" data-step-progress>第 {activeStep + 1} 步 / 共 {data.steps.length} 步</p>
              <p className="mt-3 max-w-[36em] text-muted">{step.goal}</p>

              {activeStep === 0 && (
                <div className="mt-5 space-y-3 rounded-card border border-rule bg-surface p-4" data-official-entry>
                  <p className="font-bold">{data.platform.name}</p>
                  <Badge variant="warning" className="text-xs" data-verification-status={data.platform.verification_status}>
                    {data.platform.verification_status === "pending" ? "入口待核验（pending）" : `入口核验状态：${data.platform.verification_status}`}
                  </Badge>
                  <p>当前链接为人社部机构首页，不是核验过的直接办理页。</p>
                  <p className="text-muted">{data.platform.access_note}</p>
                  <p className="text-muted">{data.platform.source_note}</p>
                  <a href={data.platform.official_url} target="_blank" rel="noreferrer noopener" className={cn(buttonVariants(), "min-h-11 max-w-full whitespace-normal text-center")}>
                    去官方平台（本人提交）<ExternalLink aria-hidden="true" className="h-4 w-4 shrink-0" />
                  </a>
                  <p className="text-muted">入口不清楚时，可拨打 12333 咨询办理渠道，或拨打 12348 咨询法律问题。</p>
                </div>
              )}

              {step.tips.length > 0 && (
                <details className="mt-4 border-y border-rule py-1">
                  <summary className="min-h-11 cursor-pointer py-2 font-bold focus-visible:outline focus-visible:outline-signal">本步填写提醒（{step.tips.length} 条）</summary>
                  <ul className="mb-3 list-disc space-y-2 pl-5 text-muted">{step.tips.map((tip) => <li key={tip}>{tip}</li>)}</ul>
                </details>
              )}
              {step.fields.length > 0 && <div className="mt-5 space-y-4">{step.fields.map((field) => <FormFieldRow key={field.key} field={field} />)}</div>}

              {lastStep && (
                <div className="mt-5 space-y-4">
                  <div className="rounded-card border border-rule bg-surface p-4">
                    <h3 className="text-lg font-bold">提交前最后核对</h3>
                    <ul className="mt-3 space-y-3">
                      {[
                        "姓名、手机号和身份证号由你本人在官方平台填写",
                        "项目所在地、项目名称和欠薪金额已核对",
                        "证据图片清晰、能打开，且没有发给陌生人",
                        "保存提交成功页面、查询码或受理编号",
                      ].map((item) => <li key={item} className="flex gap-2"><CheckCircle2 aria-hidden="true" className="mt-1.5 h-4 w-4 shrink-0 text-field" /><span>{item}</span></li>)}
                    </ul>
                  </div>
                  <details className="border-y border-rule py-1">
                    <summary className="min-h-11 cursor-pointer py-2 font-bold focus-visible:outline focus-visible:outline-signal">查看全部字段参考</summary>
                    <div className="whitespace-pre-wrap break-words py-3 text-muted">{data.copy_summary}</div>
                  </details>
                </div>
              )}

              <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-rule pt-4" data-step-actions>
                <Button variant="outline" disabled={activeStep === 0} onClick={() => changeStep(activeStep - 1)}><ArrowLeft aria-hidden="true" className="h-4 w-4" />上一步</Button>
                {!lastStep ? (
                  <Button onClick={() => changeStep(activeStep + 1)} data-primary-action>下一步<ArrowRight aria-hidden="true" className="h-4 w-4" /></Button>
                ) : (
                  <Link href={`/case/${caseId}/action-plan`} className={buttonVariants()} data-primary-action>回到行动步骤<ArrowRight aria-hidden="true" className="h-4 w-4" /></Link>
                )}
              </div>
            </section>
          ) : <Alert variant="warning" title="暂无填报步骤">请返回对话补充案件信息后重新加载。</Alert>}

          <aside className="border-t border-rule pt-5 text-muted" aria-label="隐私说明" data-privacy-notice>
            <h2 className="text-lg font-bold text-ink">只整理参考，不收集身份资料</h2>
            <p className="mt-2">{data.privacy_notice}</p>
            <p className="mt-2">上传由本人操作，产品不保存截图或证件照片</p>
          </aside>

          <section className="border-t border-rule pt-5" aria-labelledby="statement-heading">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="statement-heading" className="text-xl font-extrabold">事实陈述参考</h2>
              <CopyButton text={data.formal_statement} label="复制陈述" />
            </div>
            <p className="mt-2 text-muted">带【】的内容需要你补充；请核对后再使用。</p>
            <details className="mt-3 rounded-card border border-rule bg-surface px-4">
              <summary className="min-h-11 cursor-pointer py-2 font-bold focus-visible:outline focus-visible:outline-signal">展开陈述全文</summary>
              <div className="whitespace-pre-wrap break-words border-t border-rule py-4" data-formal-statement>{data.formal_statement}</div>
            </details>
          </section>

          <section className="border-t border-rule pt-5" aria-labelledby="evidence-heading" data-evidence-directory>
            <h2 id="evidence-heading" className="text-xl font-extrabold">证据目录</h2>
            <p className="mt-2 text-muted">上传由本人操作，产品不保存截图或证件照片</p>
            <div className="mt-4 divide-y divide-rule rounded-card border border-rule bg-surface">
              {data.evidence_directory.map((item, index) => (
                <article key={`${item.label}-${index}`} className="min-w-0 break-words p-4" data-evidence-card>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h3 className="text-lg font-bold">{item.label}</h3>
                    <Badge className="text-xs" variant={item.status === "已有" ? "success" : item.status === "待补充" ? "warning" : "neutral"}>{item.status}</Badge>
                  </div>
                  <dl className="mt-3 grid gap-3 sm:grid-cols-2 sm:gap-6">
                    <div className="min-w-0"><dt className="text-xs font-bold text-muted">能证明什么</dt><dd className="mt-1">{item.proves}</dd></div>
                    <div className="min-w-0"><dt className="text-xs font-bold text-muted">获取方式</dt><dd className="mt-1">{item.how_to_get}</dd></div>
                  </dl>
                </article>
              ))}
              {data.evidence_directory.length === 0 && <p className="p-4 text-muted">暂无材料目录。请先在对话中补充已有材料，不要编造。</p>}
            </div>
            <p className="mt-3 text-muted">上传优先使用原始截图和带时间地点信息的照片；聊天记录保留对方身份信息与完整上下文。</p>
          </section>
          <p className="rounded-card border border-rule bg-sand p-4 text-muted">{data.submit_notice}</p>
        </div>
      </div>
    </div>
  );
}

function FormFieldRow({ field }: { field: FormField }) {
  const style = statusStyle[field.status];
  const officialOnly = field.status === "official_only";
  return (
    <article className="min-w-0 rounded-card border border-rule bg-surface p-4" data-field-key={field.key} data-field-status={field.status}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="text-lg font-bold">{field.label}{field.required && <span className="ml-2 text-xs font-normal text-signal-deep">必填</span>}</h3>
        <Badge variant={style.variant} className="text-xs">{style.label}</Badge>
      </div>
      <p className="mt-2 text-muted">{field.explanation}</p>
      <div className="mt-3 border-y border-rule py-3">
        {officialOnly ? <p className="text-muted">由本人在官方平台填写，本产品不收集此字段。</p>
          : field.value ? <p className="whitespace-pre-wrap break-words" data-field-value>{field.value}</p>
            : <p className="text-note">补充后生成参考内容。{field.placeholder}</p>}
      </div>
      {field.note && <p className="mt-3 text-muted">{field.note}</p>}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="min-w-0 break-words text-xs leading-5 text-muted">来源事实：{officialOnly ? "本人在官方平台填写" : field.source_facts.length ? field.source_facts.join("、") : "暂无已提供的来源事实"}</p>
        {!officialOnly && field.value && <CopyButton text={field.value} label="复制此字段" />}
      </div>
    </article>
  );
}
