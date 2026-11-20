import { describe, expect, it } from "vitest";

import { caseDisplayTitle } from "@/lib/case-title";
import type { Progress } from "@/types/api";

const progress = (done: number): Progress => ({
  checks: {},
  done,
  total: 11,
  percent: done > 0 ? 100 : 0,
  unknown_count: 0,
});

describe("case display title", () => {
  it("hides the scene default until the user has answered something", () => {
    expect(caseDisplayTitle({ title: "河南建筑工地欠薪", is_demo: false, progress: progress(0) })).toBe(
      "新的咨询",
    );
    expect(caseDisplayTitle({ title: "河南建筑工地欠薪", is_demo: false, progress: progress(1) })).toBe(
      "河南建筑工地欠薪",
    );
  });

  it("keeps the title of a demo case from the start", () => {
    expect(caseDisplayTitle({ title: "虚构演示 · 郑州工地", is_demo: true, progress: progress(0) })).toBe(
      "虚构演示 · 郑州工地",
    );
  });

  it("falls back for a blank title", () => {
    expect(caseDisplayTitle({ title: "   ", is_demo: false, progress: progress(4) })).toBe("新的咨询");
    expect(
      caseDisplayTitle({
        title: null as unknown as string,
        is_demo: true,
        progress: progress(0),
      }),
    ).toBe("新的咨询");
  });
});
