import { describe, expect, it } from "vitest";
import { isResultStale } from "../../frontend/lib/result-revision";

describe("derived result revision", () => {
  it("does not mark the current version stale", () => {
    expect(isResultStale(4, 4)).toBe(false);
    expect(isResultStale(0, 0)).toBe(false);
  });
  it("marks a persisted older result stale after reload", () => {
    const persisted = JSON.parse('{"facts_revision":5,"generated_from_revision":4}');
    expect(isResultStale(persisted.facts_revision, persisted.generated_from_revision)).toBe(true);
  });
  it("does not accept a mismatched future version", () => {
    expect(isResultStale(3, 4)).toBe(true);
  });
});
