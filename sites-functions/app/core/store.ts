import { fail, httpError } from "./errors.ts";
import type { CaseRow, StoredMessage } from "./types.ts";
import { deepClone, isUuid, newId, nowIso } from "./util.ts";

export interface DbResult {
  data: any;
  error: { code: string; status: number } | null;
}

export interface DbQuery extends PromiseLike<DbResult> {
  select(columns?: string): DbQuery;
  eq(key: string, value: unknown): DbQuery;
  order(key: string, options?: { ascending?: boolean }): DbQuery;
  limit(count: number): DbQuery;
  insert(value: Record<string, unknown>): DbQuery;
  insertIfAbsent(value: Record<string, unknown>, options: { onConflict: string }): DbQuery;
  update(value: Record<string, unknown>): DbQuery;
}

export interface Db {
  from(table: string): DbQuery;
}

export function rows(result: DbResult): any[] {
  if (result.error) {
    fail(result.error.code, result.error.status || 503, "数据服务暂时不可用，请稍后重试。");
  }
  return result.data ?? [];
}

export const CASE_COLUMNS =
  "id,owner_id,scene,title,is_demo,status,facts,facts_revision,facts_meta,intake,derived_results,messages,message_seq,row_version,plan_generated_at,deleted,created_at,updated_at";

const MUTABLE_COLUMNS = [
  "title", "status", "facts", "facts_revision", "facts_meta", "intake",
  "derived_results", "messages", "message_seq", "plan_generated_at", "deleted",
] as const;

export async function getOwnedCase(db: Db, caseId: string, ownerId: string): Promise<CaseRow> {
  if (!isUuid(caseId)) httpError(404, "案件不存在或无权访问。");
  const found = rows(
    await db.from("cases").select(CASE_COLUMNS).eq("id", caseId).eq("owner_id", ownerId).limit(1),
  );
  if (!found.length || found[0].deleted) httpError(404, "案件不存在或无权访问。");
  return found[0] as CaseRow;
}

export async function listCases(db: Db, ownerId: string): Promise<CaseRow[]> {
  return rows(
    await db.from("cases").select(CASE_COLUMNS)
      .eq("owner_id", ownerId).eq("deleted", false)
      .order("updated_at", { ascending: false }).limit(100),
  ) as CaseRow[];
}

export async function insertCase(db: Db, caseRow: CaseRow): Promise<void> {
  rows(await db.from("cases").insert({ ...caseRow }));
}

// Ownership and row_version are predicates of the write itself (CAS).
export async function saveCase(db: Db, caseRow: CaseRow, expectedVersion: number): Promise<CaseRow> {
  const values: Record<string, unknown> = { row_version: expectedVersion + 1, updated_at: nowIso() };
  for (const key of MUTABLE_COLUMNS) values[key] = (caseRow as any)[key];
  const updated = rows(
    await db.from("cases").update(values)
      .eq("id", caseRow.id).eq("owner_id", caseRow.owner_id).eq("row_version", expectedVersion)
      .select(CASE_COLUMNS),
  );
  if (!updated.length) fail("write_conflict", 409, "案件已被其他操作更新，请刷新后重试。");
  return updated[0] as CaseRow;
}

export function appendMessage(caseRow: CaseRow, role: StoredMessage["role"], content: string, meta: Record<string, unknown>): StoredMessage {
  caseRow.message_seq += 1;
  const message: StoredMessage = { id: caseRow.message_seq, role, content, meta, created_at: nowIso() };
  caseRow.messages = [...(caseRow.messages ?? []), message];
  return message;
}

export function newCaseRow(ownerId: string, scene: string, facts: CaseRow["facts"], isDemo = false): CaseRow {
  const now = nowIso();
  return {
    id: newId(),
    owner_id: ownerId,
    scene,
    title: "新的欠薪咨询",
    is_demo: isDemo,
    status: "collecting",
    facts: deepClone(facts),
    facts_revision: 0,
    facts_meta: {},
    intake: {},
    derived_results: {},
    messages: [],
    message_seq: 0,
    row_version: 0,
    plan_generated_at: null,
    deleted: false,
    created_at: now,
    updated_at: now,
  };
}

export interface QcaIntent {
  id: string;
  case_id: string;
  owner_id: string;
  idempotency_key: string;
  fingerprint: string;
  state: string;
  session_id: string | null;
  prompt_event_id: string | null;
  last_event_id: string | null;
  result: Record<string, unknown> | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

const INTENT_COLUMNS =
  "id,case_id,owner_id,idempotency_key,fingerprint,state,session_id,prompt_event_id,last_event_id,result,error,created_at,updated_at";

export async function findIntent(db: Db, caseId: string, idempotencyKey: string): Promise<QcaIntent | null> {
  const found = rows(
    await db.from("qca_intents").select(INTENT_COLUMNS)
      .eq("case_id", caseId).eq("idempotency_key", idempotencyKey).limit(1),
  );
  return found.length ? (found[0] as QcaIntent) : null;
}

export async function getIntent(db: Db, intentId: string): Promise<QcaIntent | null> {
  const found = rows(
    await db.from("qca_intents").select(INTENT_COLUMNS).eq("id", intentId).limit(1),
  );
  return found.length ? (found[0] as QcaIntent) : null;
}

// Latest intent for a logical message position; lets a retry reuse a running
// turn instead of dispatching a duplicate prompt.
export async function findIntentByFingerprint(db: Db, caseId: string, fingerprint: string): Promise<QcaIntent | null> {
  const found = rows(
    await db.from("qca_intents").select(INTENT_COLUMNS)
      .eq("case_id", caseId).eq("fingerprint", fingerprint)
      .order("created_at", { ascending: false }).limit(1),
  );
  return found.length ? (found[0] as QcaIntent) : null;
}

export async function insertIntent(db: Db, intent: QcaIntent): Promise<boolean> {
  const inserted = rows(
    await db.from("qca_intents").insertIfAbsent({ ...intent }, { onConflict: "case_id,idempotency_key" })
      .select("id"),
  );
  return inserted.length > 0;
}

export async function updateIntent(db: Db, intent: QcaIntent, expectedState: string): Promise<QcaIntent> {
  const updated = rows(
    await db.from("qca_intents").update({
      state: intent.state,
      session_id: intent.session_id,
      prompt_event_id: intent.prompt_event_id,
      last_event_id: intent.last_event_id,
      result: intent.result,
      error: intent.error,
      updated_at: nowIso(),
    })
      .eq("id", intent.id).eq("case_id", intent.case_id).eq("state", expectedState)
      .select(INTENT_COLUMNS),
  );
  if (!updated.length) fail("write_conflict", 409, "本轮状态已变化，请重试。");
  return updated[0] as QcaIntent;
}