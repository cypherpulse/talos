import { and, asc, cosineDistance, desc, eq, gte, inArray, isNotNull } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { Note, NoteState, OperationRecord, ProofPackage, TransactionRecord } from "../domain/types.js";
import type { NoteEncryptionService } from "../notes/encryption.js";
import type {
  AgentMemoryRecord,
  AgentMemoryRepository,
  AgentRecord,
  AgentRole,
  AgentsRepository,
  AgentTransferRecord,
  AgentTransfersRepository,
  BlockchainEvent,
  MemoryType,
  EventsRepository,
  IdempotencyRepository,
  MerkleLeaf,
  MerkleRepository,
  NotesRepository,
  NullifiersRepository,
  OperationsRepository,
  PortfolioRepository,
  PortfolioSnapshotRecord,
  ProofsRepository,
  Repositories,
  StoredAgent,
  TradeExecutionRecord,
  TradeExecutionsRepository,
  TradeIntentRecord,
  TradeIntentsRepository,
  TransactionsRepository,
} from "./repositories.js";
import * as s from "./schema.js";

type DB = PostgresJsDatabase<typeof s>;

const iso = (d: Date | string): string => (d instanceof Date ? d.toISOString() : d);

/** Secret fields kept only in the encrypted blob. */
interface NoteSecrets {
  ownerPubKey: string;
  secret: string;
  nonce: string;
  nullifierSecret: string;
}

class PgNotes implements NotesRepository {
  constructor(private db: DB, private enc: NoteEncryptionService) {}
  private toRow(n: Note) {
    const secrets: NoteSecrets = { ownerPubKey: n.ownerPubKey, secret: n.secret, nonce: n.nonce, nullifierSecret: n.nullifierSecret };
    return {
      id: n.id,
      assetId: n.assetId,
      value: n.value,
      commitment: n.commitment,
      nullifier: n.nullifier,
      state: n.state,
      leafIndex: n.leafIndex,
      owner: n.owner ?? null,
      secretBlob: this.enc.encryptJson(secrets),
      updatedAt: new Date(),
    };
  }
  private fromRow(r: typeof s.notes.$inferSelect): Note {
    const secrets = this.enc.decryptJson<NoteSecrets>(r.secretBlob);
    return {
      id: r.id,
      assetId: r.assetId,
      value: r.value,
      commitment: r.commitment,
      nullifier: r.nullifier,
      state: r.state as NoteState,
      leafIndex: r.leafIndex,
      owner: r.owner ?? null,
      ...secrets,
      createdAt: iso(r.createdAt),
      updatedAt: iso(r.updatedAt),
    };
  }
  async create(n: Note) {
    await this.db.insert(s.notes).values(this.toRow(n));
    return n;
  }
  async get(id: string) {
    const [r] = await this.db.select().from(s.notes).where(eq(s.notes.id, id)).limit(1);
    return r ? this.fromRow(r) : null;
  }
  async getByCommitment(c: string) {
    const [r] = await this.db.select().from(s.notes).where(eq(s.notes.commitment, c)).limit(1);
    return r ? this.fromRow(r) : null;
  }
  async getByNullifier(nf: string) {
    const [r] = await this.db.select().from(s.notes).where(eq(s.notes.nullifier, nf)).limit(1);
    return r ? this.fromRow(r) : null;
  }
  async listByState(state: NoteState) {
    const rows = await this.db.select().from(s.notes).where(eq(s.notes.state, state));
    return rows.map((r) => this.fromRow(r));
  }
  async list(limit: number, owner?: string) {
    const base = this.db.select().from(s.notes);
    const rows = await (owner
      ? base.where(eq(s.notes.owner, owner.toLowerCase()))
      : base
    )
      .orderBy(desc(s.notes.createdAt))
      .limit(limit);
    return rows.map((r) => this.fromRow(r));
  }
  async update(n: Note) {
    await this.db.update(s.notes).set(this.toRow(n)).where(eq(s.notes.id, n.id));
    return n;
  }
}

class PgOperations implements OperationsRepository {
  constructor(private db: DB) {}
  private fromRow(r: typeof s.operations.$inferSelect): OperationRecord {
    return {
      id: r.id,
      type: r.type as OperationRecord["type"],
      status: r.status as OperationRecord["status"],
      idempotencyKey: r.idempotencyKey,
      noteIds: r.noteIds,
      proofId: r.proofId,
      txHash: r.txHash,
      errorCode: r.errorCode,
      errorMessage: r.errorMessage,
      request: r.request,
      result: r.result ?? null,
      createdAt: iso(r.createdAt),
      updatedAt: iso(r.updatedAt),
    };
  }
  async create(op: OperationRecord) {
    await this.db.insert(s.operations).values({
      id: op.id,
      type: op.type,
      status: op.status,
      idempotencyKey: op.idempotencyKey,
      noteIds: op.noteIds,
      proofId: op.proofId,
      txHash: op.txHash,
      errorCode: op.errorCode,
      errorMessage: op.errorMessage,
      request: op.request,
      result: op.result,
    });
    return op;
  }
  async get(id: string) {
    const [r] = await this.db.select().from(s.operations).where(eq(s.operations.id, id)).limit(1);
    return r ? this.fromRow(r) : null;
  }
  async getByIdempotencyKey(key: string) {
    const [r] = await this.db.select().from(s.operations).where(eq(s.operations.idempotencyKey, key)).limit(1);
    return r ? this.fromRow(r) : null;
  }
  async update(op: OperationRecord) {
    await this.db
      .update(s.operations)
      .set({
        status: op.status,
        noteIds: op.noteIds,
        proofId: op.proofId,
        txHash: op.txHash,
        errorCode: op.errorCode,
        errorMessage: op.errorMessage,
        result: op.result,
        updatedAt: new Date(),
      })
      .where(eq(s.operations.id, op.id));
    return op;
  }
  async list(limit: number) {
    const rows = await this.db.select().from(s.operations).orderBy(desc(s.operations.createdAt)).limit(limit);
    return rows.map((r) => this.fromRow(r));
  }
}

class PgProofs implements ProofsRepository {
  constructor(private db: DB) {}
  async create(id: string, pkg: ProofPackage) {
    await this.db.insert(s.proofs).values({
      id,
      operation: pkg.operation,
      circuit: pkg.circuit,
      proof: pkg.proof,
      publicSignals: pkg.publicSignals,
      verificationKeyId: pkg.verificationKeyId,
      generatedAt: pkg.generatedAt,
    });
    return id;
  }
  async get(id: string) {
    const [r] = await this.db.select().from(s.proofs).where(eq(s.proofs.id, id)).limit(1);
    if (!r) return null;
    return {
      operation: r.operation as ProofPackage["operation"],
      circuit: r.circuit,
      proof: r.proof as ProofPackage["proof"],
      publicSignals: r.publicSignals,
      verificationKeyId: r.verificationKeyId,
      generatedAt: r.generatedAt,
    };
  }
}

class PgTransactions implements TransactionsRepository {
  constructor(private db: DB) {}
  private fromRow(r: typeof s.transactions.$inferSelect): TransactionRecord {
    return {
      id: r.id,
      operationId: r.operationId,
      txHash: r.txHash,
      chainId: r.chainId,
      from: r.from,
      to: r.to,
      nonce: r.nonce,
      status: r.status as TransactionRecord["status"],
      blockNumber: r.blockNumber,
      blockHash: r.blockHash,
      gasUsed: r.gasUsed,
      effectiveGasPrice: r.effectiveGasPrice,
      confirmations: r.confirmations,
      createdAt: iso(r.createdAt),
      updatedAt: iso(r.updatedAt),
    };
  }
  async create(tx: TransactionRecord) {
    await this.db.insert(s.transactions).values({ ...tx, createdAt: undefined, updatedAt: undefined } as never);
    return tx;
  }
  async get(id: string) {
    const [r] = await this.db.select().from(s.transactions).where(eq(s.transactions.id, id)).limit(1);
    return r ? this.fromRow(r) : null;
  }
  async getByOperation(operationId: string) {
    const [r] = await this.db.select().from(s.transactions).where(eq(s.transactions.operationId, operationId)).limit(1);
    return r ? this.fromRow(r) : null;
  }
  async update(tx: TransactionRecord) {
    await this.db
      .update(s.transactions)
      .set({
        txHash: tx.txHash,
        status: tx.status,
        nonce: tx.nonce,
        blockNumber: tx.blockNumber,
        blockHash: tx.blockHash,
        gasUsed: tx.gasUsed,
        effectiveGasPrice: tx.effectiveGasPrice,
        confirmations: tx.confirmations,
        updatedAt: new Date(),
      })
      .where(eq(s.transactions.id, tx.id));
    return tx;
  }
}

class PgMerkle implements MerkleRepository {
  constructor(private db: DB) {}
  async insertLeaf(leaf: MerkleLeaf) {
    await this.db.insert(s.merkleLeaves).values(leaf).onConflictDoNothing();
  }
  async getOrderedCommitments() {
    const rows = await this.db.select().from(s.merkleLeaves).orderBy(asc(s.merkleLeaves.leafIndex));
    return rows.map((r) => r.commitment);
  }
  async getLatestRoot() {
    const [r] = await this.db.select().from(s.merkleLeaves).orderBy(desc(s.merkleLeaves.leafIndex)).limit(1);
    return r ? r.root : null;
  }
  async hasCommitment(commitment: string) {
    const [r] = await this.db.select().from(s.merkleLeaves).where(eq(s.merkleLeaves.commitment, commitment)).limit(1);
    return !!r;
  }
  async getLeafIndex(commitment: string) {
    const [r] = await this.db.select().from(s.merkleLeaves).where(eq(s.merkleLeaves.commitment, commitment)).limit(1);
    return r ? r.leafIndex : null;
  }
  async count() {
    const rows = await this.db.select().from(s.merkleLeaves);
    return rows.length;
  }
}

class PgNullifiers implements NullifiersRepository {
  constructor(private db: DB) {}
  async markSpent(nullifier: string, blockNumber: number, txHash: string) {
    await this.db.insert(s.nullifiers).values({ nullifier, blockNumber, txHash }).onConflictDoNothing();
  }
  async isSpent(nullifier: string) {
    const [r] = await this.db.select().from(s.nullifiers).where(eq(s.nullifiers.nullifier, nullifier)).limit(1);
    return !!r;
  }
}

const LAST_BLOCK_KEY = "last_processed_block";

class PgEvents implements EventsRepository {
  constructor(private db: DB) {}
  async record(e: BlockchainEvent) {
    const res = await this.db
      .insert(s.blockchainEvents)
      .values({ txHash: e.txHash, logIndex: e.logIndex, blockNumber: e.blockNumber, blockHash: e.blockHash, name: e.name, data: e.data })
      .onConflictDoNothing()
      .returning({ txHash: s.blockchainEvents.txHash });
    return res.length > 0;
  }
  async getLastProcessedBlock() {
    const [r] = await this.db.select().from(s.syncState).where(eq(s.syncState.key, LAST_BLOCK_KEY)).limit(1);
    return r ? r.value : 0;
  }
  async setLastProcessedBlock(block: number) {
    await this.db
      .insert(s.syncState)
      .values({ key: LAST_BLOCK_KEY, value: block })
      .onConflictDoUpdate({ target: s.syncState.key, set: { value: block } });
  }
}

class PgIdempotency implements IdempotencyRepository {
  constructor(private db: DB) {}
  async get(key: string) {
    const [r] = await this.db.select().from(s.idempotencyKeys).where(eq(s.idempotencyKeys.key, key)).limit(1);
    return r ? r.operationId : null;
  }
  async put(key: string, operationId: string) {
    await this.db.insert(s.idempotencyKeys).values({ key, operationId }).onConflictDoNothing();
  }
}

// ---- Phase 6 repositories ----

class PgAgents implements AgentsRepository {
  constructor(private db: DB) {}
  private pub(r: typeof s.agents.$inferSelect): AgentRecord {
    return {
      id: r.id,
      owner: r.owner,
      role: r.role as AgentRole,
      name: r.name,
      walletAddress: r.walletAddress,
      talosPublicKey: r.talosPublicKey,
      status: r.status as "ACTIVE" | "DISABLED",
      createdAt: iso(r.createdAt),
    };
  }
  async create(a: StoredAgent) {
    await this.db.insert(s.agents).values({
      id: a.id,
      owner: a.owner,
      role: a.role,
      name: a.name,
      walletAddress: a.walletAddress,
      walletKeyBlob: a.walletKeyBlob,
      talosPublicKey: a.talosPublicKey,
      spendingKeyBlob: a.spendingKeyBlob,
      status: a.status,
    });
    return { id: a.id, owner: a.owner, role: a.role, name: a.name, walletAddress: a.walletAddress, talosPublicKey: a.talosPublicKey, status: a.status, createdAt: a.createdAt };
  }
  async get(id: string) {
    const [r] = await this.db.select().from(s.agents).where(eq(s.agents.id, id)).limit(1);
    return r ? this.pub(r) : null;
  }
  async getByOwnerRole(owner: string, role: AgentRole) {
    const [r] = await this.db.select().from(s.agents).where(and(eq(s.agents.owner, owner), eq(s.agents.role, role))).limit(1);
    return r ? this.pub(r) : null;
  }
  async listByOwner(owner: string) {
    const rows = await this.db.select().from(s.agents).where(eq(s.agents.owner, owner)).orderBy(asc(s.agents.createdAt));
    return rows.map((r) => this.pub(r));
  }
  async getSecretBlobs(id: string) {
    const [r] = await this.db.select().from(s.agents).where(eq(s.agents.id, id)).limit(1);
    return r ? { walletKeyBlob: r.walletKeyBlob, spendingKeyBlob: r.spendingKeyBlob } : null;
  }
  async setStatus(id: string, status: "ACTIVE" | "DISABLED") {
    await this.db.update(s.agents).set({ status }).where(eq(s.agents.id, id));
  }
}

class PgTradeIntents implements TradeIntentsRepository {
  constructor(private db: DB) {}
  private map(r: typeof s.tradeIntents.$inferSelect): TradeIntentRecord {
    return { id: r.id, agentId: r.agentId, owner: r.owner, assetIn: r.assetIn, assetOut: r.assetOut, amount: r.amount, maxSlippageBps: r.maxSlippageBps, status: r.status, createdAt: iso(r.createdAt) };
  }
  async create(i: TradeIntentRecord) {
    await this.db.insert(s.tradeIntents).values({ id: i.id, agentId: i.agentId, owner: i.owner, assetIn: i.assetIn, assetOut: i.assetOut, amount: i.amount, maxSlippageBps: i.maxSlippageBps, status: i.status });
    return i;
  }
  async get(id: string) {
    const [r] = await this.db.select().from(s.tradeIntents).where(eq(s.tradeIntents.id, id)).limit(1);
    return r ? this.map(r) : null;
  }
  async listByOwner(owner: string, limit = 100) {
    const rows = await this.db.select().from(s.tradeIntents).where(eq(s.tradeIntents.owner, owner)).orderBy(desc(s.tradeIntents.createdAt)).limit(limit);
    return rows.map((r) => this.map(r));
  }
}

class PgTradeExecutions implements TradeExecutionsRepository {
  constructor(private db: DB) {}
  private map(r: typeof s.tradeExecutions.$inferSelect): TradeExecutionRecord {
    return { id: r.id, intentId: r.intentId, agentId: r.agentId, owner: r.owner, provider: r.provider, fromAmount: r.fromAmount, toAmount: r.toAmount, valueUsd: r.valueUsd, status: r.status, txHash: r.txHash, failReason: r.failReason, quote: r.quote ?? null, createdAt: iso(r.createdAt), updatedAt: iso(r.updatedAt) };
  }
  private row(e: TradeExecutionRecord) {
    return { id: e.id, intentId: e.intentId, agentId: e.agentId, owner: e.owner, provider: e.provider, fromAmount: e.fromAmount, toAmount: e.toAmount, valueUsd: e.valueUsd, status: e.status, txHash: e.txHash, failReason: e.failReason, quote: e.quote ?? undefined, updatedAt: new Date() };
  }
  async create(e: TradeExecutionRecord) {
    await this.db.insert(s.tradeExecutions).values(this.row(e));
    return e;
  }
  async get(id: string) {
    const [r] = await this.db.select().from(s.tradeExecutions).where(eq(s.tradeExecutions.id, id)).limit(1);
    return r ? this.map(r) : null;
  }
  async update(e: TradeExecutionRecord) {
    await this.db.update(s.tradeExecutions).set(this.row(e)).where(eq(s.tradeExecutions.id, e.id));
    return e;
  }
  async listByOwner(owner: string, limit = 100) {
    const rows = await this.db.select().from(s.tradeExecutions).where(eq(s.tradeExecutions.owner, owner)).orderBy(desc(s.tradeExecutions.createdAt)).limit(limit);
    return rows.map((r) => this.map(r));
  }
  async sumValueUsdSince(owner: string, sinceIso: string) {
    const rows = await this.db.select().from(s.tradeExecutions).where(and(eq(s.tradeExecutions.owner, owner), gte(s.tradeExecutions.createdAt, new Date(sinceIso))));
    return rows.reduce((sum, r) => sum + (Number(r.valueUsd) || 0), 0);
  }
}

class PgAgentTransfers implements AgentTransfersRepository {
  constructor(private db: DB) {}
  private map(r: typeof s.agentTransfers.$inferSelect): AgentTransferRecord {
    return { id: r.id, fromAgentId: r.fromAgentId, toPublicKey: r.toPublicKey, assetId: r.assetId, amount: r.amount, operationId: r.operationId, status: r.status, createdAt: iso(r.createdAt) };
  }
  async create(t: AgentTransferRecord) {
    await this.db.insert(s.agentTransfers).values({ id: t.id, fromAgentId: t.fromAgentId, toPublicKey: t.toPublicKey, assetId: t.assetId, amount: t.amount, operationId: t.operationId, status: t.status });
    return t;
  }
  async update(t: AgentTransferRecord) {
    await this.db.update(s.agentTransfers).set({ operationId: t.operationId, status: t.status }).where(eq(s.agentTransfers.id, t.id));
    return t;
  }
  async listByAgent(agentId: string, limit = 100) {
    const rows = await this.db.select().from(s.agentTransfers).where(eq(s.agentTransfers.fromAgentId, agentId)).orderBy(desc(s.agentTransfers.createdAt)).limit(limit);
    return rows.map((r) => this.map(r));
  }
}

class PgPortfolio implements PortfolioRepository {
  constructor(private db: DB) {}
  private map(r: typeof s.portfolioSnapshots.$inferSelect): PortfolioSnapshotRecord {
    return { id: r.id, owner: r.owner, totalValueUsd: r.totalValueUsd, positions: r.positions, takenAt: iso(r.takenAt) };
  }
  async saveSnapshot(snap: PortfolioSnapshotRecord) {
    await this.db.insert(s.portfolioSnapshots).values({ id: snap.id, owner: snap.owner, totalValueUsd: snap.totalValueUsd, positions: snap.positions });
  }
  async latest(owner: string) {
    const [r] = await this.db.select().from(s.portfolioSnapshots).where(eq(s.portfolioSnapshots.owner, owner)).orderBy(desc(s.portfolioSnapshots.takenAt)).limit(1);
    return r ? this.map(r) : null;
  }
  async history(owner: string, limit = 50) {
    const rows = await this.db.select().from(s.portfolioSnapshots).where(eq(s.portfolioSnapshots.owner, owner)).orderBy(desc(s.portfolioSnapshots.takenAt)).limit(limit);
    return rows.map((r) => this.map(r));
  }
  async getTarget(owner: string) {
    const [r] = await this.db.select().from(s.targetAllocations).where(eq(s.targetAllocations.owner, owner)).limit(1);
    return r ? r.allocations : null;
  }
  async setTarget(owner: string, allocations: Record<string, number>) {
    await this.db
      .insert(s.targetAllocations)
      .values({ owner, allocations, updatedAt: new Date() })
      .onConflictDoUpdate({ target: s.targetAllocations.owner, set: { allocations, updatedAt: new Date() } });
  }
}

class PgAgentMemory implements AgentMemoryRepository {
  constructor(private db: DB) {}
  private map(r: typeof s.agentMemory.$inferSelect): AgentMemoryRecord {
    return { id: r.id, owner: r.owner, agentId: r.agentId, memoryType: r.memoryType as MemoryType, content: r.content, asset: r.asset, importance: r.importance, metadata: r.metadata ?? null, createdAt: iso(r.createdAt) };
  }
  async create(m: AgentMemoryRecord, embedding?: number[] | null) {
    await this.db.insert(s.agentMemory).values({ id: m.id, owner: m.owner, agentId: m.agentId, memoryType: m.memoryType, content: m.content, asset: m.asset, importance: m.importance, embedding: embedding ?? undefined, metadata: m.metadata ?? undefined });
    return m;
  }
  async recall(owner: string, opts?: { types?: MemoryType[]; limit?: number }) {
    const where = opts?.types?.length
      ? and(eq(s.agentMemory.owner, owner), inArray(s.agentMemory.memoryType, opts.types))
      : eq(s.agentMemory.owner, owner);
    const rows = await this.db
      .select()
      .from(s.agentMemory)
      .where(where)
      .orderBy(desc(s.agentMemory.importance), desc(s.agentMemory.createdAt))
      .limit(opts?.limit ?? 20);
    return rows.map((r) => this.map(r));
  }
  async recallSimilar(owner: string, embedding: number[], opts?: { types?: MemoryType[]; limit?: number }) {
    const filters = [eq(s.agentMemory.owner, owner), isNotNull(s.agentMemory.embedding)];
    if (opts?.types?.length) filters.push(inArray(s.agentMemory.memoryType, opts.types));
    const rows = await this.db
      .select()
      .from(s.agentMemory)
      .where(and(...filters))
      .orderBy(cosineDistance(s.agentMemory.embedding, embedding))
      .limit(opts?.limit ?? 8);
    return rows.map((r) => this.map(r));
  }
  async count(owner: string) {
    const rows = await this.db.select({ id: s.agentMemory.id }).from(s.agentMemory).where(eq(s.agentMemory.owner, owner));
    return rows.length;
  }
  async delete(id: string) {
    await this.db.delete(s.agentMemory).where(eq(s.agentMemory.id, id));
  }
  async clear(owner: string) {
    await this.db.delete(s.agentMemory).where(eq(s.agentMemory.owner, owner));
  }
}

export function createPostgresRepositories(db: DB, enc: NoteEncryptionService): Repositories {
  return {
    notes: new PgNotes(db, enc),
    operations: new PgOperations(db),
    proofs: new PgProofs(db),
    transactions: new PgTransactions(db),
    merkle: new PgMerkle(db),
    nullifiers: new PgNullifiers(db),
    events: new PgEvents(db),
    idempotency: new PgIdempotency(db),
    agents: new PgAgents(db),
    tradeIntents: new PgTradeIntents(db),
    tradeExecutions: new PgTradeExecutions(db),
    agentTransfers: new PgAgentTransfers(db),
    portfolio: new PgPortfolio(db),
    memory: new PgAgentMemory(db),
  };
}
