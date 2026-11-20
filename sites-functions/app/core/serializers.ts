import { requiredProgress } from "./facts.ts";
import type { CaseRow, StoredMessage } from "./types.ts";
import { pyRound } from "./util.ts";

export function serializeMessage(message: StoredMessage): Record<string, unknown> {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    meta: message.meta ?? {},
    created_at: message.created_at ?? null,
  };
}

export function planSteps(caseRow: CaseRow): Array<Record<string, unknown>> {
  const plan = caseRow.derived_results?.action_plan as { steps?: Array<Record<string, unknown>> } | undefined;
  return plan?.steps ?? [];
}

export function serializeCase(caseRow: CaseRow, includeMessages = true): Record<string, unknown> {
  const steps = planSteps(caseRow);
  const doneSteps = steps.filter((step) => step.done).length;
  const intake = caseRow.intake ?? {};
  const payload: Record<string, unknown> = {
    id: caseRow.id,
    title: caseRow.title,
    scene: caseRow.scene,
    status: caseRow.status,
    is_demo: caseRow.is_demo,
    facts_revision: caseRow.facts_revision,
    facts: caseRow.facts,
    intake: {
      confirmed: Boolean(intake.confirmed),
      unknowns: intake.unknowns ?? {},
      skipped: intake.skipped ?? [],
      agent_memory: intake.agent_memory ?? {},
      agent_materials: intake.agent_materials ?? {},
      agent_stage: intake.agent_stage ?? null,
    },
    progress: requiredProgress(caseRow.facts, intake),
    step_progress: {
      done: doneSteps,
      total: steps.length,
      percent: steps.length ? pyRound((doneSteps / steps.length) * 100) : 0,
    },
    plan_generated_at: caseRow.plan_generated_at ?? null,
    created_at: caseRow.created_at ?? null,
    updated_at: caseRow.updated_at ?? null,
  };
  if (includeMessages) {
    payload.messages = (caseRow.messages ?? []).map(serializeMessage);
  }
  return payload;
}

export function serializeCaseBrief(caseRow: CaseRow): Record<string, unknown> {
  const facts = caseRow.facts;
  return {
    id: caseRow.id,
    title: caseRow.title,
    scene: caseRow.scene,
    status: caseRow.status,
    is_demo: caseRow.is_demo,
    facts_revision: caseRow.facts_revision,
    city: facts.location_city ?? null,
    district: facts.location_district ?? null,
    work_type: facts.work_type ?? null,
    owed_amount: facts.owed_amount ?? null,
    owed_amount_approx: facts.owed_amount_approx ?? null,
    progress: requiredProgress(facts, caseRow.intake ?? {}),
    created_at: caseRow.created_at ?? null,
    updated_at: caseRow.updated_at ?? null,
  };
}