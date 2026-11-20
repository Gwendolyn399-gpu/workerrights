import { PERSONA } from "../knowledge/data.ts";
import { fail } from "../core/errors.ts";
import { CLASSIFY_INSTRUCTION, CLASSIFY_TOOL, POLICY, REVIEW_INSTRUCTION, REVIEW_TOOL } from "./boundary.ts";
import { toolDefinitions } from "./tools.ts";
import { createCloudAgentsClient, ensureCloudResources, CloudAgentsError } from "./cloud-agents.mjs";
import type { Coordinator } from "./coordinator.ts";

export type QcaClient = ReturnType<typeof createCloudAgentsClient>;

export interface AgentBinding {
  agent: { type: "agent"; id: string; version: number };
  environment_id: string;
}

export interface QcaBindings {
  consult: AgentBinding;
  classify: AgentBinding;
  review: AgentBinding;
  model: string;
}

const personaText = PERSONA.replace(/\r\n/g, "\n").replace(/^\uFEFF/, "");

export async function selectModel(client: QcaClient, configured?: string): Promise<string> {
  if (configured && configured.trim()) return configured.trim();
  const result = await client.request("/api/v1/cloud/models");
  const models = Array.isArray(result?.data) ? result.data : [];
  const enabled = models
    .filter((model: any) => model && typeof model.id === "string" && model.is_enabled !== false)
    .map((model: any) => model.id as string)
    .sort();
  if (!enabled.length) fail("qca_no_model", 503, "云端模型暂不可用，请稍后重试。");
  return enabled[0];
}

export function agentDefinitions(model: string) {
  const metadata = { app: "workerrights" };
  return {
    consult: {
      name: "workerrights-consult",
      model,
      system: personaText,
      tools: toolDefinitions(),
      metadata: { ...metadata, role: "consult" },
    },
    classify: {
      name: "workerrights-scope-classify",
      model,
      system: POLICY + "\n" + CLASSIFY_INSTRUCTION,
      tools: [CLASSIFY_TOOL],
      metadata: { ...metadata, role: "scope_classify" },
    },
    review: {
      name: "workerrights-scope-review",
      model,
      system: POLICY + "\n" + REVIEW_INSTRUCTION,
      tools: [REVIEW_TOOL],
      metadata: { ...metadata, role: "scope_review" },
    },
  };
}

const ENVIRONMENT_DEFINITION = {
  name: "workerrights-env",
  config: { type: "cloud" },
  metadata: { app: "workerrights" },
};

export async function ensureBindings(
  client: QcaClient,
  coordinator: Coordinator,
  applicationScope: string,
  configuredModel?: string,
): Promise<QcaBindings> {
  const model = await selectModel(client, configuredModel);
  const definitions = agentDefinitions(model);
  const consult = await ensureCloudResources({ client, coordinator, applicationScope, agent: definitions.consult, environment: ENVIRONMENT_DEFINITION });
  const classify = await ensureCloudResources({ client, coordinator, applicationScope, agent: definitions.classify, environment: ENVIRONMENT_DEFINITION });
  const review = await ensureCloudResources({ client, coordinator, applicationScope, agent: definitions.review, environment: ENVIRONMENT_DEFINITION });
  return { consult, classify, review, model };
}

// Safe projection of upstream failures: retryable message only, no raw details.
export function qcaFailure(error: unknown): never {
  if (error instanceof CloudAgentsError) {
    if (error.code === "ai_not_configured" || error.code === "ai_configuration_invalid") {
      fail("qca_not_configured", 503, "云端咨询尚未配置完成，请稍后重试。");
    }
    if (error.code === "ai_access_denied") {
      fail("qca_access_denied", 503, "云端咨询授权不可用，请稍后重试。");
    }
    if (error.code === "ai_initialization_pending" || error.status === 202) {
      fail("qca_initialization_pending", 503, "云端咨询正在初始化，请稍后重试。");
    }
    if (error.code === "ai_initialization_rejected" || error.code === "ai_initialization_conflict" || error.code === "ai_resource_repair_required") {
      fail("qca_initialization_failed", 503, "云端咨询初始化失败，请稍后重试。");
    }
    if (error.code === "ai_rate_limited") {
      fail("qca_rate_limited", 503, "云端咨询繁忙，请稍后重试。");
    }
    if (error.code === "ai_conflict") {
      fail("qca_busy", 409, "上一轮还在处理，请稍后重试。");
    }
    fail("qca_unavailable", 503, "云端咨询暂时不可用，请稍后重试。");
  }
  throw error;
}