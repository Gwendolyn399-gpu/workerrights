import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runCaseAnalysis } from "../app/core/analysis.ts";
import { ensureActionPlan } from "../app/core/action_plan.ts";
import { runFormAssistant } from "../app/core/form_assistant.ts";
import { runLegalResearch } from "../app/core/legal_research.ts";
import { buildExportSections, buildPlainText } from "../app/core/export.ts";
import { LegalRetriever } from "../app/core/retriever.ts";
import { newCaseRow } from "../app/core/store.ts";
import { deepClone } from "../app/core/util.ts";

const fixtures = JSON.parse(readFileSync(new URL("./golden/agents_fixtures.json", import.meta.url), "utf8"));
const retriever = new LegalRetriever();

function firstDiff(actual, expected, path = "") {
  if (actual === expected) return null;
  if (typeof actual !== typeof expected) return `${path}: type ${typeof actual} != ${typeof expected}`;
  if (actual === null || expected === null || typeof actual !== "object") {
    return `${path}: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`;
  }
  if (Array.isArray(actual) !== Array.isArray(expected)) return `${path}: array mismatch`;
  if (Array.isArray(actual)) {
    if (actual.length !== expected.length) return `${path}: length ${actual.length} != ${expected.length}`;
    for (let i = 0; i < actual.length; i++) {
      const diff = firstDiff(actual[i], expected[i], `${path}[${i}]`);
      if (diff) return diff;
    }
    return null;
  }
  const keys = new Set([...Object.keys(actual), ...Object.keys(expected)]);
  for (const key of keys) {
    const diff = firstDiff(actual[key], expected[key], `${path}.${key}`);
    if (diff) return diff;
  }
  return null;
}

function buildCase(item) {
  const caseRow = newCaseRow("owner-parity", "construction_wage_arrears", item.facts, false);
  caseRow.id = item.analysis.case_id;
  caseRow.title = item.title;
  caseRow.status = "ready";
  caseRow.intake = deepClone(item.intake);
  caseRow.facts_meta = {};
  caseRow.derived_results = {};
  caseRow.facts_revision = 0;
  return caseRow;
}

function stripGenerated(result) {
  const out = deepClone(result);
  delete out.generated_at;
  return out;
}

function stripPlan(result) {
  const out = deepClone(result);
  delete out.generated_at;
  if (Array.isArray(out.steps)) {
    out.steps = out.steps.map((step) => {
      const copy = { ...step };
      delete copy.id;
      return copy;
    });
  }
  return out;
}

for (const [index, item] of fixtures.entries()) {
  test(`agent generators parity case ${index} (intake confirmed=${Boolean(item.intake.confirmed)})`, () => {
    const caseRow = buildCase(item);
    const legal = runLegalResearch(caseRow, retriever);
    const analysis = runCaseAnalysis(caseRow, retriever);
    const plan = ensureActionPlan(caseRow, retriever);
    const form = runFormAssistant(caseRow);
    const sections = buildExportSections(caseRow, analysis, plan);
    const text = buildPlainText(caseRow, analysis, plan);

    const checks = [
      ["legal", legal, item.legal],
      ["analysis", stripGenerated(analysis), item.analysis],
      ["plan", stripPlan(plan), item.plan],
      ["form", stripGenerated(form), item.form],
      ["export_sections", sections, item.export_sections],
      ["export_text", text, item.export_text],
    ];
    for (const [name, actual, expected] of checks) {
      const diff = firstDiff(actual, expected, name);
      assert.equal(diff, null, `${name} mismatch -> ${diff}`);
    }
  });
}