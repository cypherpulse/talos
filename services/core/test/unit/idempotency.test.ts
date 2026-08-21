import { describe, expect, it } from "vitest";
import { ExecutionEngine, type EngineDeps } from "../../src/execution/engine.js";
import { createInMemoryRepositories } from "../../src/database/memory.js";
import { nullLogger } from "../../src/observability/logger.js";

/** createOperation only touches the operations + idempotency repositories. */
function engineWithRepos() {
  const repos = createInMemoryRepositories();
  const deps = { repos, logger: nullLogger() } as unknown as EngineDeps;
  return { engine: new ExecutionEngine(deps), repos };
}

describe("idempotency (§8)", () => {
  it("returns the same operation for a repeated idempotency key", async () => {
    const { engine } = engineWithRepos();
    const a = await engine.createOperation("DEPOSIT", { amount: "100" }, "key-1");
    const b = await engine.createOperation("DEPOSIT", { amount: "100" }, "key-1");
    expect(b.id).toBe(a.id);
  });

  it("creates distinct operations for distinct keys", async () => {
    const { engine } = engineWithRepos();
    const a = await engine.createOperation("DEPOSIT", { amount: "100" }, "key-a");
    const b = await engine.createOperation("DEPOSIT", { amount: "100" }, "key-b");
    expect(b.id).not.toBe(a.id);
  });

  it("creates distinct operations when no key is given", async () => {
    const { engine } = engineWithRepos();
    const a = await engine.createOperation("DEPOSIT", { amount: "100" }, null);
    const b = await engine.createOperation("DEPOSIT", { amount: "100" }, null);
    expect(b.id).not.toBe(a.id);
  });
});
