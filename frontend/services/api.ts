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
      metaPromise = fetch(`${API_BASE}/meta`, { cache: "no-store" }).then(async (response) => {
        if (!response.ok) throw new ApiError("无法读取服务信息", response.status);
        return (await response.json()) as Meta;
      });
    }
    return metaPromise;
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
