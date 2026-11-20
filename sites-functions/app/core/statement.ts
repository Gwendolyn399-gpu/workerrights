import { analyzeEvidence } from "./evidence.ts";
import { formatAmount, locationText } from "./facts.ts";
import type { Facts } from "./types.ts";

function period(facts: Facts): string {
  if (facts.work_start && facts.work_end) return `${facts.work_start}至${facts.work_end}`;
  if (facts.duration_text) return String(facts.duration_text);
  if (facts.work_start) return `${facts.work_start}起（结束时间待补充）`;
  return "【工作时间待补充】";
}

function wageBasisText(facts: Facts): string {
  const parts: string[] = [];
  if (facts.wage_basis) parts.push(facts.wage_basis);
  if (facts.daily_wage) parts.push(`每天${formatAmount(facts.daily_wage)}`);
  if (facts.monthly_wage) parts.push(`每月${formatAmount(facts.monthly_wage)}`);
  if (facts.unit_price) parts.push(`单价${formatAmount(facts.unit_price)}`);
  return parts.length ? parts.join("，") : "【工资约定待补充】";
}

function wageAgreement(facts: Facts): string {
  const parts: string[] = [];
  if (facts.wage_basis) parts.push(facts.wage_basis);
  if (facts.daily_wage) parts.push(`每天${formatAmount(facts.daily_wage)}`);
  if (facts.monthly_wage) parts.push(`每月${formatAmount(facts.monthly_wage)}`);
  if (facts.unit_price) parts.push(`单价${formatAmount(facts.unit_price)}`);
  if (facts.agreed_amount) parts.push(`应发合计${formatAmount(facts.agreed_amount)}`);
  return parts.length ? parts.join("，") : "【工资约定待补充】";
}

function owed(facts: Facts): string {
  if (facts.owed_amount === null || facts.owed_amount === undefined) return "【欠薪金额待核实】";
  return formatAmount(facts.owed_amount, Boolean(facts.owed_amount_approx));
}

function evidenceText(facts: Facts): string {
  const analysis = analyzeEvidence(facts);
  const labels = (analysis.have as Array<{ label: string }>).map((item) => item.label);
  if (labels.length) return labels.join("、");
  return "【现有材料待整理】";
}

export function buildFormalStatement(facts: Facts): string {
  const recruiter = facts.recruiter_name || facts.recruiter_type || "【招用人待核实】";
  const manager = facts.manager_role || "【日常管理主体待核实】";
  const project = facts.project_name || facts.location_detail || "【项目名称待补充】";
  const workType = facts.work_type || "【工种待补充】";
  const baseLocation = [facts.location_province, facts.location_city, facts.location_district]
    .filter((part) => part)
    .join("");
  const location = baseLocation ? `${baseLocation}的${project}` : String(project);
  const paid =
    facts.paid_amount !== null && facts.paid_amount !== undefined
      ? formatAmount(facts.paid_amount)
      : "【已付金额待核实】";
  const owedText = owed(facts);
  const contractMap: Record<string, string> = {
    yes: "双方签有书面合同/协议",
    no: "双方未签订书面劳动合同",
    unknown: "书面合同情况尚待核实",
  };
  const contractText = contractMap[String(facts.has_contract ?? "")] ?? "书面合同情况尚待核实";
  let prior = "";
  if (facts.prior_report === "yes") {
    prior = `此前我已就此事向${facts.prior_report_detail || "有关部门"}反映。`;
  } else if (facts.prior_report === "no") {
    prior = "此前我尚未向有关部门投诉或反映。";
  }

  return (
    `本人在${location}从事${workType}工作，工作时间为${period(facts)}。` +
    `招用我的是${recruiter}，日常由${manager}安排工作。` +
    `工资约定为：${wageAgreement(facts)}。` +
    `已支付${paid}，截至【填写日期】尚欠${owedText}。` +
    `${contractText}。目前持有${evidenceText(facts)}等材料。${prior}` +
    "以上情况根据本人现有记忆和材料整理，如金额、时间与结算记录有出入，以双方结算和证据核对为准。本人愿意配合有关部门核查。"
  );
}

export function buildShortDescription(facts: Facts): string {
  const location = locationText(facts);
  const workType = facts.work_type || "建筑工作";
  const recruiter = facts.recruiter_name || facts.recruiter_type || "用工方（待核实）";
  const paid =
    facts.paid_amount !== null && facts.paid_amount !== undefined
      ? formatAmount(facts.paid_amount)
      : "待核实";
  const owedText = owed(facts);
  const evidence = evidenceText(facts);
  let opening: string;
  if (facts.work_start && facts.work_end) {
    opening = `本人于${facts.work_start}至${facts.work_end}在${location}从事${workType}`;
  } else if (facts.duration_text) {
    opening = `本人在${location}从事${workType}，干了${facts.duration_text}`;
  } else if (facts.work_start) {
    opening = `本人自${facts.work_start}起在${location}从事${workType}（结束时间待补充）`;
  } else {
    opening = `本人在${location}从事${workType}，工作时间【待补充】`;
  }
  return (
    `${opening}，由${recruiter}招用。` +
    `工资约定为${wageAgreement(facts)}，已支付${paid}，目前尚欠${owedText}。` +
    `现持有${evidence}等材料，请求协调处理欠薪问题。`
  );
}

export function buildEvidenceDirectory(facts: Facts): Array<Record<string, string>> {
  const analysis = analyzeEvidence(facts);
  const rows: Array<Record<string, string>> = [];
  for (const item of analysis.have as Array<{ label: string; proves: string[]; how_to_get: string }>) {
    rows.push({
      label: item.label,
      proves: item.proves.join("、"),
      status: "已有",
      how_to_get: item.how_to_get,
    });
  }
  for (const item of analysis.needed as Array<{ label: string; reason: string }>) {
    rows.push({
      label: item.label,
      proves: item.reason,
      status: "待补充",
      how_to_get: "可按说明收集；没有某项材料不等于无法维权。",
    });
  }
  for (const item of analysis.alternatives as Array<{ label: string; reason: string }>) {
    rows.push({
      label: item.label,
      proves: item.reason,
      status: "替代材料",
      how_to_get: item.reason ?? "",
    });
  }
  return rows;
}

export function buildConfirmationMessage(facts: Facts): string {
  const recruiter = facts.recruiter_name || facts.recruiter_type || "负责人";
  const workType = facts.work_type || "工地上的活";
  const periodText = period(facts);
  const agreed =
    facts.agreed_amount !== null && facts.agreed_amount !== undefined
      ? formatAmount(facts.agreed_amount)
      : "【应发金额】";
  const paid =
    facts.paid_amount !== null && facts.paid_amount !== undefined
      ? formatAmount(facts.paid_amount)
      : "【已付金额】";
  const owedText = owed(facts);
  return (
    `${recruiter}，我把工资账再和您核对一下：` +
    `我在工地从事${workType}，工作时间为${periodText}，工资约定为${wageBasisText(facts)}，` +
    `应发约${agreed}，已收到${paid}，目前还差${owedText}。` +
    "麻烦您确认一下工作天数和金额对不对，以及大概什么时候能结清。谢谢。"
  );
}