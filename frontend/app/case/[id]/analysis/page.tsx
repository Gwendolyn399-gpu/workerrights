"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, BookOpenCheck, ChevronDown, Download, Loader2 } from "lucide-react";

import { useCase } from "@/components/case/case-provider";
import { StaleResultNotice } from "@/components/case/stale-result-notice";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/services/api";
import type { AnalysisResponse, EvidenceItem, LegalAnalysisItem, RelationshipNode } from "@/types/api";
import { cn, shortDate, verificationLabel } from "@/lib/utils";

export default function AnalysisPage() {
  const { caseId } = useCase();
  const [analysis, setAnalysis] = React.useState<AnalysisResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [showAllLegal, setShowAllLegal] = React.useState(false);
  const [exporting, setExporting] = React.useState<"docx" | "pdf" | null>(null);
  const [exportError, setExportError] = React.useState("");
  const [activeTab, setActiveTab] = React.useState(0);
  const navRef = React.useRef<HTMLElement>(null);
  const tabRowRef = React.useRef<HTMLDivElement>(null);
  const jumpedRef = React.useRef(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setAnalysis(await api.getAnalysis(caseId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "无法生成案件分析。");
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useEffect(() => {
    const row = tabRowRef.current;
    const tab = row?.querySelector<HTMLElement>(`[role="tab"]:nth-child(${activeTab + 1})`);
    if (row && tab) {
      const left = tab.offsetLeft - (row.clientWidth - tab.offsetWidth) / 2;
      row.scrollTo({ left: Math.max(0, left), behavior: "smooth" });
    }
    if (jumpedRef.current) navRef.current?.scrollIntoView({ block: "start", behavior: "instant" });
  }, [activeTab]);

  const selectTab = (index: number) => {
    if (index === activeTab) return;
    jumpedRef.current = true;
    setActiveTab(index);
  };

  const download = async (format: "docx" | "pdf") => {
    setExporting(format);
    setExportError("");
    try {
      await api.downloadExport(caseId, format);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "导出失败。");
    } finally {
      setExporting(null);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner label="正在整理案件分析和法律依据…" />
      </div>
    );
  }

  if (error || !analysis) {
    return (
      <Alert
        variant="danger"
        title="无法生成分析"
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

  const legalMap = new Map(analysis.legal_analysis.map((item) => [item.id, item]));
  const visibleLegal = showAllLegal ? analysis.legal_analysis : analysis.legal_analysis.slice(0, 4);
  const conclusions = buildConclusions(analysis);
  const needed = analysis.evidence.needed.slice(0, 3);

  const riskCount = analysis.risk_flags.length;
  const modules = [
    {
      id: "conclusions",
      tab: "结论先行",
      title: "结论先行",
      description: "先看三件事：可能主张什么、现在最缺什么、先去哪里问。",
      meta: `${conclusions.length} 条`,
      content: (
        <ol>
          {conclusions.map((item, index) => (
            <li
              key={item.label}
              className="grid grid-cols-[2.2rem_1fr] gap-3 border-t border-rule py-5 first:border-t-0 first:pt-0"
            >
              <span className="font-mono text-[20px] font-extrabold leading-7 text-signal-deep">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div className="min-w-0">
                <p className="text-[11px] font-bold text-muted">{item.label}</p>
                <h3 className="mt-1 text-lg font-bold leading-6 text-ink">{item.title}</h3>
                <p className="mt-1.5 text-base leading-7 text-ink">{item.body}</p>
                {item.note && <p className="mt-1.5 text-xs leading-5 text-muted">{item.note}</p>}
              </div>
            </li>
          ))}
        </ol>
      ),
    },
    {
      id: "relationship",
      tab: "用工关系",
      title: "可能的用工关系",
      description: "根据你的陈述整理，关系图不等于责任认定。",
      meta: `${analysis.relationship.nodes.length} 方`,
      content: (
        <>
          {analysis.relationship.nodes.length > 0 ? (
            <ul className="divide-y divide-rule border-y border-rule">
              {analysis.relationship.nodes.map((node) => (
                <RelationshipRow key={node.id} node={node} />
              ))}
            </ul>
          ) : (
            <p className="border-y border-rule py-4 text-sm text-muted">
              用工关系还缺少足够信息。先补充谁招用你、谁安排日常工作、谁发工资。
            </p>
          )}
          {analysis.relationship.confirmed_notes.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs leading-5 text-muted">
              {analysis.relationship.confirmed_notes.map((note) => (
                <li key={note}>· {note}</li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs leading-5 text-muted">{analysis.relationship.disclaimer}</p>
        </>
      ),
    },
    {
      id: "evidence",
      tab: "证据情况",
      title: "证据情况",
      description: analysis.evidence.summary,
      meta: `${analysis.evidence.have.length} 项已有`,
      content: (
        <>
          {needed.length > 0 && (
            <div className="border-l-2 border-note bg-note-wash px-4 py-3">
              <p className="text-sm font-extrabold text-note">优先补充这几项</p>
              <ul className="mt-2 space-y-3">
                {needed.map((item) => (
                  <li key={item.key}>
                    <p className="text-base font-bold text-ink">{item.label}</p>
                    {item.reason && <p className="mt-0.5 text-sm leading-6 text-ink">{item.reason}</p>}
                    {item.how_to_get && <p className="mt-0.5 text-xs leading-5 text-muted">怎么找：{item.how_to_get}</p>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-5 grid gap-6 md:grid-cols-2">
            <EvidenceGroup title="已经拥有" items={analysis.evidence.have} empty="尚未整理出已有材料。" />
            <EvidenceGroup
              title="可替代或辅助证明"
              items={analysis.evidence.alternatives}
              empty="暂无替代材料建议。"
            />
            <div className="md:col-span-2">
              <EvidenceGroup
                title="需要进一步核实"
                items={analysis.evidence.verify}
                empty="暂无待核实项。"
              />
            </div>
          </div>
          <p className="mt-4 border-t border-rule pt-3 text-xs leading-5 text-muted">
            {analysis.evidence.disclaimer}
          </p>
        </>
      ),
    },
    {
      id: "rights",
      tab: "涉及权益",
      title: "可能涉及的权益",
      description: "是否成立要结合事实和程序判断，不是最终法律结论。",
      meta: `${analysis.rights.length} 项`,
      content: analysis.rights.length > 0 ? (
        <ul className="divide-y divide-rule border-y border-rule">
          {analysis.rights.map((right) => (
            <li key={right.id} className="py-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-base font-bold leading-6 text-ink">{right.title}</h3>
                <Badge variant={right.status === "核心诉求" ? "default" : "neutral"}>{right.status}</Badge>
              </div>
              <p className="mt-1.5 text-base leading-7 text-ink">{right.description}</p>
              {right.basis.length > 0 && (
                <p className="mt-1.5 text-xs leading-5 text-muted">
                  依据：
                  {right.basis
                    .map((basis) => {
                      const item = legalMap.get(basis);
                      return item ? `${item.article}（${item.document_title.replace("中华人民共和国", "")}）` : basis;
                    })
                    .join("；")}
                </p>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="border-y border-rule py-4 text-sm text-muted">
          现在还没有足够事实判断具体权益。先把工作地点、时间、工资约定和欠薪金额核实清楚。
        </p>
      ),
    },
    {
      id: "legal",
      tab: "法律依据",
      title: "法律依据",
      description: `共 ${analysis.legal_analysis.length} 条可能相关依据；默认收起，展开可看原文、适用条件与来源。`,
      meta: `${analysis.legal_analysis.length} 条`,
      content: (
        <>
          <div className="border-l-2 border-note bg-note-wash px-3 py-2.5 text-xs leading-5 text-note">
            {analysis.legal_sources.verification_summary.note} 已核验{" "}
            {analysis.legal_sources.verification_summary.verified} 条，待核验{" "}
            {analysis.legal_sources.verification_summary.transcribed +
              analysis.legal_sources.verification_summary.pending}{" "}
            条。
          </div>
          <div className="mt-3 divide-y divide-rule border-y border-rule">
            {visibleLegal.map((item) => (
              <LegalEntry key={item.id} item={item} />
            ))}
          </div>
          {analysis.legal_analysis.length > 4 && (
            <Button variant="outline" className="mt-4 h-11" onClick={() => setShowAllLegal((value) => !value)}>
              {showAllLegal ? "收起，只看前 4 条" : `展开全部 ${analysis.legal_analysis.length} 条`}
            </Button>
          )}
        </>
      ),
    },
    {
      id: "channels",
      tab: "注意与渠道",
      title: "需要特别注意与去哪里办",
      description: "风险提示只代表需要核对的方向，办理单位以当地告知为准。",
      meta: `${riskCount} 项提醒`,
      content: (
        <div className="grid gap-8 lg:grid-cols-2">
          <section>
            <h3 className="text-base font-extrabold text-ink">需要特别注意</h3>
            {analysis.risk_flags.length > 0 ? (
              <ul className="mt-4 space-y-4">
                {analysis.risk_flags.map((risk) => (
                  <li
                    key={risk.title}
                    className={cn(
                      "pl-3",
                      risk.level === "attention" ? "border-l-2 border-note" : "border-l-2 border-rule",
                    )}
                  >
                    <p className={cn("text-sm font-bold", risk.level === "attention" ? "text-note" : "text-ink")}>
                      {risk.title}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-ink">{risk.detail}</p>
                    {risk.legal_basis && risk.legal_basis.length > 0 && (
                      <p className="mt-1 text-xs leading-5 text-muted">
                        依据：
                        {risk.legal_basis
                          .map((basis) => {
                            const item = legalMap.get(basis);
                            return item ? `${item.article}（${item.document_title.replace("中华人民共和国", "")}）` : basis;
                          })
                          .join("；")}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-sm text-muted">暂无额外风险提示。</p>
            )}
          </section>

          <section>
            <h3 className="text-base font-extrabold text-ink">去哪里办</h3>
            <p className="mt-4 text-xs font-bold text-muted">建议优先联系</p>
            <p className="mt-1 text-lg font-extrabold leading-7 text-ink">{analysis.jurisdiction.primary_agency}</p>
            <p className="mt-2 text-base leading-7 text-ink">{analysis.jurisdiction.guidance}</p>
            <p className="mt-2 text-xs leading-5 text-muted">
              {[analysis.jurisdiction.city, analysis.jurisdiction.district].filter(Boolean).join(" · ") ||
                "城市待确认"}{" "}
              · 管辖信息{analysis.jurisdiction.confidence === "high" ? "较明确" : "需核实"}
            </p>
            <p className="mt-1.5 text-xs leading-5 text-muted">{analysis.jurisdiction.note}</p>
            <p className="mt-3 border-l-2 border-field bg-field-wash px-3 py-2 text-xs leading-5 text-field">
              拿不准受理窗口和材料清单时，先拨 12333 确认，再动身。
            </p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <Link
                href={`/case/${caseId}/action-plan`}
                className={cn(buttonVariants({ size: "default" }), "h-11 justify-center")}
              >
                看分步行动
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href={`/case/${caseId}/form-assistant`}
                className={cn(buttonVariants({ variant: "outline", size: "default" }), "h-11 justify-center")}
              >
                填报参考
              </Link>
            </div>
          </section>
        </div>
      ),
    },
  ];
  const activeModule = modules[activeTab] ?? modules[0];

  return (
    <div className="pb-2">
      <StaleResultNotice generatedFromRevision={analysis.generated_from_revision} />
      {analysis.preliminary && (
        <Alert
          variant="warning"
          title="这份分析基于尚未确认的档案"
          className="mb-6"
          action={
            <Link
              href={`/case/${caseId}`}
              className="inline-flex min-h-11 shrink-0 items-center text-xs font-bold underline underline-offset-4"
            >
              返回对话核对
            </Link>
          }
        >
          {analysis.preliminary_note || "先把事实核对完整，结论会更可靠。"}
        </Alert>
      )}

      <header className="border-b border-rule pb-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 max-w-[760px]">
            <h1 className="text-balance text-2xl font-extrabold tracking-[-0.03em] text-ink sm:text-3xl">
              {analysis.title}
            </h1>
            <p className="mt-3 text-base leading-7 text-ink">{analysis.summary}</p>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
              <span>
                信息完整度 {analysis.completeness.done}/{analysis.completeness.total} 项
              </span>
              <span>整理于 {shortDate(analysis.generated_at)}</span>
              <Link
                href={`/case/${caseId}`}
                className="inline-flex min-h-11 items-center gap-1 font-bold text-muted underline-offset-4 hover:text-signal-deep hover:underline"
              >
                <BookOpenCheck className="h-3.5 w-3.5" />
                核对案件档案
              </Link>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap gap-2">
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
              href={`/case/${caseId}/action-plan`}
              className={cn(buttonVariants({ size: "default" }), "h-11 justify-center")}
            >
              下一步：看行动步骤
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
        {exportError && <p className="mt-2 text-xs text-signal-deep">{exportError}</p>}
      </header>

<nav ref={navRef} aria-label="案件分析模块" className="mt-6 scroll-mt-20 border-y border-rule lg:scroll-mt-32">
        <div ref={tabRowRef} role="tablist" aria-orientation="horizontal" className="flex gap-2 overflow-x-auto py-3 md:overflow-visible">
          {modules.map((module, index) => {
            const isActive = activeTab === index;
            return (
              <button key={module.id} type="button" role="tab" id={`analysis-tab-${index}`} aria-controls="analysis-panel"
                aria-selected={isActive}
                onClick={() => selectTab(index)}
                className={cn(
                  "flex h-[104px] w-[152px] shrink-0 flex-col justify-between overflow-hidden rounded-card border px-3 py-3 text-left transition-[flex-grow,background-color,border-color] duration-500 ease-out focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-signal md:w-auto md:min-w-0 md:shrink md:basis-0",
                  isActive
                    ? "border-signal bg-surface md:grow-[3.6]"
                    : "border-rule bg-sand/50 hover:border-signal/40 hover:bg-sand md:grow",
                )}>
                <span className={cn("font-mono font-bold tabular-nums", isActive ? "text-base text-signal-deep" : "text-sm text-route")}>
                  {index + 1}
                </span>
                <span className="min-w-0">
                  <span className={cn(
                    "block leading-5 transition-colors",
                    isActive ? "text-lg font-extrabold text-ink" : "line-clamp-2 text-[13px] font-bold text-muted",
                  )}>
                    {module.tab}
                  </span>
                  {isActive && <span className="mt-1 block text-xs text-muted">{module.meta}</span>}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      <section role="tabpanel" id="analysis-panel" aria-labelledby={`analysis-tab-${activeTab}`} className="mt-6">
        <h2 className="text-xl font-extrabold tracking-[-0.02em] text-ink">{activeModule.title}</h2>
        <p className="mt-1.5 text-sm leading-6 text-muted">{activeModule.description}</p>
        <div className="mt-4">{activeModule.content}</div>
      </section>

      <div className="mt-8 flex flex-col gap-3 border-y border-rule bg-surface px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div>
          <p className="text-[11px] font-bold text-muted">下一步</p>
          <p className="mt-1 text-base font-extrabold text-ink">先固定证据，再按行动步骤办理。</p>
        </div>
        <Link
          href={`/case/${caseId}/action-plan`}
          className={cn(buttonVariants({ size: "default" }), "h-11 justify-center")}
        >
          看行动步骤
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      <p className="mt-4 text-xs leading-5 text-muted">{analysis.disclaimer}</p>
    </div>
  );
}

function buildConclusions(analysis: AnalysisResponse) {
  const primaryRight = analysis.rights.find((right) => right.status.includes("核心")) ?? analysis.rights[0];
  const missing = analysis.evidence.needed[0] ?? analysis.evidence.verify[0];
  const neededLabels = analysis.evidence.needed.slice(0, 2).map((item) => item.label);
  const contractInfo = analysis.basic_info.find((item) => item.key === "contract");
  const contractUnsigned = Boolean(contractInfo?.value?.includes("未签"));
  const missingIsUnsignedContract = missing?.key === "contract" && contractUnsigned;

  return [
    {
      label: "可能可以主张",
      title: primaryRight?.title || "暂时还不能明确具体权益",
      body:
        primaryRight?.description ||
        "现在的事实还不足以判断具体可以主张什么。先把地点、时间、工资约定和欠薪金额补齐。",
      note: "这只是可能方向，具体能否成立还要看证据和办理程序。",
    },
    {
      label: "目前最缺",
      title: missingIsUnsignedContract
        ? "能证明用工关系的替代材料"
        : missing?.label || "把手头材料先整理成目录",
      body:
        missing?.reason ||
        "把已有的聊天、考勤、转账和工友信息按时间顺序整理，不清楚的项留在档案里。",
      note: missingIsUnsignedContract
        ? "没有书面合同，不等于没有权益；工资表、考勤、聊天记录和工友证言都可以帮助证明。"
        : missing?.how_to_get
          ? `怎么找：${missing.how_to_get}`
          : "找不到某项材料，不代表不能主张；先用手头能拿到的材料。",
    },
    {
      label: "建议先做",
      title: analysis.jurisdiction.primary_agency || "当地人力资源社会保障部门",
      body: analysis.jurisdiction.guidance,
      note: `动身前先整理：${neededLabels.join("、") || "已有材料"}；不确定窗口时拨 12333 确认。`,
    },
  ];
}

function RelationshipRow({ node }: { node: RelationshipNode }) {
  const label = node.status === "known" ? "已明确" : node.status === "partial" ? "部分待核实" : "待核实";
  return (
    <li className="py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted">{node.label}</p>
          <p className={cn("mt-0.5 text-base font-bold", node.status === "unknown" ? "text-muted" : "text-ink")}>
            {node.name}
          </p>
        </div>
        <Badge variant={node.status === "known" ? "success" : node.status === "partial" ? "warning" : "neutral"}>
          {label}
        </Badge>
      </div>
      <p className="mt-1 text-xs leading-5 text-muted">{node.note}</p>
    </li>
  );
}

function EvidenceGroup({ title, items, empty }: { title: string; items: EvidenceItem[]; empty: string }) {
  return (
    <div>
      <h3 className="flex items-baseline justify-between gap-2 text-base font-bold text-ink">
        {title}
        <span className="text-xs font-normal text-muted">{items.length} 项</span>
      </h3>
      {items.length === 0 ? (
        <p className="mt-1.5 text-sm text-muted">{empty}</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {items.map((item) => (
            <li key={`${title}-${item.key}-${item.label}`} className="text-sm leading-6 text-ink">
              <span className="font-bold">{item.label}</span>
              {item.proves?.length ? <span className="text-muted">：证明 {item.proves.join("、")}</span> : null}
              {item.reason ? <span className="text-muted">：{item.reason}</span> : null}
              {item.how_to_get ? <span className="block text-xs leading-5 text-muted">{item.how_to_get}</span> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function LegalEntry({ item }: { item: LegalAnalysisItem }) {
  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none flex-wrap items-start justify-between gap-3 py-4 [&::-webkit-details-marker]:hidden">
        <div className="min-w-0">
          <p className="text-base font-bold leading-6 text-ink">
            {item.document_title} · {item.article}
          </p>
          <p className="mt-0.5 text-sm text-muted">{item.heading}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge
            variant={
              item.verification_status === "verified"
                ? "success"
                : item.verification_status === "pending"
                  ? "warning"
                  : "neutral"
            }
          >
            {verificationLabel(item.verification_status)}
          </Badge>
          <ChevronDown className="h-4 w-4 text-muted transition group-open:rotate-180" aria-hidden="true" />
        </div>
      </summary>
      <div className="pb-5">
        <p className="text-base leading-7 text-ink">{item.text}</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <p className="border-l-2 border-field pl-2.5 text-xs leading-5 text-field">
            <span className="font-bold">适用判断：</span>
            {item.applicability}
          </p>
          <p className="border-l-2 border-note pl-2.5 text-xs leading-5 text-note">
            <span className="font-bold">还要核实：</span>
            {item.pending_verification.length ? item.pending_verification.join("；") : "暂无额外待核实事项"}
          </p>
        </div>
        {item.conditions.length > 0 && (
          <p className="mt-2 text-xs leading-5 text-muted">适用条件：{item.conditions.join("；")}</p>
        )}
        {item.supporting_facts.length > 0 && (
          <p className="mt-1.5 text-xs leading-5 text-muted">已陈述事实：{item.supporting_facts.join(" ")}</p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
          <span>{item.issuing_authority}</span>
          <span>{item.document_number}</span>
          {item.official_url && (
            <a
              href={item.official_url}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex min-h-11 items-center font-bold text-signal-deep underline-offset-4 hover:underline"
            >
              官方原文
            </a>
          )}
        </div>
        {item.source_note && <p className="mt-1 text-xs leading-5 text-muted">{item.source_note}</p>}
      </div>
    </details>
  );
}
