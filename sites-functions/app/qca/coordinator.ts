import { fail } from "../core/errors.ts";
import { rows, type Db } from "../core/store.ts";
import { newId, nowIso } from "../core/util.ts";

export interface Lease {
  read(): Promise<any>;
  write(value: unknown): Promise<void>;
  assertHeld(): Promise<void>;
  extend(): Promise<void>;
}

export interface Coordinator {
  withLock<T>(key: string, callback: (lease: Lease) => Promise<T>, options?: { reentrantKey?: string }): Promise<T>;
}

const LOCK_COLUMNS = "lock_key,holder,fencing,expires_at,value";
const lost = () => fail("lock_lost", 409, "处理权已转移，请重试。");
const busy = () => fail("lock_busy", 409, "正在进行另一轮处理，请稍后重试。");

// Durable cross-instance lock over qca_locks. Fencing tokens protect every
// lease write; an expired or same-turn (reentrant) holder may be superseded.
export function createCoordinator(db: Db, ttlMs = 120_000): Coordinator {
  const expiry = () => new Date(Date.now() + ttlMs).toISOString();
  const isExpired = (value: string) => new Date(value).getTime() <= Date.now();

  return {
    async withLock(key, callback, options = {}) {
      const holder = newId();
      const reentrantKey = options.reentrantKey;
      const initialValue = reentrantKey ? { reentrant: reentrantKey } : null;
      const inserted = rows(
        await db.from("qca_locks").insertIfAbsent(
          { lock_key: key, holder, fencing: 1, expires_at: expiry(), value: initialValue, updated_at: nowIso() },
          { onConflict: "lock_key" },
        ).select(LOCK_COLUMNS),
      );
      let fencing = 1;
      if (!inserted.length) {
        const existing = rows(
          await db.from("qca_locks").select(LOCK_COLUMNS).eq("lock_key", key).limit(1),
        );
        if (!existing.length) fail("lock_unavailable", 503, "数据服务暂时不可用，请稍后重试。");
        const row = existing[0];
        const reentrant = Boolean(reentrantKey) && row.value?.reentrant === reentrantKey;
        if (!isExpired(row.expires_at) && !reentrant) busy();
        fencing = row.fencing + 1;
        // Preserve the durable value (binding/creation intent) across takeover.
        const taken = rows(
          await db.from("qca_locks").update({ holder, fencing, expires_at: expiry(), updated_at: nowIso() })
            .eq("lock_key", key).eq("fencing", row.fencing).select("fencing"),
        );
        if (!taken.length) busy();
      }

      const predicate = (query: any) => query.eq("lock_key", key).eq("holder", holder).eq("fencing", fencing);
      const lease: Lease = {
        async read() {
          const found = rows(await predicate(db.from("qca_locks").select("value,expires_at")).limit(1));
          if (!found.length || isExpired(found[0].expires_at)) lost();
          return found[0].value ?? null;
        },
        async write(value) {
          const updated = rows(
            await predicate(db.from("qca_locks").update({ value, expires_at: expiry(), updated_at: nowIso() })).select("fencing"),
          );
          if (!updated.length) lost();
        },
        async assertHeld() {
          const found = rows(await predicate(db.from("qca_locks").select("expires_at")).limit(1));
          if (!found.length || isExpired(found[0].expires_at)) lost();
        },
        async extend() {
          const updated = rows(
            await predicate(db.from("qca_locks").update({ expires_at: expiry(), updated_at: nowIso() })).select("fencing"),
          );
          if (!updated.length) lost();
        },
      };

      try {
        return await callback(lease);
      } finally {
        try {
          await predicate(db.from("qca_locks").update({ expires_at: nowIso(), updated_at: nowIso() })).select("fencing");
        } catch {
          // Release is best-effort; expiry already bounds a dead holder.
        }
      }
    },
  };
}