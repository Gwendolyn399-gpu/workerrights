import { describe, expect, it } from "vitest";

import {
  CHECK_LABELS,
  evidenceLabels,
  factRows,
  locationValue,
  missingChecks,
  periodValue,
  wageValue,
} from "@/lib/facts";
import { formatAmount, statusLabel, verificationLabel } from "@/lib/utils";
import type { CaseFacts, EvidenceCatalogItem } from "@/types/api";

const facts: CaseFacts = {
  location_province: "河南省",
  location_city: "郑州市",
  location_district: "金水区",
  work_type: "钢筋工",
  duration_text: "3个月",
  wage_basis: "按天",
  daily_wage: 350,
  owed_amount: 20000,
  agreed_amount: 26000,
  paid_amount: 6000,
  has_contract: "no",
  recruiter_type: "包工头",
  manager_role: "包工头",
  evidence: ["chat", "attendance"],
};

const catalog: EvidenceCatalogItem[] = [
  { key: "chat", label: "微信聊天记录", proves: [], how_to_get: "" },
  { key: "attendance", label: "考勤记录", proves: [], how_to_get: "" },
];

describe("amount and date formatting", () => {
  it("formats amounts with approximate marker", () => {
    expect(formatAmount(20000)).toBe("2万元");
    expect(formatAmount(23500)).toBe("2.4万元");
    expect(formatAmount(350)).toBe("350元");
    expect(formatAmount(20000, true)).toBe("约2万元");
    expect(formatAmount(null)).toBe("待核实");
  });

  it("maps status labels", () => {
    expect(statusLabel("ready")).toBe("信息已确认");
    expect(statusLabel("planned")).toBe("已生成行动方案");
    expect(verificationLabel("transcribed")).toBe("待逐条核验");
    expect(verificationLabel("official_only")).toBe("仅官方填写");
  });
});

describe("fact presentation", () => {
  it("builds location, period and wage summaries", () => {
    expect(locationValue(facts)).toBe("河南 · 郑州市 · 金水区");
    expect(locationValue({})).toBe("待核实");
    expect(periodValue(facts)).toBe("约3个月");
    expect(periodValue({ work_start: "2025-03", work_end: "2025-06" })).toBe(
      "2025-03 至 2025-06",
    );
    expect(wageValue(facts)).toBe("按天，每天350元");
  });

  it("labels evidence from the server catalog", () => {
    expect(evidenceLabels(["chat", "attendance"], catalog)).toBe("微信聊天记录、考勤记录");
    expect(evidenceLabels(["unknown-key"], catalog)).toBe("unknown-key");
    expect(evidenceLabels([], catalog)).toBe("待核实");
  });

  it("marks known and unknown rows", () => {
    const rows = factRows(facts, catalog);
    expect(rows.find((row) => row.key === "owed")?.value).toBe("2万元");
    expect(rows.find((row) => row.key === "contract")?.value).toBe("未签");
    expect(rows.find((row) => row.key === "recruiter")?.value).toBe("包工头");
    const empty = factRows({}, catalog);
    expect(empty.every((row) => row.known === false)).toBe(true);
  });

  it("lists missing checks by label", () => {
    expect(missingChecks({ location: true, owed_amount: false, evidence: false })).toEqual([
      CHECK_LABELS.owed_amount,
      CHECK_LABELS.evidence,
    ]);
  });
});
