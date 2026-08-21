import { Hono } from "hono";
import { z } from "zod";
import type { TalosGuard } from "./guard.js";
import type { CoreClient } from "./core-client.js";
import { OPERATION_TYPES, type OperationType } from "../domain/types.js";

const ExecuteSchema = z.object({
  operation: z.enum(OPERATION_TYPES),
  params: z.record(z.unknown()),
});

/**
 * Guard HTTP API (Phase 5 §22). The agent normally calls POST /guard/execute for any
 * mutation; the Guard evaluates policy and only then reaches the Core Server. There is
 * no path from the agent to Core Server mutations that bypasses the Guard.
 */
export function createGuardApp(guard: TalosGuard, core: CoreClient): Hono {
  const app = new Hono();

  app.get("/guard/identity", (c) => c.json(guard.getIdentity()));

  app.post("/guard/evaluate", async (c) => {
    const { operation, params } = ExecuteSchema.parse(await c.req.json());
    const { decision, reason } = await guard.evaluate(operation as OperationType, params);
    return c.json({ decision, reason });
  });

  app.post("/guard/execute", async (c) => {
    const { operation, params } = ExecuteSchema.parse(await c.req.json());
    const result = await guard.execute(operation as OperationType, params);
    const status = result.decision === "REJECTED" ? 403 : 202;
    return c.json(result, status);
  });

  app.post("/guard/operations/:id/approve", async (c) => {
    const result = await guard.approve(c.req.param("id"));
    return c.json(result, 202);
  });

  app.get("/guard/operations/:id", async (c) => {
    // Proxies the Core Server operation status for a submitted operation id.
    return c.json(await core.getOperation(c.req.param("id")));
  });

  app.get("/guard/decisions", async (c) => c.json({ decisions: await guard.listDecisions(100) }));

  return app;
}
