import { randomUUID } from "node:crypto";
import type { MiddlewareHandler } from "hono";

/** Attaches an x-request-id to every request/response (Phase 4 §33/§35). */
export const requestId = (): MiddlewareHandler => async (c, next) => {
  const id = c.req.header("x-request-id") ?? `req_${randomUUID()}`;
  c.set("requestId", id);
  c.header("x-request-id", id);
  await next();
};

/** Minimal in-memory fixed-window rate limiter, keyed by client IP. */
export function rateLimit(opts: { windowMs: number; max: number }): MiddlewareHandler {
  const buckets = new Map<string, { count: number; reset: number }>();
  return async (c, next) => {
    const ip =
      c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
      c.req.header("x-real-ip") ??
      "local";
    const now = Date.now();
    const b = buckets.get(ip);
    if (!b || now > b.reset) {
      buckets.set(ip, { count: 1, reset: now + opts.windowMs });
    } else if (b.count >= opts.max) {
      return c.json({ error: { code: "RATE_LIMITED", message: "too many requests" } }, 429);
    } else {
      b.count++;
    }
    await next();
  };
}
