import type { EvidenceCatalogItem, Facts } from "./types.ts";

export const EVIDENCE_CATALOG: EvidenceCatalogItem[] = [
  {
    key: "chat",
    label: "微信 / 短信聊天记录",
    proves: ["招用经过", "工资约定", "工作量", "催要工资的记录"],
    how_to_get: "保留原始聊天，不要只截一句话；同时保存对方微信号、头像和实名信息页面。",
  },
  {
    key: "attendance",
    label: "考勤记录 / 打卡记录",
    proves: ["工作天数", "日常管理主体", "工作起止时间"],
    how_to_get: "截图考勤群、打卡小程序、门禁记录；如由包工头记工，可请其书面确认。",
  },
  {
    key: "wage_sheet",
    label: "工资表 / 结算单 / 记工本",
    proves: ["工资计算方式", "应发金额", "已发和欠发金额"],
    how_to_get: "拍照保存工资表、记工本、结算单；请对方在结算单上签字或通过微信确认。",
  },
  {
    key: "transfer",
    label: "银行转账 / 微信支付宝转账记录",
    proves: ["付款主体", "已支付金额", "最后一次付款时间"],
    how_to_get: "在银行APP或微信、支付宝导出带对方实名的转账记录，不要只截金额。",
  },
  {
    key: "iou",
    label: "欠条 / 结算欠款凭证",
    proves: ["欠薪金额", "欠薪主体", "付款承诺"],
    how_to_get: "保存原件和清晰照片；如没有欠条，可通过微信请对方确认欠款金额。",
  },
  {
    key: "photos",
    label: "工作照片 / 视频",
    proves: ["在该工地工作的事实", "工种和工作内容", "工地位置"],
    how_to_get: "保留带时间、地点信息的原图；拍摄工地大门、项目公示牌、工作场景。",
  },
  {
    key: "badge",
    label: "工牌 / 安全帽 / 门禁卡 / 出入证",
    proves: ["与项目或用工单位的关联", "进场施工事实"],
    how_to_get: "拍照保存带有公司名称、项目名称或编号的工牌、安全帽标识。",
  },
  {
    key: "witness",
    label: "工友证言",
    proves: ["共同工作事实", "工资约定", "欠薪情况"],
    how_to_get: "记录工友姓名、电话和工作岗位，先征得对方同意；必要时请其出具书面说明。",
  },
  {
    key: "recording",
    label: "通话录音 / 现场录音",
    proves: ["对方承认欠薪", "工资约定", "催要经过"],
    how_to_get: "保存原始录音文件，不要剪辑；整理文字摘要和录音时间、对话双方。",
  },
  {
    key: "contract",
    label: "劳动合同 / 劳务协议 / 进场协议",
    proves: ["用工主体", "工资约定", "工作期限"],
    how_to_get: "保存原件和每一页照片；注意签约单位名称、盖章和签字。",
  },
  {
    key: "other",
    label: "其他材料",
    proves: ["根据材料内容判断"],
    how_to_get: "保留原始载体，并整理一份材料说明。",
  },
];

export function catalogMap(): Record<string, EvidenceCatalogItem> {
  return Object.fromEntries(EVIDENCE_CATALOG.map((item) => [item.key, item]));
}

export function analyzeEvidence(facts: Facts): Record<string, unknown> {
  const catalog = catalogMap();
  const ownedKeys = ((facts.evidence as string[] | undefined) ?? []).filter((key) => key in catalog);
  const have: Array<Record<string, unknown>> = ownedKeys.map((key) => ({
    key,
    label: catalog[key].label,
    proves: catalog[key].proves,
    how_to_get: catalog[key].how_to_get,
  }));
  if (facts.evidence_other) {
    have.push({
      key: "other",
      label: "其他材料",
      proves: ["根据材料内容判断"],
      how_to_get: facts.evidence_other,
    });
  }

  const needed: Array<Record<string, unknown>> = [];
  const alternatives: Array<Record<string, unknown>> = [];
  const verify: Array<Record<string, unknown>> = [];

  if (facts.has_contract !== "yes") {
    const contractReason =
      facts.has_contract === "no"
        ? "你已说明没有签书面合同，可优先补充其他能证明用工关系的材料。"
        : "目前未确认存在书面合同，可优先寻找或补充其他能证明用工关系的材料。";
    needed.push({ key: "contract", label: "劳动合同或书面劳务协议", reason: contractReason });
  }

  if (!ownedKeys.includes("wage_sheet") && !ownedKeys.includes("iou")) {
    needed.push({
      key: "wage_sheet",
      label: "工资表 / 结算单 / 记工记录",
      reason: "用于说明工资如何计算、应发多少、已发多少、还欠多少。",
    });
  }
  if (!ownedKeys.includes("chat")) {
    alternatives.push({
      key: "chat",
      label: "通过微信请对方确认欠薪",
      reason: "可在不激化矛盾的前提下，发送一条核对金额和工作天数的消息，对方回复可作为辅助证据。",
    });
  }
  if (!ownedKeys.includes("attendance")) {
    alternatives.push({
      key: "witness",
      label: "工友证言 + 工作照片",
      reason: "没有考勤时，工友证言、带时间地点的工作照片、门禁或工牌可以辅助证明工作事实。",
    });
  }
  if (!ownedKeys.includes("transfer")) {
    alternatives.push({
      key: "transfer",
      label: "查找历史工资转账记录",
      reason: "即使只有部分工资转账，也能帮助识别付款主体和已付金额。",
    });
  }
  if (!ownedKeys.length) {
    alternatives.push({
      key: "witness",
      label: "先联系工友，固定共同工作事实",
      reason: "暂时没有书面材料并不等于无法维权，可从证人、现场照片、聊天记录逐步补充。",
    });
  }

  if (!facts.project_name && !facts.contractor_name) {
    verify.push({
      key: "project_info",
      label: "项目名称或施工总承包单位",
      reason: "有助于确定管辖和核查对象，可从工地公示牌、工牌、工资表或工友处了解。",
    });
  }
  if (!facts.recruiter_name) {
    verify.push({
      key: "recruiter_name",
      label: "招用人和付款人的真实身份",
      reason: "需要核实包工头或劳务公司的姓名、电话、公司全称，避免投诉对象错误。",
    });
  }
  verify.push({
    key: "amount_reconcile",
    label: "工资总额、已付金额和欠款金额的核对",
    reason: "建议按工作天数、单价和已付款逐项核对，金额不确定的应标注“约”，避免夸大。",
  });
  if (!facts.work_start || !facts.work_end) {
    verify.push({
      key: "work_period",
      label: "准确的起止工作时间",
      reason: "影响监察时效、仲裁时效和欠薪金额计算，尽量通过聊天、车票、考勤等还原。",
    });
  }

  let summary: string;
  if (facts.evidence_status === "none") {
    summary = "目前没有整理出书面材料。这不等于无法维权，建议先固定工友证言、聊天记录和现场照片，再向人社部门咨询。";
  } else if (have.length) {
    summary = `已整理 ${have.length} 类材料。建议保留原始载体，并按“证明什么”分类整理。`;
  } else {
    summary = "尚未确认已有哪些材料，建议从聊天记录、考勤、工资表和转账记录开始查找。";
  }

  return {
    summary,
    have,
    needed,
    alternatives,
    verify,
    disclaimer: "缺少某一份材料不等于无法维权。证据是否被采信，由行政机关或仲裁、司法机关依法判断。",
    catalog: EVIDENCE_CATALOG,
  };
}