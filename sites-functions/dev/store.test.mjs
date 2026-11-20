import assert from "node:assert/strict";
import { test } from "node:test";
import { createFakeDb } from "./fake-db.mjs";
import {
  appendMessage, findIntent, findIntentByFingerprint, getOwnedCase, insertCase, insertIntent,
  listCases, newCaseRow, saveCase, updateIntent,
} from "../app/core/store.ts";
import { createCoordinator } from "../app/qca/coordinator.ts";
import { NEW_CASE_FACTS, buildCaseTitle, recordFactChange, requiredProgress } from "../app/core/facts.ts";
import { nowIso } from "../app/core/util.ts";

const owner = "user-1";

async function seedCase(db) {
  const row = newCaseRow(owner, "construction_wage_arrears", NEW_CASE_FACTS);
  await insertCase(db, row);
  return row;
}

test("getOwnedCase enforces ownership and soft delete", async () => {
  const db = createFakeDb();
  const row = await seedCase(db);
  const fetched = await getOwnedCase(db, row.id, owner);
  assert.equal(fetched.id, row.id);
  await assert.rejects(() => getOwnedCase(db, row.id, "user-2"), /案件不存在/);
  await assert.rejects(() => getOwnedCase(db, "not-a-uuid", owner), /案件不存在/);
  fetched.deleted = true;
  await saveCase(db, fetched, fetched.row_version);
  await assert.rejects(() => getOwnedCase(db, row.id, owner), /案件不存在/);
});

test("saveCase is compare-and-set on row_version", async () => {
  const db = createFakeDb();
  const row = await seedCase(db);
  const a = await getOwnedCase(db, row.id, owner);
  const b = await getOwnedCase(db, row.id, owner);
  a.title = "甲";
  const saved = await saveCase(db, a, a.row_version);
  assert.equal(saved.row_version, 1);
  assert.equal(saved.title, "甲");
  b.title = "乙";
  await assert.rejects(() => saveCase(db, b, b.row_version), /案件已被其他操作更新/);
});

test("listCases filters deleted and orders by updated_at desc", async () => {
  const db = createFakeDb();
  const first = await seedCase(db);
  const second = await seedCase(db);
  const table = db._tables.get("cases");
  table.find((c) => c.id === first.id).updated_at = "2020-01-01T00:00:00.000Z";
  table.find((c) => c.id === second.id).updated_at = "2030-01-01T00:00:00.000Z";
  table.find((c) => c.id === first.id).deleted = true;
  const list = await listCases(db, owner);
  assert.equal(list.length, 1);
  assert.equal(list[0].id, second.id);
  assert.ok(list.every((c) => c.owner_id === owner && !c.deleted));
});

test("appendMessage increments seq and ids", async () => {
  const db = createFakeDb();
  const row = await seedCase(db);
  const m1 = appendMessage(row, "user", "你好", {});
  const m2 = appendMessage(row, "assistant", "在的", {});
  assert.equal(m1.id, 1);
  assert.equal(m2.id, 2);
  assert.equal(row.message_seq, 2);
  assert.equal(row.messages.length, 2);
});

test("intent insertIfAbsent dedups by (case_id,idempotency_key)", async () => {
  const db = createFakeDb();
  const row = await seedCase(db);
  const now = nowIso();
  const intent = {
    id: "11111111-1111-4111-8111-111111111111", case_id: row.id, owner_id: owner,
    idempotency_key: "22222222-2222-4222-8222-222222222222", fingerprint: "fp1", state: "pending",
    session_id: null, prompt_event_id: null, last_event_id: null, result: null, error: null,
    created_at: now, updated_at: now,
  };
  assert.equal(await insertIntent(db, intent), true);
  assert.equal(await insertIntent(db, { ...intent, id: "33333333-3333-4333-8333-333333333333" }), false);
  const found = await findIntent(db, row.id, intent.idempotency_key);
  assert.equal(found.id, intent.id);
  const byFp = await findIntentByFingerprint(db, row.id, "fp1");
  assert.equal(byFp.id, intent.id);
});

test("updateIntent CAS on state", async () => {
  const db = createFakeDb();
  const row = await seedCase(db);
  const now = nowIso();
  const intent = {
    id: "11111111-1111-4111-8111-111111111111", case_id: row.id, owner_id: owner,
    idempotency_key: "22222222-2222-4222-8222-222222222222", fingerprint: "fp1", state: "pending",
    session_id: null, prompt_event_id: null, last_event_id: null, result: null, error: null,
    created_at: now, updated_at: now,
  };
  await insertIntent(db, intent);
  intent.state = "running";
  const updated = await updateIntent(db, intent, "pending");
  assert.equal(updated.state, "running");
  await assert.rejects(() => updateIntent(db, intent, "pending"), /本轮状态已变化/);
});

test("recordFactChange bumps revision and resets confirmation", async () => {
  const db = createFakeDb();
  const row = await seedCase(db);
  row.intake = { confirmed: true };
  row.status = "ready";
  const before = structuredClone(row.facts);
  row.facts = { ...row.facts, owed_amount: 20000 };
  const changed = recordFactChange(row, before);
  assert.equal(changed, true);
  assert.equal(row.facts_revision, 1);
  assert.equal(row.intake.confirmed, false);
  assert.equal(row.status, "collecting");
  const unchanged = recordFactChange(row, structuredClone(row.facts));
  assert.equal(unchanged, false);
  assert.equal(row.facts_revision, 1);
});

test("recordFactChange preserveConfirmation keeps confirmed", async () => {
  const db = createFakeDb();
  const row = await seedCase(db);
  row.intake = { confirmed: true };
  const before = structuredClone(row.facts);
  row.facts = { ...row.facts, work_type: "钢筋工" };
  recordFactChange(row, before, { preserveConfirmation: true });
  assert.equal(row.intake.confirmed, true);
  assert.equal(row.facts_revision, 1);
});

test("requiredProgress reaches 99 before confirmation, 100 after", async () => {
  const facts = {
    ...NEW_CASE_FACTS, location_city: "郑州市", work_type: "钢筋工", duration_text: "约3个月",
    recruiter_type: "包工头", manager_role: "包工头", wage_basis: "按天", owed_amount: 20000,
    paid_amount: 6000, has_contract: "no", evidence: ["chat"],
  };
  const before = requiredProgress(facts, { confirmed: false });
  assert.equal(before.done, before.total);
  assert.equal(before.percent, 99);
  const after = requiredProgress(facts, { confirmed: true });
  assert.equal(after.percent, 100);
});

test("buildCaseTitle reflects location and amount", async () => {
  const title = buildCaseTitle({ ...NEW_CASE_FACTS, location_city: "郑州市", owed_amount: 20000 });
  assert.ok(title.includes("郑州"));
});

test("coordinator serializes and rejects concurrent holders", async () => {
  const db = createFakeDb();
  const coordinator = createCoordinator(db, 60_000);
  let inside = 0;
  let maxInside = 0;
  const job = () => coordinator.withLock("k", async (lease) => {
    inside++; maxInside = Math.max(maxInside, inside);
    await lease.assertHeld();
    await new Promise((r) => setTimeout(r, 20));
    inside--;
    return "ok";
  });
  const results = await Promise.allSettled([job(), job()]);
  const fulfilled = results.filter((r) => r.status === "fulfilled");
  const rejected = results.filter((r) => r.status === "rejected");
  assert.equal(fulfilled.length, 1);
  assert.equal(rejected.length, 1);
  assert.match(rejected[0].reason.message, /正在进行另一轮处理/);
  assert.equal(maxInside, 1);
});

test("coordinator reentrant key takes over its own active lock", async () => {
  const db = createFakeDb();
  const coordinator = createCoordinator(db, 60_000);
  let release;
  const gate = new Promise((r) => { release = r; });
  const first = coordinator.withLock("k", async () => { await gate; return "first"; }, { reentrantKey: "intent-1" });
  await new Promise((r) => setTimeout(r, 10));
  const second = await coordinator.withLock("k", async (lease) => {
    await lease.assertHeld();
    return "second";
  }, { reentrantKey: "intent-1" });
  assert.equal(second, "second");
  release();
  assert.equal(await first, "first");
});

test("coordinator lease write and extend persist value", async () => {
  const db = createFakeDb();
  const coordinator = createCoordinator(db, 60_000);
  await coordinator.withLock("k", async (lease) => {
    await lease.write({ step: 1 });
    assert.deepEqual(await lease.read(), { step: 1 });
    await lease.extend();
    await lease.assertHeld();
  });
  const row = db._tables.get("qca_locks")[0];
  assert.deepEqual(row.value, { step: 1 });
});