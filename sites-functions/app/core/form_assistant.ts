import { FORM_SCHEMA } from "../knowledge/data.ts";
import { FACT_LABELS, formatAmount, locationText, workPeriodText } from "./facts.ts";
import { buildEvidenceDirectory, buildFormalStatement, buildShortDescription } from "./statement.ts";
import type { CaseRow, Facts } from "./types.ts";
import { nowIso, pyRound } from "./util.ts";

interface SchemaField {
  key: string;
  label: string;
  explanation: string;
  required?: boolean;
  sensitivity?: string;
  input_type?: string;
  source_facts?: string[];
  placeholder?: string | null;
}

function isEmptyFact(value: unknown): boolean {
  if (value === null || value === undefined || value === "") return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value as object).length === 0;
  return false;
}

function generateField(field: SchemaField, facts: Facts): Record<string, unknown> {
  const key = field.key;
  let label = field.label;
  let explanation = field.explanation;
  let value: string | null = null;
  let status = "missing";
  let note = "";
  let approx = false;

  if (key === "scene_category") {
    value = "工程建设领域欠薪";
    status = "ready";
  } else if (key === "work_location") {
    value = facts.location_city ? locationText(facts) : null;
    status = value ? "ready" : "missing";
    if (value && facts.location_district) {
      note = "区县已确认；具体项目地址可在官方平台补充。";
    } else if (value) {
      note = "区县尚未确认，提交前建议补充或拨打12333确认管辖。";
      status = "verify";
    }
  } else if (key === "project_name") {
    value = (facts.project_name as string | null) ?? null;
    status = value ? "ready" : "missing";
    note = "不知道可以不填，不要编造。";
  } else if (key === "developer_name") {
    value = (facts.developer_name as string | null) ?? null;
    status = value ? "ready" : "missing";
  } else if (key === "contractor_name") {
    value = (facts.contractor_name as string | null) ?? null;
    status = value ? "ready" : "missing";
  } else if (key === "subcontractor_name") {
    value = (facts.subcontractor_name as string | null) ?? null;
    if (!value && facts.recruiter_type === "包工头") {
      value = "个人包工头" + (facts.recruiter_name ? `：${facts.recruiter_name}` : "（姓名待核实）");
      status = facts.recruiter_name ? "ready" : "verify";
      note = "由个人包工头直接招用，建议同时填写包工头姓名。";
    } else {
      status = value ? "ready" : "missing";
    }
  } else if (key === "foreman_name") {
    value = (facts.recruiter_name as string | null) ?? null;
    status = value ? "ready" : "missing";
    note = "只知道称呼时，可写“王老板”等并注明具体姓名待核实。";
  } else if (key === "foreman_phone") {
    value = (facts.recruiter_phone as string | null) ?? null;
    status = value ? "ready" : "missing";
    note = "没有或不方便提供可以留空，不要编造电话号码。";
  } else if (key === "reporter_name" || key === "reporter_phone" || key === "reporter_id") {
    status = "official_only";
    note = "由本人在官方平台填写，本产品不收集此字段。";
  } else if (key === "work_period") {
    const periodText = workPeriodText(facts);
    value = periodText !== "待核实" ? periodText : null;
    status = value ? "ready" : "missing";
    if (facts.duration_text && !facts.work_start && !facts.work_end) {
      label = "工作时长";
      explanation = "目前只知道工作时长，起止日期由本人核实后在官方平台补充。";
      value = String(facts.duration_text);
      status = "verify";
      note = "工作时长不是起止日期，不据此推算月份或日期。";
    } else if (value && (value.includes("待核实") || value.includes("待补充"))) {
      status = "verify";
    }
  } else if (key === "work_type") {
    value = (facts.work_type as string | null) ?? null;
    status = value ? "ready" : "missing";
  } else if (key === "wage_agreement") {
    const parts: string[] = [];
    if (facts.wage_basis) parts.push(String(facts.wage_basis));
    if (facts.daily_wage) parts.push(`每天${formatAmount(facts.daily_wage)}`);
    if (facts.monthly_wage) parts.push(`每月${formatAmount(facts.monthly_wage)}`);
    if (facts.unit_price) parts.push(`单价${formatAmount(facts.unit_price)}`);
    if (facts.agreed_amount) parts.push(`应发合计约${formatAmount(facts.agreed_amount)}`);
    value = parts.length ? parts.join("，") : null;
    status = value ? "ready" : "missing";
  } else if (key === "paid_amount") {
    value = facts.paid_amount !== null && facts.paid_amount !== undefined ? formatAmount(facts.paid_amount) : null;
    status = value ? "ready" : "missing";
  } else if (key === "owed_amount") {
    if (facts.owed_amount !== null && facts.owed_amount !== undefined) {
      approx = Boolean(facts.owed_amount_approx);
      value = formatAmount(facts.owed_amount, approx);
      status = approx ? "verify" : "ready";
      note = approx ? "金额为约数，请在正式材料中注明“约”。" : "";
    } else {
      value = null;
      note = "先在对话或案件信息中补充欠款金额；不确定可填约数。";
    }
  } else if (key === "description") {
    value = buildShortDescription(facts);
    status = "ready";
    if (["【", "待核实", "待补充"].some((marker) => value!.includes(marker))) {
      status = "verify";
      note = "描述中包含待补充或待核实内容，提交前请核对。";
    }
  } else if (key === "evidence_list") {
    const directory = buildEvidenceDirectory(facts);
    if (directory.length) {
      value = directory
        .map((item, index) => `${index + 1}. ${item.label}（${item.status}）：可证明${item.proves}`)
        .join("\n");
      status = "ready";
    } else {
      value = null;
      note = "暂时没有材料也可以提交线索，在描述中说明情况即可。";
    }
  }

  const required = field.required ?? false;
  const sensitivity = field.sensitivity ?? "none";
  if (required && status === "missing") {
    note = note || "官方平台可能要求填写；不知道的可留空并说明，不要编造。";
  }
  if (sensitivity === "id") status = "official_only";

  const copyText = status === "official_only"
    ? "【由本人在官方平台填写，本产品不收集】"
    : value || `【待补充：${label}】`;
  const sourceFacts = (field.source_facts ?? [])
    .filter((source) => status !== "official_only" && !isEmptyFact(facts[source]))
    .map((source) => FACT_LABELS[source] ?? source);

  return {
    key,
    label,
    explanation,
    required,
    sensitivity,
    input_type: field.input_type ?? "text",
    status,
    value,
    copy_text: copyText,
    note,
    source_facts: sourceFacts,
    placeholder: field.placeholder ?? null,
  };
}

function copySummary(steps: Array<Record<string, unknown>>): string {
  const lines: string[] = [];
  for (const step of steps) {
    const fields = step.fields as Array<Record<string, unknown>>;
    if (!fields.length) continue;
    lines.push(`【${step.title}】`);
    for (const field of fields) {
      lines.push(`${field.label}：${field.copy_text}`);
    }
    lines.push("");
  }
  return lines.join("\n").trim();
}

export function runFormAssistant(caseRow: CaseRow): Record<string, unknown> {
  const facts = caseRow.facts;
  const schema = FORM_SCHEMA as Record<string, any>;
  const steps: Array<Record<string, unknown>> = [];
  let readyFields = 0;
  let totalFields = 0;
  for (const step of schema.steps) {
    const fields: Array<Record<string, unknown>> = [];
    for (const field of step.fields as SchemaField[]) {
      totalFields += 1;
      const generated = generateField(field, facts);
      if (generated.status === "ready" || generated.status === "official_only") readyFields += 1;
      fields.push(generated);
    }
    steps.push({ id: step.id, title: step.title, goal: step.goal, tips: step.tips, fields });
  }
  return {
    case_id: caseRow.id,
    platform: {
      name: schema.platform_name,
      official_url: schema.official_url,
      access_note: schema.access_note,
      verification_status: schema.verification_status,
      last_verified_at: schema.last_verified_at,
      source_note: schema.source_note,
    },
    steps,
    progress: {
      ready: readyFields,
      total: totalFields,
      percent: totalFields ? pyRound((readyFields / totalFields) * 100) : 0,
    },
    formal_statement: buildFormalStatement(facts),
    short_description: buildShortDescription(facts),
    evidence_directory: buildEvidenceDirectory(facts),
    copy_summary: copySummary(steps),
    privacy_notice: "姓名、手机号和身份证号由本人在官方平台填写，本产品不收集这些填报字段，也不要求上传身份证、银行卡等敏感材料。",
    submit_notice: "本页面只辅助整理填报内容，不会自动登录、自动上传或代替你提交。提交前请逐项核对，并以官方页面要求为准。",
    generated_at: nowIso(),
    agent: "Form Assistant",
  };
}