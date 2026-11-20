import assert from "node:assert/strict";
import test from "node:test";
import { application } from "../app/routes.ts";
import { createCoordinator } from "../app/qca/coordinator.ts";
import { LegalRetriever } from "../app/core/retriever.ts";
import { createFakeDb } from "./fake-db.mjs";
import { createFakeQca } from "./fake-qca.mjs";
import { newId } from "../app/core/util.ts";

const owner = "owner-routes";
const bindings = {
  consult: { agent: { type: "agent", id: "agent_consult", version: 1 }, environment_id: "env_x" },
  classify: { agent: { type: "agent", id: "agent_classify", version: 1 }, environment_id: "env_x" },
  review: { agent: { type: "agent", id: "agent_review", version: 1 }, environment_id: "env_x" },
  model: "model-a",
};

function makeApp(qcaOptions = {}) {
  const db = createFakeDb();
  const client = createFakeQca({
    classifyRoute: "case",
    recordFactsArgs: { patch: { location_city: "郑州市", work_type: "钢筋工" }, source_quote: "我在郑州市干钢筋工" },
    respondArgs: { reply: "我记下了：郑州的钢筋工，工资还没结清。", response_kind: "chat", next_question: null, stage: "waiting_user", citation_ids: [] },
    ...qcaOptions,
  });
  const coordinator = createCoordinator(db, 60_000);
  const app = application({
    db,
    requireUser: (ctx) => ({ user_id: ctx.request.headers.get("x-test-user") ?? owner }),
    qca: { client, coordinator, ensureBindings: async () => bindings },
    retriever: new LegalRetriever(),
  });
  return { app, db };
}

function request(method, path, { body, user, headers } = {}) {
  return new Request(`https://site.test/api/py${path}`, {
    method,
    headers: { "content-type": "application/json", ...(user ? { "x-test-user": user } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function call(app, method, path, options) {
  const response = await app({ request: request(method, path, options) });
  const type = response.headers.get("content-type") ?? "";
  if (type.includes("text/event-stream")) return { status: response.status, stream: await response.text() };
  if (type.includes("application/json")) return { status: response.status, json: await response.json() };
  return { status: response.status, bytes: new Uint8Array(await response.arrayBuffer()), type };
}

test("full case lifecycle over HTTP", async () => {
  const { app } = makeApp();
  const health = await call(app, "GET", "/health");
  assert.equal(health.status, 200);
  assert.equal(health.json.status, "ok");

  const created = await call(app, "POST", "/cases", { body: {} });
  assert.equal(created.status, 201);
  const caseId = created.json.case.id;
  assert.equal(created.json.case.messages.length, 1);

  const key = newId();
  const sent = await call(app, "POST", `/cases/${caseId}/messages`, { body: { content: "我在郑州市干钢筋工，工资没结清。", idempotency_key: key } });
  assert.equal(sent.status, 200);
  assert.ok(sent.json.assistant_message.content.includes("郑州"));

  const retry = await call(app, "POST", `/cases/${caseId}/messages`, { body: { content: "我在郑州市干钢筋工，工资没结清。", idempotency_key: key } });
  assert.equal(retry.status, 200);
  assert.deepEqual(retry.json, sent.json);

  const fetched = await call(app, "GET", `/cases/${caseId}`);
  assert.equal(fetched.json.case.messages.length, 3);
  assert.equal(fetched.json.case.facts.location_city, "郑州市");

  const analysis = await call(app, "GET", `/cases/${caseId}/analysis`);
  assert.equal(analysis.status, 200);
  assert.equal(analysis.json.preliminary, true);
  assert.ok(analysis.json.basic_info.length);

  const plan = await call(app, "GET", `/cases/${caseId}/action-plan`);
  assert.equal(plan.json.steps.length, 8);
  const stepId = plan.json.steps[0].id;

  const form = await call(app, "GET", `/cases/${caseId}/form-assistant`);
  assert.ok(form.json.steps.length);

  const legal = await call(app, "GET", `/cases/${caseId}/legal-basis`);
  assert.ok(legal.json.provisions.length);

  const stepped = await call(app, "PATCH", `/cases/${caseId}/action-plan/steps/${stepId}`, { body: { done: true } });
  assert.equal(stepped.status, 200);
  assert.equal(stepped.json.progress.done, 1);

  const txt = await call(app, "GET", `/cases/${caseId}/export/txt`);
  assert.equal(txt.status, 200);
  assert.ok(new TextDecoder().decode(txt.bytes).includes("案件基本情况"));
  const docx = await call(app, "GET", `/cases/${caseId}/export/docx`);
  assert.equal(docx.bytes[0], 0x50);
  const pdf = await call(app, "GET", `/cases/${caseId}/export/pdf`);
  assert.equal(new TextDecoder().decode(pdf.bytes.subarray(0, 5)), "%PDF-");

  // Fact correction invalidates derived results: export now refuses stale data.
  const patched = await call(app, "PATCH", `/cases/${caseId}/facts`, { body: { facts: { owed_amount: 20000 } } });
  assert.equal(patched.status, 200);
  assert.equal(patched.json.case.facts.owed_amount, 20000);
  const staleExport = await call(app, "GET", `/cases/${caseId}/export/txt`);
  assert.equal(staleExport.status, 409);
  const staleStep = await call(app, "PATCH", `/cases/${caseId}/action-plan/steps/${stepId}`, { body: { done: true } });
  assert.equal(staleStep.status, 409);
  // GET still returns the retained stale snapshot with a preliminary overlay.
  const staleAnalysis = await call(app, "GET", `/cases/${caseId}/analysis`);
  assert.equal(staleAnalysis.status, 200);

  const list = await call(app, "GET", "/cases");
  assert.ok(list.json.cases.some((item) => item.id === caseId));

  const removed = await call(app, "DELETE", `/cases/${caseId}`);
  assert.equal(removed.json.deleted, true);
  const afterDelete = await call(app, "GET", `/cases/${caseId}`);
  assert.equal(afterDelete.status, 404);
});

test("stream endpoint emits reply_snapshot and done", async () => {
  const { app } = makeApp();
  const created = await call(app, "POST", "/cases", { body: {} });
  const caseId = created.json.case.id;
  const streamed = await call(app, "POST", `/cases/${caseId}/messages/stream`, { body: { content: "我在郑州市干钢筋工。" } });
  assert.equal(streamed.status, 200);
  assert.ok(streamed.stream.includes("reply_snapshot"));
  assert.ok(streamed.stream.includes("\"done\"") || streamed.stream.includes("event: done"));
});

test("cases are isolated per owner", async () => {
  const { app } = makeApp();
  const created = await call(app, "POST", "/cases", { body: {} });
  const caseId = created.json.case.id;
  const other = await call(app, "GET", `/cases/${caseId}`, { user: "someone-else" });
  assert.equal(other.status, 404);
  const otherList = await call(app, "GET", "/cases", { user: "someone-else" });
  assert.equal(otherList.json.cases.length, 0);
});

test("demo case is created once and reused", async () => {
  const { app } = makeApp();
  const first = await call(app, "POST", "/cases/demo", { body: {} });
  assert.equal(first.status, 201);
  assert.equal(first.json.is_demo, true);
  const second = await call(app, "POST", "/cases/demo", { body: {} });
  assert.equal(second.json.case.id, first.json.case.id);
  assert.equal(second.json.case.status, "planned");
});

test("unauthenticated requests are rejected", async () => {
  const db = createFakeDb();
  const app = application({ db, qca: null, retriever: new LegalRetriever() });
  const response = await app({ request: new Request("https://site.test/api/py/cases") });
  assert.equal(response.status, 401);
});