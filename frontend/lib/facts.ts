import type { CaseFacts, EvidenceCatalogItem } from "@/types/api";

import { formatAmount } from "@/lib/utils";

export const FACT_LABELS: Record<string, string> = {
  location_city: "工作城市",
  location_district: "区/县",
  location_detail: "工地位置",
  project_name: "项目名称",
  developer_name: "建设单位",
  contractor_name: "施工总承包",
  subcontractor_name: "分包/劳务单位",
  work_type: "工种",
  work_start: "开始时间",
  work_end: "结束时间",
  duration_text: "工作时长",
  recruiter_type: "招用方式",
  recruiter_name: "招用人",
  manager_role: "日常管理",
  wage_basis: "工资算法",
  daily_wage: "日工资",
  monthly_wage: "月工资",
  agreed_amount: "约定总额",
  paid_amount: "已支付",
  owed_amount: "拖欠金额",
  has_contract: "书面合同",
  evidence: "已有证据",
  prior_report: "此前反映",
  notes: "补充说明",
};

export function locationValue(facts: CaseFacts): string {
  const parts = [
    facts.location_province === "河南省" ? "河南" : facts.location_province,
    facts.location_city,
    facts.location_district,
    facts.location_detail,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "待核实";
}

export function periodValue(facts: CaseFacts): string {
  if (facts.work_start && facts.work_end) return `${facts.work_start} 至 ${facts.work_end}`;
  if (facts.work_start) return `${facts.work_start} 起`;
  if (facts.duration_text) return `约${facts.duration_text}`;
  return "待核实";
}

export function wageValue(facts: CaseFacts): string {
  const parts: string[] = [];
  if (facts.wage_basis) parts.push(facts.wage_basis);
  if (facts.daily_wage) parts.push(`每天${formatAmount(facts.daily_wage)}`);
  if (facts.monthly_wage) parts.push(`每月${formatAmount(facts.monthly_wage)}`);
  if (facts.unit_price) parts.push(`单价${formatAmount(facts.unit_price)}`);
  return parts.length ? parts.join("，") : "待核实";
}

export function evidenceLabels(keys: string[] | undefined, catalog: EvidenceCatalogItem[]): string {
  if (!keys?.length) return "待核实";
  const map = new Map(catalog.map((item) => [item.key, item.label]));
  return keys.map((key) => map.get(key) || key).join("、");
}

export function factRows(facts: CaseFacts, catalog: EvidenceCatalogItem[]) {
  return [
    { key: "location", label: "工作地点", value: locationValue(facts), known: Boolean(facts.location_city) },
    { key: "work_type", label: "工种", value: facts.work_type || "待核实", known: Boolean(facts.work_type) },
    { key: "period", label: "工作时间", value: periodValue(facts), known: Boolean(facts.work_start || facts.duration_text) },
    { key: "wage", label: "工资约定", value: wageValue(facts), known: Boolean(facts.wage_basis || facts.daily_wage || facts.monthly_wage) },
    {
      key: "owed",
      label: "目前欠薪",
      value: facts.owed_amount ? formatAmount(facts.owed_amount, facts.owed_amount_approx) : "待核实",
      known: Boolean(facts.owed_amount),
      highlight: Boolean(facts.owed_amount),
    },
    {
      key: "contract",
      label: "书面合同",
      value: facts.has_contract === "yes" ? "已签" : facts.has_contract === "no" ? "未签" : "待核实",
      known: Boolean(facts.has_contract),
    },
    {
      key: "recruiter",
      label: "招用/管理",
      value:
        facts.recruiter_type && facts.recruiter_type === facts.manager_role
          ? facts.recruiter_type
          : [facts.recruiter_type, facts.manager_role].filter(Boolean).join(" / ") || "待核实",
      known: Boolean(facts.recruiter_type || facts.manager_role),
    },
    {
      key: "evidence",
      label: "已有证据",
      value: evidenceLabels(facts.evidence, catalog),
      known: Boolean(facts.evidence?.length || facts.evidence_status),
    },
  ];
}

export const CHECK_LABELS: Record<string, string> = {
  location: "工作地点",
  work_type: "工种",
  period: "工作时间",
  recruiter: "招用主体",
  manager: "日常管理",
  wage_basis: "工资算法",
  amounts: "工资金额",
  owed_amount: "欠薪金额",
  paid_amount: "已支付金额",
  agreed_amount: "约定总额",
  contract: "书面合同",
  evidence: "证据材料",
};

export function missingChecks(checks: Record<string, boolean>): string[] {
  return Object.entries(checks)
    .filter(([, done]) => !done)
    .map(([key]) => CHECK_LABELS[key] || key);
}
