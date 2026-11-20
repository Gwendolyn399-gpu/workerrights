import type { CaseRow, Facts, Intake, Progress } from "./types.ts";
import {
  decimalEquals,
  decimalNegative,
  decimalSub,
  decimalToString,
  deepClone,
  isIntegerValue,
  pyFixed,
  pyRound,
  stripSuffix,
  thousands,
  truthy,
} from "./util.ts";

export const NEW_CASE_FACTS: Facts = {
  scene: "construction_wage_arrears",
  location_province: null,
  location_city: null,
  location_district: null,
  location_detail: null,
  project_name: null,
  developer_name: null,
  contractor_name: null,
  subcontractor_name: null,
  work_type: null,
  work_start: null,
  work_end: null,
  duration_text: null,
  duration_months: null,
  recruiter_type: null,
  recruiter_name: null,
  recruiter_phone: null,
  manager_role: null,
  manager_name: null,
  wage_basis: null,
  daily_wage: null,
  monthly_wage: null,
  unit_price: null,
  agreed_amount: null,
  paid_amount: null,
  owed_amount: null,
  owed_amount_approx: false,
  owed_amount_note: null,
  pay_cycle: null,
  last_paid_date: null,
  has_contract: null,
  contract_party: null,
  evidence: [],
  evidence_other: null,
  evidence_status: null,
  project_info_status: null,
  prior_report: null,
  prior_report_detail: null,
  contact_phone: null,
  user_statement: null,
  notes: null,
  outside_scope: false,
  outside_scope_note: null,
};

export const DERIVED_FACT_FIELDS = [
  "location_province", "location_city", "location_district", "location_detail",
  "project_name", "developer_name", "contractor_name", "subcontractor_name",
  "work_type", "work_start", "work_end", "duration_text",
  "recruiter_type", "recruiter_name", "recruiter_phone", "manager_role",
  "wage_basis", "daily_wage", "monthly_wage", "unit_price", "agreed_amount",
  "paid_amount", "owed_amount", "owed_amount_approx", "owed_amount_note",
  "has_contract", "evidence", "evidence_other", "evidence_status",
  "prior_report", "prior_report_detail",
] as const;

export function generationFacts(facts: Facts): Record<string, unknown> {
  const snapshot = deepClone(facts);
  const result: Record<string, unknown> = {};
  for (const key of DERIVED_FACT_FIELDS) {
    let value: unknown = snapshot[key];
    if (typeof value === "string") value = value.trim();
    if (key === "evidence") {
      value = [...new Set((value as string[] | null | undefined) ?? [])].sort();
    } else if (key === "owed_amount_approx") {
      value = Boolean(value);
    } else if (
      value === null || value === undefined || value === "" ||
      (Array.isArray(value) && value.length === 0) ||
      (typeof value === "object" && !Array.isArray(value) && Object.keys(value as object).length === 0)
    ) {
      value = null;
    }
    result[key] = value;
  }
  return result;
}

export function recordFactChange(
  caseRow: CaseRow,
  before: Facts,
  options: { preserveConfirmation?: boolean } = {},
): boolean {
  const a = generationFacts(before);
  const b = generationFacts(caseRow.facts);
  if (JSON.stringify(a) === JSON.stringify(b)) return false;
  caseRow.facts_revision += 1;
  if (!options.preserveConfirmation) {
    caseRow.intake = { ...(caseRow.intake ?? {}), confirmed: false };
    caseRow.status = "collecting";
  }
  return true;
}

export const FACT_LABELS: Record<string, string> = {
  location_city: "工作城市",
  location_district: "区/县",
  location_detail: "工地位置",
  project_name: "项目名称",
  developer_name: "建设单位",
  contractor_name: "施工总承包单位",
  subcontractor_name: "分包/劳务单位",
  work_type: "工种",
  work_start: "开始时间",
  work_end: "结束时间",
  duration_text: "工作时长",
  recruiter_type: "招用方式",
  recruiter_name: "招用人/包工头",
  recruiter_phone: "招用人电话",
  manager_role: "日常管理主体",
  wage_basis: "工资计算方式",
  daily_wage: "日工资",
  monthly_wage: "月工资",
  unit_price: "计件单价",
  agreed_amount: "约定工资总额",
  paid_amount: "已支付金额",
  owed_amount: "拖欠金额",
  has_contract: "书面合同",
  evidence: "已有证据",
  project_info_status: "项目信息掌握情况",
  prior_report: "此前反映情况",
  prior_report_detail: "此前反映说明",
  contact_phone: "联系电话",
  owed_amount_note: "金额说明",
  user_statement: "你的原始陈述",
  location_province: "省份",
};

export function formatAmount(value: number | null | undefined, approximate = false): string {
  if (value === null || value === undefined) return "待核实";
  let text: string;
  if (value >= 10000) {
    const amount = value / 10000;
    text = pyFixed(amount, 1).replace(/0+$/, "").replace(/\.$/, "") + "万元";
  } else {
    text = isIntegerValue(value) ? `${thousands(value)}元` : `${pyFixedThousands(value)}元`;
  }
  return approximate ? `约${text}` : text;
}

function pyFixedThousands(value: number): string {
  const fixed = pyFixed(value, 1);
  const [intPart, frac] = fixed.split(".");
  const negative = intPart.startsWith("-");
  const digits = negative ? intPart.slice(1) : intPart;
  const grouped = BigInt(digits).toLocaleString("en-US");
  return `${negative ? "-" : ""}${grouped}.${frac}`;
}

export function locationText(facts: Facts): string {
  const parts = [
    facts.location_province,
    facts.location_city,
    facts.location_district,
    facts.location_detail,
  ];
  return parts.filter((part) => truthy(part)).join("") || "待核实";
}

export function workPeriodText(facts: Facts): string {
  if (facts.work_start && facts.work_end) return `${facts.work_start} 至 ${facts.work_end}`;
  if (facts.work_start) return `${facts.work_start} 起（结束时间待核实）`;
  if (facts.duration_text) return `约${facts.duration_text}`;
  return "待核实";
}

export function evidenceLabels(
  keys: string[] | null | undefined,
  catalog: Array<{ key: string; label: string }>,
): string[] {
  const mapping = new Map(catalog.map((item) => [item.key, item.label]));
  return (keys ?? []).filter((key) => mapping.has(key)).map((key) => mapping.get(key)!);
}

export function requiredProgress(facts: Facts, intake: Intake): Progress {
  const unknowns = intake.unknowns ?? {};
  const checks: Record<string, boolean> = {
    location: truthy(facts.location_city) || "location" in unknowns,
    work_type: truthy(facts.work_type) || "work_type" in unknowns,
    period: truthy(facts.duration_text) || truthy(facts.work_start) || truthy(facts.work_end) || "period" in unknowns,
    recruiter: truthy(facts.recruiter_type) || "recruiter" in unknowns,
    manager: truthy(facts.manager_role) || "manager" in unknowns,
    wage_basis: truthy(facts.wage_basis) || "wage_basis" in unknowns,
    amounts:
      truthy(facts.agreed_amount) || truthy(facts.paid_amount) || truthy(facts.owed_amount) ||
      truthy(facts.owed_amount_note) || "amounts" in unknowns,
    owed_amount: truthy(facts.owed_amount) || truthy(facts.owed_amount_note) || "owed_amount" in unknowns,
    paid_amount: facts.paid_amount !== null && facts.paid_amount !== undefined || "paid_amount" in unknowns,
    contract: truthy(facts.has_contract) || "contract" in unknowns,
    evidence:
      truthy(facts.evidence) || truthy(facts.evidence_other) || truthy(facts.evidence_status) ||
      "evidence" in unknowns,
  };
  const done = Object.values(checks).filter(Boolean).length;
  const total = Object.keys(checks).length;
  let percent = pyRound((done / total) * 100);
  if (percent === 100 && !intake.confirmed) percent = 99;
  return { checks, done, total, percent, unknown_count: Object.keys(unknowns).length };
}

export function buildCaseTitle(facts: Facts): string {
  const city = facts.location_city;
  const workType = facts.work_type;
  const prefix = city ? stripSuffix(city, "市") : "河南";
  const suffix = workType && workType !== "其他" && workType !== "不清楚" ? ` · ${workType}` : "";
  return `${prefix}建筑工地欠薪${suffix}`;
}

export function buildRelationship(facts: Facts): Record<string, unknown> {
  const node = (id: string, label: string, name: string | null | undefined, status: string, note: string) => ({
    id,
    label,
    name: name || "待核实",
    status,
    note,
  });

  let developerStatus = facts.developer_name ? "known" : "unknown";
  let contractorStatus = facts.contractor_name ? "known" : "unknown";
  const subcontractorName = facts.subcontractor_name;
  let subcontractorStatus = subcontractorName ? "known" : "unknown";

  const foremanName = facts.recruiter_name;
  const recruiterType = facts.recruiter_type;
  let foremanStatus = foremanName ? "known" : "unknown";
  if (!foremanName && recruiterType === "包工头") foremanStatus = "partial";

  if (recruiterType === "劳务公司" && !subcontractorName) subcontractorStatus = "partial";
  if (recruiterType === "施工企业/项目部" && !facts.contractor_name) contractorStatus = "partial";

  const managerRole = facts.manager_role;
  if (managerRole === "项目部" && contractorStatus === "unknown") contractorStatus = "partial";
  if (managerRole === "包工头" && foremanStatus === "unknown") foremanStatus = "partial";

  const notes: string[] = [];
  if (recruiterType) notes.push(`直接招用方式：${recruiterType}`);
  if (managerRole) notes.push(`日常管理：${managerRole}`);
  if (!facts.contractor_name && !facts.subcontractor_name) {
    notes.push("施工总承包、分包关系尚未核实，不能据此认定最终责任主体");
  }

  const nodes = [
    node("developer", "建设单位", facts.developer_name, developerStatus, "工程的业主或开发方，待核实"),
    node("contractor", "施工总承包单位", facts.contractor_name, contractorStatus, "对项目施工总承包的公司，待核实"),
    node("subcontractor", "分包单位 / 劳务公司", subcontractorName, subcontractorStatus, "从总包承接劳务的单位，待核实"),
    node("foreman", "包工头 / 直接招用人", foremanName || (recruiterType ? recruiterType : null), foremanStatus, "直接联系、安排工作或发工资的人"),
    node("worker", "劳动者（你）", "本人", "known", "实际提供劳动的人"),
  ];
  const edges = [
    { from: "developer", to: "contractor", label: "工程发包", status: "unknown" },
    { from: "contractor", to: "subcontractor", label: "专业/劳务分包", status: "unknown" },
    { from: "subcontractor", to: "foreman", label: "劳务分包/招用", status: "unknown" },
    {
      from: "foreman",
      to: "worker",
      label: "招用 · 安排工作",
      status: foremanStatus !== "unknown" ? "partial" : "unknown",
    },
  ];
  if (facts.contractor_name) {
    edges[0].status = "partial";
    edges[1].status = "partial";
  }
  if (facts.subcontractor_name) {
    edges[1].status = "partial";
    edges[2].status = "partial";
  }

  return {
    nodes,
    edges,
    confirmed_notes: notes,
    disclaimer:
      "该关系图仅根据你提供的信息整理，未知主体保留为“待核实”，不代表已经认定法律责任。最终责任主体需由行政机关或仲裁、司法机关依法认定。",
  };
}

export function formatAck(updates: Record<string, unknown>, facts: Facts): string {
  const parts: string[] = [];
  if ("location_city" in updates || "location_district" in updates) {
    parts.push(`地点：${locationText(facts)}`);
  }
  // Python interpolates a null work_type as the literal "None"; preserved verbatim.
  if ("work_type" in updates) parts.push(`工种：${facts.work_type ?? "None"}`);
  if (["work_start", "work_end", "duration_text"].some((key) => key in updates)) {
    parts.push(`工作时间：${workPeriodText(facts)}`);
  }
  if ("recruiter_type" in updates || "recruiter_name" in updates) {
    const recruiter = facts.recruiter_name || facts.recruiter_type;
    if (recruiter) parts.push(`招用人：${recruiter}`);
  }
  if ("manager_role" in updates && facts.manager_role) parts.push(`日常管理：${facts.manager_role}`);
  if ("wage_basis" in updates && facts.wage_basis) parts.push(`工资算法：${facts.wage_basis}`);
  if ("agreed_amount" in updates && facts.agreed_amount) {
    parts.push(`约定总额：${formatAmount(facts.agreed_amount)}`);
  }
  if ("paid_amount" in updates && facts.paid_amount !== null && facts.paid_amount !== undefined) {
    parts.push(`已付：${formatAmount(facts.paid_amount)}`);
  }
  if ("owed_amount" in updates && facts.owed_amount) {
    parts.push(`欠薪：${formatAmount(facts.owed_amount, Boolean(facts.owed_amount_approx))}`);
  }
  if ("has_contract" in updates) {
    const mapping: Record<string, string> = { yes: "已签书面合同", no: "没有书面合同", unknown: "合同情况不清楚" };
    parts.push(mapping[String(facts.has_contract ?? "")] ?? "合同情况待核实");
  }
  if ("evidence" in updates) parts.push("证据材料已记录");
  if ("prior_report" in updates) parts.push("此前反映情况已记录");
  if ("project_info_status" in updates && facts.project_info_status === "unknown") {
    parts.push("项目信息暂不清楚");
  }
  if (!parts.length) return "";
  return "我记下了：" + parts.join("；") + "。";
}

export function checkAmounts(facts: Facts): Record<string, unknown> {
  const missing = (["agreed_amount", "paid_amount"] as const).filter(
    (key) => facts[key] === null || facts[key] === undefined,
  );
  if (missing.length) return { missing };
  const difference = decimalSub(facts.agreed_amount as number, facts.paid_amount as number);
  const owed = facts.owed_amount;
  return {
    calculated_owed: decimalToString(difference),
    user_reported_owed: owed ?? null,
    conflict:
      decimalNegative(difference) ||
      (owed !== null && owed !== undefined && !decimalEquals(difference, owed)),
    notice: "计算不覆盖用户陈述；冲突请用户核对。",
  };
}