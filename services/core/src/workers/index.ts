import { Queue, Worker, type ConnectionOptions } from "bullmq";
import IORedis from "ioredis";
import type { ExecutionEngine } from "../execution/engine.js";
import type { OperationDispatcher } from "../execution/dispatcher.js";
import type { Logger } from "../observability/logger.js";

/**
 * Worker layer (Phase 4 §28–§29). Operations are enqueued to BullMQ and executed by
 * a worker that calls the engine's idempotent `runOperation`. Because the engine
 * pipeline is cohesive (prove → submit → confirm → reconcile) and idempotent, a job
 * may run more than once yet cause the blockchain action at most once (the nullifier
 * set and `status !== CREATED` guard enforce that). Finer-grained queues
 * (proof-generation, blockchain-submission, transaction-confirmation, event-processing,
 * merkle-sync) are declared as named queues for future decomposition.
 */

export const QUEUE_NAMES = [
  "operations",
  "proof-generation",
  "blockchain-submission",
  "transaction-confirmation",
  "event-processing",
  "merkle-sync",
] as const;

export const OPERATIONS_QUEUE = "operations";

export function createRedisConnection(url: string): IORedis {
  return new IORedis(url, { maxRetriesPerRequest: null });
}

export class BullMqDispatcher implements OperationDispatcher {
  constructor(private readonly queue: Queue) {}
  async dispatch(operationId: string): Promise<void> {
    await this.queue.add(
      "run",
      { operationId },
      { jobId: operationId, attempts: 3, backoff: { type: "exponential", delay: 2000 }, removeOnComplete: 1000, removeOnFail: 5000 },
    );
  }
}

export function createOperationsQueue(connection: ConnectionOptions): Queue {
  return new Queue(OPERATIONS_QUEUE, { connection });
}

export function startOperationWorker(connection: ConnectionOptions, engine: ExecutionEngine, logger: Logger): Worker {
  const worker = new Worker(
    OPERATIONS_QUEUE,
    async (job) => {
      const operationId = job.data.operationId as string;
      const op = await engine.runOperation(operationId);
      return { status: op.status };
    },
    { connection, concurrency: 4 },
  );
  worker.on("failed", (job, err) => logger.error("worker job failed", { jobId: job?.id, error: String(err) }));
  worker.on("completed", (job) => logger.debug("worker job completed", { jobId: job.id }));
  return worker;
}
