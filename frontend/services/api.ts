import { getSessionId } from "@/lib/session";
import type {
  ActionPlanResponse,
  AnalysisResponse,
  CaseBrief,
  CaseRecord,
  FormAssistantResponse,
  LegalBasisResponse,
  Meta,
  SendMessageResponse,
} from "@/types/api";

const API_BASE = import.meta.env?.VITE_SITES_FUNCTION === "true" ? "/functions/v1/app/api/py" : "/api/py";

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function makeIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new Error("已停止"));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(signal.reason ?? new Error("已停止"));
    }, { once: true });
  });
}

// Transient upstream faults recover by resuming the same durable intent (same
// idempotency key), so they never double-commit. Terminal business failures
// (qca_turn_failed / qca_scope_invalid) are intentionally excluded.
const TRANSIENT_QCA_CODES = new Set([
  "qca_unavailable", "qca_initialization_pending", "qca_busy", "qca_rate_limited", "service_unavailable",
  // Another turn for this case still holds the server lock (e.g. after the user
  // stopped watching a reply that is still finishing). Wait it out and resume.
  "lock_busy",
]);
function isTransientQcaError(err: unknown): boolean {
  return err instanceof ApiError && typeof err.code === "string" && TRANSIENT_QCA_CODES.has(err.code);
}

// A dropped transport (fetch TypeError) leaves the durable intent intact, so
// resuming with the same idempotency key recovers without double-committing.
function isTransportFailure(err: unknown): boolean {
  return err instanceof TypeError;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("X-Session-Id", getSessionId());
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });
  if (!response.ok) {
    let detail = `请求失败（${response.status}）`;
    let code: string | undefined;
    try {
      const data = await response.json();
      if (typeof data.detail === "string") detail = data.detail;
      else if (Array.isArray(data.detail)) {
        detail = data.detail.map((item: { msg?: string }) => item.msg || "参数错误").join("；");
      }
      if (typeof data.error === "string") code = data.error;
    } catch {
      // Keep the generic message.
    }
    throw new ApiError(detail, response.status, code);
  }
  return (await response.json()) as T;
}

let metaPromise: Promise<Meta> | null = null;

async function streamOnce(
  caseId: string,
  content: string,
  key: string,
  onEvent: (event: AgentStreamEvent) => void,
  signal: AbortSignal,
): Promise<{ done: true; result: SendMessageResponse } | { done: false }> {
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let settled = false;
  try {
    const response = await fetch(`${API_BASE}/cases/${caseId}/messages/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Session-Id": getSessionId() },
      body: JSON.stringify({ content, idempotency_key: key }),
      signal,
    });
    if (!response.ok) {
      const body = response.headers.get("content-type")?.includes("application/json") ? await response.json() : null;
      const message = response.status >= 500 ? "暂时无法连接，请稍后重试。" : "无法开始回复，请重试。";
      throw new ApiError(typeof body?.detail === "string" ? body.detail : message, response.status, body?.error);
    }
    if (!response.body) throw new Error("浏览器未提供可读取的数据流");
    reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let pending = false;
    while (true) {
      const chunk = await reader.read();
      buffer += decoder.decode(chunk.value, { stream: !chunk.done });
      buffer = buffer.replace(/\r\n/g, "\n");
      let boundary: number;
      while ((boundary = buffer.indexOf("\n\n")) !== -1) {
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const data = block.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n");
        if (!data) continue;
        const event = JSON.parse(data);
        if (event.type === "error") throw new ApiError(event.message ?? "本轮处理失败，请重试。", 503, event.code);
        if (event.type === "done") {
          settled = true;
          return { done: true, result: event.result as SendMessageResponse };
        }
        if (event.type === "pending") {
          pending = true;
          continue;
        }
        onEvent(event as AgentStreamEvent);
      }
      if (chunk.done) {
        if (pending) return { done: false };
        throw new Error("连接中断，回复尚未完成，请重试。");
      }
    }
  } finally {
    if (!settled) reader?.cancel().catch(() => {});
    reader?.releaseLock();
  }
}

export const api = {
  getMeta(): Promise<Meta> {
    if (!metaPromise) {
      metaPromise = request<Meta>("/meta");
    }
    return metaPromise;
  },
  getAgentSettings() {
    return request<AgentSettings>("/agent/settings");
  },
  async saveAgentSettings(payload: AgentSettingsInput) {
    const result = await request<AgentSettings>("/agent/settings", {method: "PUT", body: JSON.stringify(payload)});
    metaPromise = null;
    return result;
  },
  async disableAgentModel() {
    const result = await request<AgentSettings>("/agent/settings", {method: "DELETE"});
    metaPromise = null;
    return result;
  },
  testAgentSettings(payload: AgentSettingsInput) {
    return request<{ok: boolean; model: string; usage: Record<string, number>; note: string}>("/agent/settings/test", {method: "POST", body: JSON.stringify(payload)});
  },
  createCase(scene = "construction_wage_arrears") {
    return request<{ case: CaseRecord }>("/cases", {
      method: "POST",
      body: JSON.stringify({ scene }),
    });
  },
  createDemo() {
    return request<{ case: CaseRecord }>("/cases/demo", { method: "POST" });
  },
  listCases() {
    return request<{ cases: CaseBrief[] }>("/cases");
  },
  getCase(caseId: string) {
    return request<{ case: CaseRecord }>(`/cases/${caseId}`);
  },
  deleteCase(caseId: string) {
    return request<{ deleted: boolean }>(`/cases/${caseId}`, { method: "DELETE" });
  },
  async sendMessage(caseId: string, content: string, idempotencyKey?: string): Promise<SendMessageResponse> {
    const key = idempotencyKey ?? makeIdempotencyKey();
    const deadline = Date.now() + 180_000;
    for (let attempt = 0; ; attempt++) {
      try {
        return await request<SendMessageResponse>(`/cases/${caseId}/messages`, {
          method: "POST",
          body: JSON.stringify({ content, idempotency_key: key }),
        });
      } catch (err) {
        const pending = isTransientQcaError(err);
        if (!pending || Date.now() > deadline || attempt >= 8) throw err;
        await delay(1000);
      }
    }
  },
  async sendMessageStream(caseId: string, content: string, onEvent: (event: AgentStreamEvent) => void, signal?: AbortSignal, idempotencyKey?: string): Promise<SendMessageResponse> {
    const key = idempotencyKey ?? makeIdempotencyKey();
    const controller = new AbortController();
    const cancel = () => controller.abort(new Error("已停止接收回复，可检查案件记录后继续。"));
    signal?.addEventListener("abort", cancel, {once: true});
    if (signal?.aborted) cancel();
    const deadline = Date.now() + 180_000;
    let completed = false;
    try {
      for (let attempt = 0; ; attempt++) {
        let outcome: { done: true; result: SendMessageResponse } | { done: false };
        try {
          outcome = await streamOnce(caseId, content, key, onEvent, controller.signal);
        } catch (err) {
          if ((isTransientQcaError(err) || isTransportFailure(err)) && !controller.signal.aborted && Date.now() <= deadline && attempt < 90) {
            onEvent({type: "status", text: "正在继续生成回复…"});
            const busy = err instanceof ApiError && err.code === "lock_busy";
            await delay(busy ? 2000 : 800, controller.signal);
            continue;
          }
          throw err;
        }
        if (outcome.done) {
          completed = true;
          return outcome.result;
        }
        if (Date.now() > deadline || attempt >= 8) {
          throw new ApiError("本轮处理时间较长，请稍后在案件页重试。", 503, "qca_initialization_pending");
        }
        onEvent({type: "status", text: "正在继续生成回复…"});
        await delay(800, controller.signal);
      }
    } finally {
      signal?.removeEventListener("abort", cancel);
      if (!completed) controller.abort();
    }
  },
  updateFacts(caseId: string, facts: Record<string, unknown>) {
    return request<{
      case: CaseRecord;
      next_question: unknown;
      progress: unknown;
    }>(`/cases/${caseId}/facts`, {
      method: "PATCH",
      body: JSON.stringify({ facts }),
    });
  },
  getAnalysis(caseId: string) {
    return request<AnalysisResponse>(`/cases/${caseId}/analysis`);
  },
  getLegalBasis(caseId: string) {
    return request<LegalBasisResponse>(`/cases/${caseId}/legal-basis`);
  },
  getActionPlan(caseId: string) {
    return request<ActionPlanResponse>(`/cases/${caseId}/action-plan`);
  },
  updateStep(caseId: string, stepId: string, done: boolean) {
    return request<ActionPlanResponse>(`/cases/${caseId}/action-plan/steps/${stepId}`, {
      method: "PATCH",
      body: JSON.stringify({ done }),
    });
  },
  getFormAssistant(caseId: string) {
    return request<FormAssistantResponse>(`/cases/${caseId}/form-assistant`);
  },
  async downloadExport(caseId: string, format: "docx" | "pdf" | "txt") {
    const response = await fetch(`${API_BASE}/cases/${caseId}/export/${format}`, {
      headers: { "X-Session-Id": getSessionId() },
    });
    if (!response.ok) {
      let detail = "导出失败";
      try {
        const data = await response.json();
        detail = data.detail || detail;
      } catch {
        // ignore
      }
      throw new ApiError(detail, response.status);
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `工友权益助手-案件材料.${format}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  },
};

export interface AgentSettingsInput {
  base_url: string;
  model: string;
  api_key: string;
}

export type AgentStreamEvent =
  | {type: "status"; text: string}
  | {type: "reply_snapshot"; text: string; citations?: Array<Record<string, unknown>>}
  | {type: "reply_reset"}
  | {type: "action"; action: string; ok: boolean};

export interface AgentSettings {
  mode: "ai" | "mock";
  base_url: string;
  model: string;
  key_configured: boolean;
  source: "session" | "environment";
  storage: string;
}

export interface RegionTree {
  province: { id: string; name: string; official_code: string };
  cities: Array<{ name: string; code: string; districts: string[] }>;
  note: string;
}

let regionPromise: Promise<RegionTree> | null = null;

export function getRegions(): Promise<RegionTree> {
  if (!regionPromise) {
    regionPromise = fetch(`${API_BASE}/regions/henan`, { cache: "no-store" }).then(
      async (response) => {
        if (!response.ok) throw new ApiError("无法读取地区数据", response.status);
        return (await response.json()) as RegionTree;
      },
    );
  }
  return regionPromise;
}
