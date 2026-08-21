import { randomUUID } from "node:crypto";
import type { Hash } from "viem";
import type { ChainClient } from "../blockchain/client.js";
import type { TransactionsRepository } from "../database/repositories.js";
import type { TransactionRecord } from "../domain/types.js";
import { TransactionConfirmationFailed, TransactionSubmissionFailed } from "../errors/index.js";
import type { Logger } from "../observability/logger.js";

/**
 * TransactionManager (Phase 4 §9–§10). Wraps a contract write in a durable
 * transaction lifecycle: PENDING → SUBMITTED → CONFIRMED, tracking hash, block,
 * gas, and confirmations. A submitted transaction is NEVER assumed confirmed — the
 * manager waits for the configured confirmation depth and inspects the receipt
 * status before reporting success.
 */
export class TransactionManager {
  constructor(
    private readonly chain: ChainClient,
    private readonly txRepo: TransactionsRepository,
    private readonly logger: Logger,
  ) {}

  async submitAndConfirm(
    operationId: string,
    to: string,
    submit: () => Promise<Hash>,
  ): Promise<TransactionRecord> {
    const now = new Date().toISOString();
    let record: TransactionRecord = {
      id: `tx_${randomUUID()}`,
      operationId,
      txHash: null,
      chainId: this.chain.chain.id,
      from: this.chain.signerAddress,
      to,
      nonce: null,
      status: "PENDING",
      blockNumber: null,
      blockHash: null,
      gasUsed: null,
      effectiveGasPrice: null,
      confirmations: 0,
      createdAt: now,
      updatedAt: now,
    };
    await this.txRepo.create(record);

    let hash: Hash;
    try {
      hash = await submit();
    } catch (e) {
      await this.update(record, { status: "FAILED" });
      throw TransactionSubmissionFailed("transaction submission/simulation failed", { cause: String(e) });
    }
    this.logger.info("tx submitted", { operationId, txHash: hash });
    record = await this.update(record, { txHash: hash, status: "SUBMITTED" });

    const receipt = await this.chain.waitForReceipt(hash);
    if (receipt.status !== "success") {
      await this.update(record, { status: "FAILED", blockNumber: Number(receipt.blockNumber) });
      throw TransactionConfirmationFailed("transaction reverted on-chain", { txHash: hash });
    }

    const confirmations = Number(await this.chain.getConfirmations(hash));
    record = await this.update(record, {
      status: "CONFIRMED",
      blockNumber: Number(receipt.blockNumber),
      blockHash: receipt.blockHash,
      gasUsed: receipt.gasUsed.toString(),
      effectiveGasPrice: receipt.effectiveGasPrice.toString(),
      nonce: receipt.transactionIndex,
      confirmations,
    });
    this.logger.info("tx confirmed", {
      operationId,
      txHash: hash,
      blockNumber: Number(receipt.blockNumber),
      gasUsed: receipt.gasUsed.toString(),
    });
    return record;
  }

  private async update(record: TransactionRecord, patch: Partial<TransactionRecord>): Promise<TransactionRecord> {
    const updated: TransactionRecord = { ...record, ...patch, updatedAt: new Date().toISOString() };
    return this.txRepo.update(updated);
  }
}
