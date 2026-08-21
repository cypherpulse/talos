import { existsSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { loadConfig } from "./config/index.js";

// Repo root, resolved from this module (src → core → services → root) so the server
// runs correctly regardless of the current working directory.
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

// Load the root .env before reading config (Node built-in; no dependency).
const ENV_FILE = join(REPO_ROOT, ".env");
if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);
import { createLogger } from "./observability/logger.js";
import { createDb } from "./database/connection.js";
import { migrate } from "./database/migrate.js";
import { createPostgresRepositories } from "./database/postgres.js";
import { NoteEncryptionService } from "./notes/encryption.js";
import { RedisLockService } from "./execution/locks.js";
import { buildServices } from "./services.js";
import { createApp } from "./api/app.js";
import {
  BullMqDispatcher,
  createOperationsQueue,
  createRedisConnection,
  startOperationWorker,
} from "./workers/index.js";

/**
 * Talos Core Server entrypoint. Wires the production stack: PostgreSQL (durable
 * state), Redis (locks + BullMQ), the X Layer client, the proof service, and the
 * Hono API. Workers run in-process when RUN_WORKERS is set; otherwise this is an
 * API-only node and a separate worker process consumes the queue.
 */
async function main(): Promise<void> {
  const config = loadConfig();
  // Resolve a relative circuit-artifacts dir against the repo root (cwd-independent).
  if (!isAbsolute(config.circuitArtifactsDir)) {
    config.circuitArtifactsDir = resolve(REPO_ROOT, config.circuitArtifactsDir);
  }
  const logger = createLogger({ service: "talos-core" });

  await migrate(config.databaseUrl);
  const { db } = createDb(config.databaseUrl);
  const encryption = new NoteEncryptionService(config.noteEncryptionKey);
  const repos = createPostgresRepositories(db, encryption);

  const redis = createRedisConnection(config.redisUrl);
  const locks = new RedisLockService(redis);
  const queueConnection = createRedisConnection(config.redisUrl);
  const queue = createOperationsQueue(queueConnection);

  // Start the event scan at the pool's deployment block (scanning from 0 is wasteful
  // and the RPC caps eth_getLogs at a 100-block range — see MerkleSynchronizer).
  const fromBlock = process.env.SYNC_FROM_BLOCK ? BigInt(process.env.SYNC_FROM_BLOCK) : 0n;

  const services = buildServices({
    config,
    repos,
    logger,
    locks,
    fromBlock,
    dispatcherFactory: () => new BullMqDispatcher(queue),
  });

  if (config.runWorkers) {
    startOperationWorker(queueConnection, services.engine, logger);
    logger.info("operation worker started");
  }

  const app = createApp(services);
  serve({ fetch: app.fetch, port: config.port }, (info) => {
    logger.info("talos-core listening", { port: info.port, chainId: config.chain.chainId });
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info("shutting down", { signal });
    await queue.close().catch(() => {});
    await redis.quit().catch(() => {});
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((e) => {
  createLogger({ service: "talos-core" }).error("fatal startup error", { error: String(e) });
  process.exit(1);
});
