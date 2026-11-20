import type { CaseBrief, CaseRecord } from "@/types/api";

// 后端新建案件时会给一个场景默认标题；用户还没回答任何问题前不把它当案件名展示。
export function caseDisplayTitle(
  caseData: Pick<CaseRecord | CaseBrief, "title" | "is_demo" | "progress">,
): string {
  const title = caseData.title?.trim();
  if (!title) return "新的咨询";
  if (caseData.is_demo) return title;
  return caseData.progress.done > 0 ? title : "新的咨询";
}
