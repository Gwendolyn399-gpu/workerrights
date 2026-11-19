"use client";

import * as React from "react";
import { BookOpenCheck, ExternalLink, PencilLine } from "lucide-react";

import { useCase } from "@/components/case/case-provider";
import { FactsEditor } from "@/components/case/facts-editor";
import { LegalSourcesModal } from "@/components/case/legal-sources-modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { CHECK_LABELS, factRows, missingChecks } from "@/lib/facts";
import { cn } from "@/lib/utils";
import { api } from "@/services/api";
import type { LegalBasisResponse } from "@/types/api";

type DossierTab = "facts" | "legal";

function verificationLabel(status: string) {
  if (status === "verified") return "已核验";
  if (status === "pending") return "待核验";
  return "待逐条核验";
}

export function CaseInfoPanel({ bare = false }: { bare?: boolean }) {
  const { caseId, caseData, meta } = useCase();
  const [editOpen, setEditOpen] = React.useState(false);
  const [legalOpen, setLegalOpen] = React.useState(false);
  const [tab, setTab] = React.useState<DossierTab>("facts");
  const [legal, setLegal] = React.useState<LegalBasisResponse | null>(null);
  const [legalLoading, setLegalLoading] = React.useState(false);
  const [legalError, setLegalError] = React.useState("");

  const loadLegal = React.useCallback(async () => {
    setLegalLoading(true);
    setLegalError("");
    try {
      setLegal(await api.getLegalBasis(caseId));
    } catch (err) {
      setLegalError(err instanceof Error ? err.message : "无法读取法律依据。");
    } finally {
      setLegalLoading(false);
    }
  }, [caseId]);

  if (!caseData) return null;

  const catalog = meta?.evidence_catalog || [];
  const rows = factRows(caseData.facts, catalog);
  const missing = missingChecks(caseData.progress.checks);
  const unknownEntries = Object.entries(caseData.intake.unknowns || {});
  const confirmed = caseData.intake.confirmed;

  const showLegal = () => {
    setTab("legal");
    if (!legal && !legalLoading) void loadLegal();
  };

  return (
    <div
      className={cn(
        bare
          ? "border-t-[3px] border-ink"
          : "rounded-card border border-rule border-t-[3px] border-t-ink bg-surface",
      )}
    >
      <div className="flex items-center justify-between gap-3 px-4 pb-2.5 pt-3">
        {bare ? (
          <p className="text-[11px] text-muted">所有页面都引用这一份事实</p>
        ) : (
          <div>
            <h2 className="text-base font-extrabold text-ink">案件档案</h2>
            <p className="mt-0.5 text-[11px] text-muted">所有页面都引用这一份事实</p>
          </div>
        )}
        <span
          className={cn(
            "inline-flex h-7 shrink-0 items-center border-2 px-2 text-[11px] font-extrabold tracking-[0.08em]",
            confirmed ? "border-field text-field" : "border-dashed border-note text-note",
          )}
        >
          {confirmed ? "已核对" : "待核对"}
        </span>
      </div>

      <div role="tablist" aria-label="案件档案页签" className="flex gap-5 border-y border-rule bg-sand px-4">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "facts"}
          onClick={() => setTab("facts")}
          className={cn(
            "border-b-2 py-2.5 text-xs font-bold transition",
            tab === "facts"
              ? "min-h-11 border-signal text-signal-deep"
              : "min-h-11 border-transparent text-muted hover:text-ink",
          )}
        >
          事实
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "legal"}
          onClick={showLegal}
          className={cn(
            "border-b-2 py-2.5 text-xs font-bold transition",
            tab === "legal"
              ? "min-h-11 border-signal text-signal-deep"
              : "min-h-11 border-transparent text-muted hover:text-ink",
          )}
        >
          法律依据
        </button>
      </div>

      {tab === "facts" ? (
        <div className="px-4">
          <dl className="divide-y divide-rule">
            {rows.map((row) => (
              <div key={row.key} className="flex items-start justify-between gap-3 py-2.5">
                <dt className="w-20 shrink-0 text-xs leading-6 text-muted">{row.label}</dt>
                <dd
                  className={cn(
                    "min-w-0 flex-1 text-right text-base leading-6",
                    row.highlight
                      ? "font-bold text-signal-deep"
                      : row.known
                        ? "font-medium text-ink"
                        : "text-muted",
                  )}
                >
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>

          {missing.length > 0 && (
            <p className="mb-3 border-l-2 border-note bg-note-wash px-2.5 py-2 text-xs leading-5 text-note">
              还没整理：{missing.join("、")}
            </p>
          )}
          {unknownEntries.length > 0 && (
            <p className="mb-3 text-xs leading-5 text-muted">
              已标记待核实：{unknownEntries.map(([key]) => CHECK_LABELS[key] || key).join("、")}
            </p>
          )}
        </div>
      ) : (
        <div className="px-4 py-3">
          {legalLoading && <Spinner label="正在检索法律资料…" />}
          {legalError && (
            <div className="text-xs leading-5 text-signal-deep">
              <p>{legalError}</p>
              <button type="button" onClick={() => void loadLegal()} className="mt-2 font-bold underline">
                重试
              </button>
            </div>
          )}
          {legal && (
            <>
              <p className="text-xs leading-5 text-muted">
                共 {legal.provisions.length} 条：已核验 {legal.verification_summary.verified}、待核验{" "}
                {legal.verification_summary.transcribed + legal.verification_summary.pending}。
              </p>
              {legal.provisions.length > 0 ? (
                <ul className="mt-2 divide-y divide-rule border-y border-rule">
                  {legal.provisions.slice(0, 3).map((item) => (
                    <li key={item.id} className="py-3">
                      <p className="text-sm font-bold leading-5 text-ink">
                        {item.document.title} · {item.article}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-muted">{item.heading}</p>
                      <p className="mt-1.5 line-clamp-3 text-xs leading-5 text-ink">{item.text}</p>
                      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
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
                        {item.official_url && (
                          <a
                            href={item.official_url}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="inline-flex items-center gap-1 text-xs text-muted underline-offset-4 hover:text-signal-deep hover:underline"
                          >
                            {item.official_source_name || "官方原文"}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 border-y border-rule py-3 text-sm text-muted">
                  现在的事实还不足以匹配具体条文。可以继续补充工作地点、时间和工资约定。
                </p>
              )}
              <button
                type="button"
                onClick={() => setLegalOpen(true)}
                className="mt-3 inline-flex min-h-11 items-center text-xs font-bold text-signal-deep underline-offset-4 hover:underline"
              >
                查看全部依据与核验状态
              </button>
              <p className="mt-2 text-[11px] leading-5 text-muted">{legal.disclaimer}</p>
            </>
          )}
        </div>
      )}

      <div className="grid gap-2 border-t border-rule px-4 py-3">
        <Button variant="outline" size="sm" className="h-11 justify-start" onClick={() => setEditOpen(true)}>
          <PencilLine className="h-3.5 w-3.5" />
          核对或修改档案
        </Button>
        <Button variant="ghost" size="sm" className="h-11 justify-start" onClick={showLegal}>
          <BookOpenCheck className="h-3.5 w-3.5" />
          查阅相关法律条文
        </Button>
      </div>

      <FactsEditor open={editOpen} onClose={() => setEditOpen(false)} />
      <LegalSourcesModal open={legalOpen} onClose={() => setLegalOpen(false)} />
    </div>
  );
}
