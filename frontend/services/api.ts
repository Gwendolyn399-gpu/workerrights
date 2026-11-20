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

const API_BASE = "/api/py";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
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
    try {
      const data = await response.json();
      if (typeof data.detail === "string") detail = data.detail;
      else if (Array.isArray(data.detail)) {
        detail = data.detail.map((item: { msg?: string }) => item.msg || "参数错误").join("；");
      }
    } catch {
      // Keep the generic message.
    }
    throw new ApiError(detail, response.status);
  }
  return (await response.json()) as T;
}

let metaPromise: Promise<Meta> | null = null;

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
  sendMessage(caseId: string, content: string) {
    return request<SendMessageResponse>(`/cases/${caseId}/messages`, {
      method: "POST",
      body: JSON.stringify({ content }),
    });
  },
  async sendMessageStream(caseId: string, content: string, onEvent: (event: AgentStreamEvent) => void, signal?: AbortSignal): Promise<SendMessageResponse> {
    const controller = new AbortController();
    const cancel = () => controller.abort(new Error("已停止接收回复，可检查案件记录后继续。"));
    signal?.addEventListener("abort", cancel, {once: true});
    if (signal?.aborted) cancel();
    const timeout = setTimeout(() => controller.abort(new Error("本轮等待超过90秒，已停止，请稍后重试。")), 90_000);
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let completed = false;
    try {
    const response = await fetch(`${API_BASE}/cases/${caseId}/messages/stream`, {
      method: "POST", headers: {"Content-Type": "application/json", "X-Session-Id": getSessionId()},
      body: JSON.stringify({content}), signal: controller.signal,
    });
    if (!response.ok) {
      const body = response.headers.get("content-type")?.includes("application/json") ? await response.json() : null;
      const message = response.status >= 500 ? "暂时无法连接，请稍后重试。" : "无法开始回复，请重试。";
      throw new ApiError(typeof body?.detail === "string" ? body.detail : message, response.status);
    }
    if (!response.body) throw new Error("浏览器未提供可读取的数据流");
    reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
      while (true) {
        const chunk = await reader.read();
        buffer += decoder.decode(chunk.value, {stream: !chunk.done});
        buffer = buffer.replace(/\r\n/g, "\n");
        let boundary: number;
        while ((boundary = buffer.indexOf("\n\n")) !== -1) {
          const block = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2);
          const data = block.split("\n").filter(line => line.startsWith("data:")).map(line => line.slice(5).trimStart()).join("\n");
          if (!data) continue;
          const event = JSON.parse(data);
          if (event.type === "error") throw new Error(event.message);
          if (event.type === "done") {
            completed = true;
            return event.result as SendMessageResponse;
          }
          onEvent(event as AgentStreamEvent);
        }
        if (chunk.done) throw new Error("连接中断，回复尚未完成，请重试。");
      }
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", cancel);
      if (!completed) controller.abort();
      reader?.releaseLock();
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
