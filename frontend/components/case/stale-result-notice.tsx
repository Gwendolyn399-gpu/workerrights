"use client";

import Link from "next/link";
import { useCase } from "@/components/case/case-provider";
import { Alert } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { isResultStale } from "@/lib/result-revision";

export function StaleResultNotice({ generatedFromRevision }: { generatedFromRevision: number }) {
  const { caseId, caseData } = useCase();
  if (!caseData || !isResultStale(caseData.facts_revision, generatedFromRevision)) return null;

  return (
    <Alert variant="warning" title="信息已更新，请重新生成">
      <p className="text-base leading-7">下面仍是修改前的参考，请先回到对话核对信息，再生成新版本。旧材料暂不能导出或标记完成。</p>
      <Link href={`/case/${caseId}`} className={buttonVariants({ variant: "outline", className: "mt-3" })}>
        回到对话核对并重新生成
      </Link>
    </Alert>
  );
}
