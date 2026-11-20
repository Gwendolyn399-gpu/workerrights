import { saveCase, type Db } from "./store.ts";
import type { CaseRow } from "./types.ts";
import { deepClone } from "./util.ts";

// Mirrors AgentOrchestrator._derived_result: cache keyed by facts_revision.
// GET retains stale snapshots; response overlays must not enter the cache.
export async function derivedResult(
  db: Db,
  caseRow: CaseRow,
  key: string,
  generate: () => Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const cache = caseRow.derived_results ?? {};
  if (!(key in cache)) {
    const result = deepClone(generate());
    result.generated_from_revision = caseRow.facts_revision;
    caseRow.derived_results = { ...cache, [key]: result };
    const saved = await saveCase(db, caseRow, caseRow.row_version);
    caseRow.row_version = saved.row_version;
    caseRow.updated_at = saved.updated_at;
  }
  return deepClone(caseRow.derived_results[key]);
}