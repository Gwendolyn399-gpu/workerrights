"use client";

import * as React from "react";
import { ExternalLink } from "lucide-react";

import { useCase } from "@/components/case/case-provider";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/services/api";
import type { LegalBasisResponse } from "@/types/api";

function verificationLabel(status: string) {
  if (status === "verified") return "已核验";
  if (status === "pending") return "待核验";
  return "待逐条核验";
}

export function LegalSourcesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { caseId } = useCase();
  const [data, setData] = React.useState<LegalBasisResponse | null>(null);
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [expanded, setExpanded] = React.useState<string[]>([]);

  React.useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError("");
    api
      .getLegalBasis(caseId)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "无法读取法律依据。"))
      .finally(() => setLoading(false));
  }, [open, caseId]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="相关法律依据"
      description="来自本地法律知识库，附来源与核验状态，以官方原文为准。"
      wide
    >
      {loading && <Spinner label="正在检索法律资料…" />}
      {error && <Alert variant="danger">{error}</Alert>}
      {data && (
        <div className="space-y-4">
          <p className="border-l-2 border-note bg-note-wash px-3 py-2.5 text-xs leading-5 text-note">
            {data.verification_summary.note} 共 {data.provisions.length} 条：已核验{" "}
            {data.verification_summary.verified}、待逐条核验 {data.verification_summary.transcribed}、待核验{" "}
            {data.verification_summary.pending}。
          </p>

          <div className="divide-y divide-rule border-y border-rule">
            {data.provisions.map((item) => {
              const isExpanded = expanded.includes(item.id);
              return (
                <div key={item.id} className="py-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-bold leading-snug text-ink">
                        {item.document.title} · {item.article}
                      </p>
                      <p className="mt-0.5 text-xs text-muted">{item.heading}</p>
                    </div>
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
                  </div>
                  <p className={`mt-2 text-sm leading-6 text-ink ${isExpanded ? "" : "line-clamp-3"}`}>
                    {item.text}
                  </p>
                  <p className="mt-1.5 text-xs leading-5 text-signal-deep">{item.why_relevant}</p>
                  {isExpanded && (
                    <div className="mt-2 space-y-1 bg-sand px-3 py-2 text-xs leading-5 text-muted">
                      <p>发布机关：{item.document.issuing_authority}</p>
                      <p>文件编号：{item.document.doc_number}</p>
                      <p>效力状态：{item.document.validity}</p>
                      <p>核验状态：{item.verification_label}</p>
                      {item.conditions.length > 0 && <p>适用条件：{item.conditions.join("；")}</p>}
                      {item.source_note && <p>核验说明：{item.source_note}</p>}
                    </div>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-4">
                    <button
                      type="button"
                      onClick={() =>
                        setExpanded((current) =>
                          current.includes(item.id)
                            ? current.filter((id) => id !== item.id)
                            : [...current, item.id],
                        )
                      }
                      className="inline-flex min-h-11 items-center text-xs font-bold text-signal-deep underline-offset-4 hover:underline"
                    >
                      {isExpanded ? "收起详情" : "查看条文详情"}
                    </button>
                    {item.official_url && (
                      <a
                        href={item.official_url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="inline-flex items-center gap-1 text-xs text-muted underline-offset-4 hover:text-signal-deep hover:underline"
                      >
                        {item.official_source_name || "官方来源"}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <p className="text-xs leading-5 text-muted">{data.disclaimer}</p>
        </div>
      )}
    </Modal>
  );
}
