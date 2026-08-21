import type Redis from "ioredis";

/**
 * LockService (Phase 4 §33). Serializes operations on a resource (e.g. a note) so a
 * note cannot be concurrently spent by two operations. Redis is used to accelerate
 * cross-process locking in production; PostgreSQL remains the durable source of truth
 * for whether a note is actually spent.
 */
export interface LockService {
  withLock<T>(key: string, fn: () => Promise<T>): Promise<T>;
}

/** In-process mutex-per-key. Sufficient for a single-process deployment and tests. */
export class InMemoryLockService implements LockService {
  private chains = new Map<string, Promise<unknown>>();

  async withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.chains.get(key) ?? Promise.resolve();
    let release!: () => void;
    const next = new Promise<void>((r) => (release = r));
    this.chains.set(
      key,
      prev.then(() => next),
    );
    await prev.catch(() => {});
    try {
      return await fn();
    } finally {
      release();
      if (this.chains.get(key) === next) this.chains.delete(key);
    }
  }
}

/** Redis-backed lock using SET NX PX with a short-lived token and spin-wait. */
export class RedisLockService implements LockService {
  constructor(
    private readonly redis: Redis,
    private readonly ttlMs = 30_000,
    private readonly retryMs = 50,
    private readonly maxWaitMs = 60_000,
  ) {}

  async withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const lockKey = `lock:${key}`;
    const token = `${Date.now()}-${Math.random()}`;
    const deadline = Date.now() + this.maxWaitMs;
    // Acquire
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const ok = await this.redis.set(lockKey, token, "PX", this.ttlMs, "NX");
      if (ok) break;
      if (Date.now() > deadline) throw new Error(`lock timeout for ${key}`);
      await new Promise((r) => setTimeout(r, this.retryMs));
    }
    try {
      return await fn();
    } finally {
      // Release only if we still own it.
      const current = await this.redis.get(lockKey);
      if (current === token) await this.redis.del(lockKey);
    }
  }
}
