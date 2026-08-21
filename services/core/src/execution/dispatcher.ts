import type { ExecutionEngine } from "./engine.js";
import type { Logger } from "../observability/logger.js";

/**
 * OperationDispatcher (Phase 4 §25/§29). After an operation is created, the API
 * dispatches it for asynchronous execution and returns an operationId immediately —
 * it never blocks the HTTP request on proof generation and confirmation. Production
 * uses the BullMQ dispatcher (see workers/); single-process/test uses the inline
 * dispatcher, which runs the pipeline in the background and swallows errors (the
 * engine records FAILED on the operation record itself).
 */
export interface OperationDispatcher {
  dispatch(operationId: string): Promise<void>;
}

export class InlineDispatcher implements OperationDispatcher {
  constructor(
    private readonly engine: ExecutionEngine,
    private readonly logger: Logger,
  ) {}

  async dispatch(operationId: string): Promise<void> {
    // Fire-and-forget: run in the background so the API responds immediately.
    void this.engine
      .runOperation(operationId)
      .catch((e) => this.logger.error("inline dispatch failed", { operationId, error: String(e) }));
  }
}
