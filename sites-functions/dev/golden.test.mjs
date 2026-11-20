import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  buildCaseTitle, buildRelationship, evidenceLabels, formatAck, formatAmount, generationFacts,
  locationText, recordFactChange, requiredProgress, workPeriodText,
} from "../app/core/facts.ts";
import { analyzeEvidence, EVIDENCE_CATALOG } from "../app/core/evidence.ts";
import {
  buildConfirmationMessage, buildEvidenceDirectory, buildFormalStatement, buildShortDescription,
} from "../app/core/statement.ts";
import { checkAmounts } from "../app/core/facts.ts";
import { LegalRetriever, tokenize } from "../app/core/retriever.ts";

const fixtures = JSON.parse(readFileSync(fileURLToPath(new URL("./golden/fixtures.json", import.meta.url)), "utf-8"));
const retriever = new LegalRetriever();

function each(name, fn) {
  test(`golden: ${name}`, () => {
    for (const [index, item] of fixtures[name].entries()) {
      assert.deepEqual(fn(item), item.out, `${name}[${index}]`);
    }
  });
}

each("format_amount", (i) => formatAmount(i.value, i.approximate));
each("location_text", (i) => locationText(i.facts));
each("work_period_text", (i) => workPeriodText(i.facts));
each("evidence_labels", (i) => evidenceLabels(i.keys, EVIDENCE_CATALOG));
each("required_progress", (i) => requiredProgress(i.facts, i.intake));
each("build_case_title", (i) => buildCaseTitle(i.facts));
each("build_relationship", (i) => buildRelationship(i.facts));
each("generation_facts", (i) => generationFacts(i.facts));
each("format_ack", (i) => formatAck(i.updates, i.facts));
each("check_amounts", (i) => checkAmounts(i.facts));
each("analyze_evidence", (i) => analyzeEvidence(i.facts));
each("build_formal_statement", (i) => buildFormalStatement(i.facts));
each("build_short_description", (i) => buildShortDescription(i.facts));
each("build_evidence_directory", (i) => buildEvidenceDirectory(i.facts));
each("build_confirmation_message", (i) => buildConfirmationMessage(i.facts));
each("tokenize", (i) => tokenize(i.text));
each("search", (i) => retriever.search(i.query, i.top_k));

test("golden: all_documents", () => {
  assert.deepEqual(retriever.allDocuments(), fixtures.all_documents);
});

test("golden: record_fact_change", () => {
  for (const [index, item] of fixtures.record_fact_change.entries()) {
    const caseRow = { facts: structuredClone(item.after), facts_revision: 0, intake: { confirmed: true }, status: "ready" };
    const changed = recordFactChange(caseRow, structuredClone(item.before), { preserveConfirmation: item.preserve });
    assert.equal(changed, item.changed, `changed[${index}]`);
    assert.equal(caseRow.facts_revision, item.facts_revision, `revision[${index}]`);
    assert.deepEqual(caseRow.intake, item.intake, `intake[${index}]`);
    assert.equal(caseRow.status, item.status, `status[${index}]`);
  }
});