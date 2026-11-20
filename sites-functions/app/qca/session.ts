import { AppError, fail } from "../core/errors.ts";
import type { CaseRow } from "../core/types.ts";
import { nowIso } from "../core/util.ts";
import { CloudAgentsError } from "./cloud-agents.mjs";
import type { QcaClient, AgentBinding } from "./resources.ts";
import { qcaFailure } from "./resources.ts";
import type { Coordinator } from "./coordinator.ts";
import { readSSE } from "./sse.mjs";

export interface QcaEvent {
  id: string;
  type: string;
  processed_at?: string;
  [key: string]: unknown;
}

export function textBlocks(text: string): Array<{ type: "text"; text: string }> {
  return [{ type: "text", text }];
}

export async function sendEvents(
  client: QcaClient,
  sessionId: string,
  events: Array<Record<string, unknown>>,
): Promise<QcaEvent[]> {
  const result = await client.request(`/api/v1/cloud/sessions/${sessionId}/events`, {
    method: "POST",
    body: { events },
  });
  if (!Array.isArray(result?.data)) fail("qca_unavailable", 503, "云端咨询暂时不可用，请稍后重试。");
  return result.data as QcaEvent[];
}

export async function getSession(client: QcaClient, sessionId: string): Promise<any> {
  return client.request(`/api/v1/cloud/sessions/${sessionId}`);
}

// CN QCA occasionally returns 404 for a healthy session's event reads (a
// transient read-after-write / state-transition fault that clears on retry).
// Retry only ai_resource_not_found a few times so one turn recovers internally
// instead of forcing a full client re-drive; a genuinely gone session still
// surfaces after the bounded attempts and is reconciled on the next resume.
async function retryNotFound<T>(run: () => Promise<T>, attempts = 4, delayMs = 1200): Promise<T> {
  let last: unknown;
  for (let index = 0; index < attempts; index++) {
    try {
      return await run();
    } catch (error) {
      last = error;
      if (!(error instanceof CloudAgentsError && error.code === "ai_resource_not_found") || index === attempts - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw last;
}

export async function archiveSession(client: QcaClient, sessionId: string): Promise<void> {
  try {
    await client.request(`/api/v1/cloud/sessions/${sessionId}/archive`, { method: "POST" });
  } catch {
    // Cleanup is best-effort; an orphaned decision session holds no case data.
  }
}

export async function cancelSession(client: QcaClient, sessionId: string): Promise<void> {
  try {
    await client.request(`/api/v1/cloud/sessions/${sessionId}/cancel`, { method: "POST" });
  } catch {
    // Best-effort.
  }
}

export async function listEventsAfter(
  client: QcaClient,
  sessionId: string,
  afterId: string | null,
  maxPages = 20,
): Promise<{ events: QcaEvent[]; complete: boolean }> {
  const events: QcaEvent[] = [];
  let page: string | undefined;
  for (let index = 0; index < maxPages; index++) {
    const query = afterId && !page
      ? `order=asc&limit=100&after_id=${encodeURIComponent(afterId)}`
      : `order=asc&limit=100${page ? `&page=${encodeURIComponent(page)}` : ""}`;
    const result = await retryNotFound(() => client.request(`/api/v1/cloud/sessions/${sessionId}/events?${query}`));
    if (!Array.isArray(result?.data) || typeof result.has_more !== "boolean") {
      fail("qca_unavailable", 503, "云端咨询暂时不可用，请稍后重试。");
    }
    events.push(...(result.data as QcaEvent[]));
    if (!result.has_more) return { events, complete: true };
    if (typeof result.next_page !== "string" || !result.next_page) {
      fail("qca_unavailable", 503, "云端咨询暂时不可用，请稍后重试。");
    }
    page = result.next_page;
    afterId = null;
  }
  return { events, complete: false };
}

export async function latestEventId(client: QcaClient, sessionId: string): Promise<string | null> {
  const result = await retryNotFound(() => client.request(`/api/v1/cloud/sessions/${sessionId}/events?order=desc&limit=1`));
  const data = Array.isArray(result?.data) ? result.data : [];
  return data.length && typeof data[0].id === "string" ? data[0].id : null;
}

export interface StreamFrame {
  event: string;
  id: string;
  data: any;
}

export async function* streamFrames(
  client: QcaClient,
  sessionId: string,
  options: { lastEventId?: string | null; signal?: AbortSignal } = {},
): AsyncGenerator<StreamFrame> {
  const stream = await client.openStream(sessionId, {
    lastEventId: options.lastEventId ?? undefined,
    signal: options.signal,
  });
  try {
    for await (const frame of readSSE(stream.body, { signal: options.signal })) {
      let data: any;
      try {
        data = JSON.parse(frame.data);
      } catch {
        fail("qca_unavailable", 503, "云端咨询暂时不可用，请稍后重试。");
      }
      yield { event: frame.event, id: frame.id, data };
    }
  } finally {
    stream.close();
  }
}

async function findCaseSessions(client: QcaClient, caseId: string, ownerId: string): Promise<{ matches: any[]; complete: boolean }> {
  const matches: any[] = [];
  let page: string | undefined;
  for (let index = 0; index < 20; index++) {
    const result = await client.request(`/api/v1/cloud/sessions?limit=100${page ? `&page=${encodeURIComponent(page)}` : ""}`);
    if (!Array.isArray(result?.data) || typeof result.has_more !== "boolean") {
      fail("qca_unavailable", 503, "云端咨询暂时不可用，请稍后重试。");
    }
    for (const session of result.data) {
      const metadata = session?.metadata ?? {};
      if (!session?.archived_at && metadata.case_id === caseId && metadata.owner_id === ownerId && metadata.purpose === "consult") {
        matches.push(session);
      }
    }
    if (!result.has_more) return { matches, complete: true };
    if (typeof result.next_page !== "string" || !result.next_page) {
      fail("qca_unavailable", 503, "云端咨询暂时不可用，请稍后重试。");
    }
    page = result.next_page;
  }
  return { matches, complete: false };
}

async function createCaseSession(client: QcaClient, binding: AgentBinding, caseRow: CaseRow): Promise<string> {
  const session = await client.request("/api/v1/cloud/sessions", {
    method: "POST",
    body: {
      agent: binding.agent,
      environment_id: binding.environment_id,
      metadata: { app: "workerrights", purpose: "consult", case_id: caseRow.id, owner_id: caseRow.owner_id },
    },
  });
  if (typeof session?.id !== "string" || !/^sess_[A-Za-z0-9_-]+$/.test(session.id)) {
    console.error(JSON.stringify({ event: "sites_session_create_invalid", case_id: caseRow.id, id_type: typeof session?.id, keys: session && typeof session === "object" ? Object.keys(session) : null }));
    fail("qca_unavailable", 503, "云端咨询暂时不可用，请稍后重试。");
  }
  return session.id;
}

// Durable per-case session creation intent. The lock value survives expiry and
// takeover, so an ambiguous create is reconciled by metadata, never blind-resend.
export async function ensureCaseSession(
  client: QcaClient,
  coordinator: Coordinator,
  binding: AgentBinding,
  caseRow: CaseRow,
): Promise<string> {
  return coordinator.withLock(`session:${caseRow.id}`, async (lease) => {
    let record = await lease.read();
    if (record?.state === "ready" && typeof record.session_id === "string") {
      let healthy = false;
      try {
        const session = await getSession(client, record.session_id);
        healthy = !session?.archived_at && session?.status !== "terminated";
      } catch (error) {
        if (error instanceof CloudAgentsError && error.code === "ai_resource_not_found") healthy = false;
        else throw error;
      }
      if (!healthy) console.error(JSON.stringify({ event: "sites_session_unhealthy", case_id: caseRow.id, session_id: record.session_id }));
      if (healthy) return record.session_id;
      record = { state: "rejected", at: nowIso() };
      await lease.write(record);
    }
    if (record?.state === "creating" || record?.state === "unknown") {
      const { matches, complete } = await findCaseSessions(client, caseRow.id, caseRow.owner_id);
      await lease.assertHeld();
      if (matches.length > 1) fail("qca_initialization_failed", 503, "云端会话初始化失败，请稍后重试。");
      if (matches.length === 1) {
        await lease.write({ state: "ready", session_id: matches[0].id, agent_version: binding.agent.version, at: nowIso() });
        return matches[0].id;
      }
      const age = Date.now() - new Date(record.at ?? 0).getTime();
      if (!complete || age < 60_000) {
        fail("qca_initialization_pending", 503, "云端会话正在初始化，请稍后重试。");
      }
      // Complete scan found nothing and the attempt is stale: the create never landed.
    }
    await lease.write({ state: "creating", at: nowIso() });
    await lease.assertHeld();
    let sessionId: string;
    try {
      sessionId = await createCaseSession(client, binding, caseRow);
    } catch (error) {
      await lease.assertHeld();
      const rejected = error instanceof CloudAgentsError && error.outcome === "rejected";
      await lease.write({ state: rejected ? "rejected" : "unknown", at: nowIso() });
      if (rejected) qcaFailure(error);
      fail("qca_initialization_pending", 503, "云端会话正在初始化，请稍后重试。");
    }
    await lease.assertHeld();
    await lease.write({ state: "ready", session_id: sessionId, agent_version: binding.agent.version, at: nowIso() });
    return sessionId;
  });
}

// Answer a stale requires_action left by an interrupted previous turn so the
// session can accept the next prompt.
export async function releasePendingAction(client: QcaClient, sessionId: string): Promise<void> {
  const result = await client.request(`/api/v1/cloud/sessions/${sessionId}/events?order=desc&limit=100`);
  const events: QcaEvent[] = Array.isArray(result?.data) ? result.data : [];
  const answered = new Set<string>();
  for (const event of events) {
    if (event.type === "user.custom_tool_result" && typeof event.custom_tool_use_id === "string") {
      answered.add(event.custom_tool_use_id);
    }
  }
  for (const event of events) {
    if (event.type === "agent.custom_tool_use" && !answered.has(event.id)) {
      await sendEvents(client, sessionId, [{
        type: "user.custom_tool_result",
        custom_tool_use_id: event.id,
        content: textBlocks(JSON.stringify({ ok: true, notice: "上一轮已结束，该调用不再执行。" })),
      }]);
      return;
    }
  }
}

export interface DecisionResult<T> {
  decision: T;
  usage: Record<string, number>;
}

// One-shot boundary decision: fresh session, single forced custom tool, archive
// afterwards. No case data is written by this path.
export async function runDecision<T>(
  client: QcaClient,
  binding: AgentBinding,
  toolName: string,
  parse: (raw: unknown) => T,
  data: Record<string, unknown>,
  metadata: Record<string, unknown>,
  timeoutMs = 45_000,
): Promise<DecisionResult<T>> {
  const invalid = () => fail("qca_scope_invalid", 503, "服务范围检查未产生有效决定，本轮未执行或发布。");
  let sessionId: string;
  try {
    const session = await client.request("/api/v1/cloud/sessions", {
      method: "POST",
      body: { agent: binding.agent, environment_id: binding.environment_id, metadata },
    });
    if (typeof session?.id !== "string") invalid();
    sessionId = session.id;
  } catch (error) {
    if (error instanceof CloudAgentsError) qcaFailure(error);
    throw error;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let usage: Record<string, number> = {};
  try {
    await sendEvents(client, sessionId, [{ type: "user.message", content: textBlocks(JSON.stringify(data)) }]);
    let captured: unknown = undefined;
    let sawTool = false;
    for await (const frame of streamFrames(client, sessionId, { signal: controller.signal })) {
      const payload = frame.data ?? {};
      const type = payload.type ?? frame.event;
      if (type === "session.usage") {
        usage = { model_credits: Number(payload.model_credits ?? 0) };
      } else if (type === "agent.custom_tool_use") {
        if (payload.name !== toolName) invalid();
        sawTool = true;
        captured = payload.input;
        break;
      } else if (type === "session.error") {
        const retry = payload.error?.retry_status?.type;
        if (retry === "exhausted" || retry === "terminal") invalid();
      } else if (type === "session.status_terminated" || type === "session.deleted") {
        invalid();
      } else if (type === "session.status_idle") {
        if (!sawTool) invalid();
      }
    }
    if (!sawTool) invalid();
    let decision: T;
    try {
      decision = parse(captured);
    } catch {
      return invalid();
    }
    return { decision, usage };
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error instanceof CloudAgentsError) qcaFailure(error);
    return invalid();
  } finally {
    clearTimeout(timer);
    controller.abort();
    await cancelSession(client, sessionId);
    await archiveSession(client, sessionId);
  }
}