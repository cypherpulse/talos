import { serve } from "@hono/node-server";
import { loadConfig } from "./config/index.js";
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
  const logger = createLogger({ service: "talos-core" });

  await migrate(config.databaseUrl);
  const { db } = createDb(config.databaseUrl);
  const encryption = new NoteEncryptionService(config.noteEncryptionKey);
  const repos = createPostgresRepositories(db, encryption);

  const redis = createRedisConnection(config.redisUrl);
  const locks = new RedisLockService(redis);
  const queueConnection = createRedisConnection(config.redisUrl);
  const queue = createOperationsQueue(queueConnection);

  const services = buildServices({
    config,
    repos,
    logger,
    locks,
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
