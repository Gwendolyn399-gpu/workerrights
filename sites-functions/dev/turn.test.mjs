import assert from "node:assert/strict";
import { test } from "node:test";
import { createFakeDb } from "./fake-db.mjs";
import { createFakeQca } from "./fake-qca.mjs";
import { createCoordinator } from "../app/qca/coordinator.ts";
import { driveTurn } from "../app/qca/turn.ts";
import { LegalRetriever } from "../app/core/retriever.ts";
import { NEW_CASE_FACTS } from "../app/core/facts.ts";
import { getOwnedCase, insertCase, insertIntent, newCaseRow, getIntent } from "../app/core/store.ts";
import { OUT_OF_SCOPE, URGENT } from "../app/qca/boundary.ts";
import { newId, nowIso } from "../app/core/util.ts";

const owner = "user-1";
const bindings = {
  consult: { agent: { type: "agent", id: "agent_consult", version: 1 }, environment_id: "env_x" },
  classify: { agent: { type: "agent", id: "agent_classify", version: 1 }, environment_id: "env_x" },
  review: { agent: { type: "agent", id: "agent_review", version: 1 }, environment_id: "env_x" },
  model: "model-a",
};

async function setup(qcaOptions) {
  const db = createFakeDb();
  const client = createFakeQca(qcaOptions);
  const coordinator = createCoordinator(db, 60_000);
  const retriever = new LegalRetriever();
  const deps = { db, client, coordinator, bindings, retriever };
  const caseRow = newCaseRow(owner, "construction_wage_arrears", NEW_CASE_FACTS);
  caseRow.intake = { confirmed: false, unknowns: {}, skipped: [], agent_stage: "waiting_user" };
  await insertCase(db, caseRow);
  return { db, client, coordinator, deps, caseRow };
}

async function makeIntent(db, caseRow, fingerprint = "fp-test") {
  const now = nowIso();
  const intent = {
    id: newId(), case_id: caseRow.id, owner_id: owner, idempotency_key: newId(), fingerprint,
    state: "pending", session_id: null, prompt_event_id: null, last_event_id: null,
    result: null, error: null, created_at: now, updated_at: now,
  };
  await insertIntent(db, intent);
  return intent;
}

test("off_topic route commits the fixed boundary reply without fact changes", async () => {
  const { db, deps, caseRow } = await setup({ classifyRoute: "off_topic" });
  const intent = await makeIntent(db, caseRow);
  const events = [];
  const outcome = await driveTurn(deps, intent.id, "今天天气怎么样？", (e) => events.push(e), Date.now() + 30_000);
  assert.equal(outcome.status, "done");
  assert.equal(outcome.result.assistant_message.content, OUT_OF_SCOPE);
  const saved = await getOwnedCase(db, caseRow.id, owner);
  assert.equal(saved.messages.length, 2);
  assert.equal(saved.messages[0].role, "user");
  assert.equal(saved.messages[1].role, "assistant");
  assert.deepEqual(saved.facts, NEW_CASE_FACTS);
  assert.equal((await getIntent(db, intent.id)).state, "done");
  assert.ok(events.some((e) => e.type === "done"));
});

test("urgent route commits the urgent guidance reply", async () => {
  const { db, deps, caseRow } = await setup({ classifyRoute: "urgent" });
  const intent = await makeIntent(db, caseRow);
  const outcome = await driveTurn(deps, intent.id, "我受伤了流血不止", () => {}, Date.now() + 30_000);
  assert.equal(outcome.status, "done");
  assert.equal(outcome.result.assistant_message.content, URGENT);
});

test("re-driving a done intent returns the stored result idempotently", async () => {
  const { db, deps, caseRow } = await setup({ classifyRoute: "off_topic" });
  const intent = await makeIntent(db, caseRow);
  const first = await driveTurn(deps, intent.id, "今天天气怎么样？", () => {}, Date.now() + 30_000);
  const second = await driveTurn(deps, intent.id, "今天天气怎么样？", () => {}, Date.now() + 30_000);
  assert.deepEqual(second.result, first.result);
  const saved = await getOwnedCase(db, caseRow.id, owner);
  assert.equal(saved.messages.length, 2);
});

test("case route records facts and commits a validated respond", async () => {
  const text = "我在郑州市干钢筋工，工资没结清。";
  const { db, deps, caseRow } = await setup({
    classifyRoute: "case",
    recordFactsArgs: { patch: { location_city: "郑州市", work_type: "钢筋工" }, source_quote: "我在郑州市干钢筋工" },
    respondArgs: { reply: "我记下了：郑州的钢筋工，工资还没结清。", response_kind: "chat", next_question: null, stage: "waiting_user", citation_ids: [] },
  });
  const intent = await makeIntent(db, caseRow);
  const outcome = await driveTurn(deps, intent.id, text, () => {}, Date.now() + 30_000);
  assert.equal(outcome.status, "done");
  const saved = await getOwnedCase(db, caseRow.id, owner);
  assert.equal(saved.facts.location_city, "郑州市");
  assert.equal(saved.facts.work_type, "钢筋工");
  assert.equal(saved.facts_revision, 1);
  assert.equal(saved.status, "collecting");
  assert.equal(saved.messages.length, 2);
  assert.equal(saved.messages[1].meta.updated_facts.location_city, "郑州市");
  assert.equal(saved.messages[1].meta.run_id, intent.fingerprint);
});

test("a pending turn resumes with the same intent and commits once", async () => {
  const text = "我在郑州市干钢筋工，工资没结清。";
  const { db, deps, caseRow } = await setup({
    classifyRoute: "case",
    recordFactsArgs: { patch: { location_city: "郑州市", work_type: "钢筋工" }, source_quote: "我在郑州市干钢筋工" },
    respondArgs: { reply: "我记下了：郑州的钢筋工，工资还没结清。", response_kind: "chat", next_question: null, stage: "waiting_user", citation_ids: [] },
  });
  const intent = await makeIntent(db, caseRow);
  const first = await driveTurn(deps, intent.id, text, () => {}, Date.now() - 1000);
  assert.equal(first.status, "pending");
  const midIntent = await getIntent(db, intent.id);
  assert.equal(midIntent.state, "running");
  assert.ok(midIntent.prompt_event_id);
  const before = await getOwnedCase(db, caseRow.id, owner);
  assert.equal(before.messages.length, 0);

  const second = await driveTurn(deps, intent.id, text, () => {}, Date.now() + 30_000);
  assert.equal(second.status, "done");
  const saved = await getOwnedCase(db, caseRow.id, owner);
  assert.equal(saved.messages.length, 2);
  assert.equal(saved.facts.location_city, "郑州市");
  assert.equal(saved.facts_revision, 1);
});

test("review-blocked reply discards working fact changes", async () => {
  const text = "我在郑州市干钢筋工，工资没结清。";
  const { db, deps, caseRow } = await setup({
    classifyRoute: "case",
    reviewAllowed: false,
    recordFactsArgs: { patch: { location_city: "郑州市", work_type: "钢筋工" }, source_quote: "我在郑州市干钢筋工" },
    respondArgs: { reply: "我记下了。", response_kind: "chat", next_question: null, stage: "waiting_user", citation_ids: [] },
  });
  const intent = await makeIntent(db, caseRow);
  const outcome = await driveTurn(deps, intent.id, text, () => {}, Date.now() + 30_000);
  assert.equal(outcome.status, "done");
  const saved = await getOwnedCase(db, caseRow.id, owner);
  assert.deepEqual(saved.facts, NEW_CASE_FACTS);
  assert.equal(saved.facts_revision, 0);
  assert.equal(saved.messages.length, 2);
});