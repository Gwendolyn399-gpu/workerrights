import { describe, expect, it } from "vitest";

import { getCurrentStageKey, groupActionSteps, stageKeyForStep } from "@/lib/action-stages";

const step = (step_key: string, done = false) => ({ step_key, done });

describe("action stages", () => {
  it("groups the 8 known steps into 1 / 2 / 5", () => {
    const groups = groupActionSteps([
      step("freeze-evidence"),
      step("reconcile-amount"),
      step("written-confirm"),
      step("labor-supervision"),
      step("national-platform"),
      step("housing-authority"),
      step("labor-arbitration"),
      step("legal-aid"),
    ]);

    expect(groups.map((group) => group.total)).toEqual([1, 2, 5]);
    expect(groups.map((group) => group.label)).toEqual(["现在", "下一步", "之后"]);
  });

  it("moves the current stage as earlier steps are completed", () => {
    expect(getCurrentStageKey(groupActionSteps([step("freeze-evidence"), step("reconcile-amount")]))).toBe(
      "now",
    );
    expect(
      getCurrentStageKey(
        groupActionSteps([step("freeze-evidence", true), step("reconcile-amount")]),
      ),
    ).toBe("next");
    expect(
      getCurrentStageKey(
        groupActionSteps([
          step("freeze-evidence", true),
          step("reconcile-amount", true),
          step("written-confirm", true),
          step("labor-supervision"),
        ]),
      ),
    ).toBe("later");
  });

  it("keeps all-complete plans on the last stage", () => {
    expect(
      getCurrentStageKey(
        groupActionSteps([
          step("freeze-evidence", true),
          step("reconcile-amount", true),
          step("written-confirm", true),
          step("legal-aid", true),
        ]),
      ),
    ).toBe("later");
  });

  it("does not drop unknown step keys", () => {
    expect(stageKeyForStep("new-backend-step")).toBe("later");
    const groups = groupActionSteps([step("new-backend-step")]);
    expect(groups[2].total).toBe(1);
  });

  it("preserves backend step order inside a stage", () => {
    const groups = groupActionSteps([step("reconcile-amount"), step("written-confirm")]);
    expect(groups[1].steps.map((item) => item.step_key)).toEqual([
      "reconcile-amount",
      "written-confirm",
    ]);
  });
});
