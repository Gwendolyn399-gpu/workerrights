export type ActionStageKey = "now" | "next" | "later";

export const ACTION_STAGES: Array<{
  key: ActionStageKey;
  label: string;
  hint: string;
  stepKeys: string[];
}> = [
  {
    key: "now",
    label: "现在",
    hint: "先把聊天、考勤、转账和现场情况固定住。",
    stepKeys: ["freeze-evidence"],
  },
  {
    key: "next",
    label: "下一步",
    hint: "把账算清，并留下一次书面确认。",
    stepKeys: ["reconcile-amount", "written-confirm"],
  },
  {
    key: "later",
    label: "之后",
    hint: "找对渠道办理；有些渠道可以同时准备。",
    stepKeys: [
      "labor-supervision",
      "national-platform",
      "housing-authority",
      "labor-arbitration",
      "legal-aid",
    ],
  },
];

const STEP_STAGE = new Map<string, ActionStageKey>(
  ACTION_STAGES.flatMap((stage) => stage.stepKeys.map((key) => [key, stage.key])),
);

export interface StageGroup<T> {
  key: ActionStageKey;
  label: string;
  hint: string;
  steps: T[];
  done: number;
  total: number;
}

export function stageKeyForStep(stepKey: string): ActionStageKey {
  return STEP_STAGE.get(stepKey) ?? "later";
}

export function groupActionSteps<T extends { step_key: string; done: boolean }>(
  steps: T[],
): StageGroup<T>[] {
  return ACTION_STAGES.map((stage) => {
    const grouped = steps.filter((step) => stageKeyForStep(step.step_key) === stage.key);
    return {
      key: stage.key,
      label: stage.label,
      hint: stage.hint,
      steps: grouped,
      done: grouped.filter((step) => step.done).length,
      total: grouped.length,
    };
  });
}

export function getCurrentStageKey(groups: StageGroup<unknown>[]): ActionStageKey {
  return groups.find((group) => group.total > 0 && group.done < group.total)?.key ?? "later";
}
