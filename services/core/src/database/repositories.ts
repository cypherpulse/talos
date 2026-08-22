import type { Note, NoteState, OperationRecord, ProofPackage, TransactionRecord } from "../domain/types.js";

/**
 * Repository ports. The execution engine depends only on these interfaces, so it
 * runs identically over PostgreSQL (production, durable, authoritative) and an
 * in-memory store (unit/E2E tests). PostgreSQL remains the authoritative durable
 * state in production (Phase 4 §4, §8).
 */

export interface NotesRepository {
  create(note: Note): Promise<Note>;
  get(id: string): Promise<Note | null>;
  getByCommitment(commitment: string): Promise<Note | null>;
  getByNullifier(nullifier: string): Promise<Note | null>;
  listByState(state: NoteState): Promise<Note[]>;
  /** List notes, most recent first; when `owner` is given, only that wallet's notes. */
  list(limit: number, owner?: string): Promise<Note[]>;
  update(note: Note): Promise<Note>;
}

export interface OperationsRepository {
  create(op: OperationRecord): Promise<OperationRecord>;
  get(id: string): Promise<OperationRecord | null>;
  getByIdempotencyKey(key: string): Promise<OperationRecord | null>;
  update(op: OperationRecord): Promise<OperationRecord>;
  list(limit: number): Promise<OperationRecord[]>;
}

export interface ProofsRepository {
  create(id: string, pkg: ProofPackage): Promise<string>;
  get(id: string): Promise<ProofPackage | null>;
}

export interface TransactionsRepository {
  create(tx: TransactionRecord): Promise<TransactionRecord>;
  get(id: string): Promise<TransactionRecord | null>;
  getByOperation(operationId: string): Promise<TransactionRecord | null>;
  update(tx: TransactionRecord): Promise<TransactionRecord>;
}

export interface MerkleLeaf {
  leafIndex: number;
  commitment: string;
  root: string;
  blockNumber: number;
  txHash: string;
}

export interface MerkleRepository {
  insertLeaf(leaf: MerkleLeaf): Promise<void>;
  getOrderedCommitments(): Promise<string[]>;
  getLatestRoot(): Promise<string | null>;
  hasCommitment(commitment: string): Promise<boolean>;
  getLeafIndex(commitment: string): Promise<number | null>;
  count(): Promise<number>;
}

export interface NullifiersRepository {
  markSpent(nullifier: string, blockNumber: number, txHash: string): Promise<void>;
  isSpent(nullifier: string): Promise<boolean>;
}

export interface BlockchainEvent {
  txHash: string;
  logIndex: number;
  blockNumber: number;
  blockHash: string;
  name: string;
  data: Record<string, unknown>;
}

export interface EventsRepository {
  /** Returns false if the event was already recorded (dedupe by txHash+logIndex). */
  record(event: BlockchainEvent): Promise<boolean>;
  getLastProcessedBlock(): Promise<number>;
  setLastProcessedBlock(block: number): Promise<void>;
}

export interface IdempotencyRepository {
  get(key: string): Promise<string | null>;
  put(key: string, operationId: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Phase 6 — multi-agent trading records + repositories.
// ---------------------------------------------------------------------------

export type AgentRole = "RESEARCH" | "TRADER" | "PORTFOLIO";

/** Public agent projection — NEVER includes key material. */
export interface AgentRecord {
  id: string;
  owner: string;
  role: AgentRole;
  name: string;
  walletAddress: string;
  talosPublicKey: string;
  status: "ACTIVE" | "DISABLED";
  createdAt: string;
}

/** Storage shape: adds the encrypted key blobs (persisted, never returned by APIs). */
export interface StoredAgent extends AgentRecord {
  walletKeyBlob: string;
  spendingKeyBlob: string;
}

export interface AgentsRepository {
  create(agent: StoredAgent): Promise<AgentRecord>;
  get(id: string): Promise<AgentRecord | null>;
  getByOwnerRole(owner: string, role: AgentRole): Promise<AgentRecord | null>;
  listByOwner(owner: string): Promise<AgentRecord[]>;
  /** Encrypted blobs for the signer/identity service only. */
  getSecretBlobs(id: string): Promise<{ walletKeyBlob: string; spendingKeyBlob: string } | null>;
  setStatus(id: string, status: "ACTIVE" | "DISABLED"): Promise<void>;
}

export interface TradeIntentRecord {
  id: string;
  agentId: string;
  owner: string;
  assetIn: string;
  assetOut: string;
  amount: string;
  maxSlippageBps: number;
  status: string;
  createdAt: string;
}

export interface TradeIntentsRepository {
  create(intent: TradeIntentRecord): Promise<TradeIntentRecord>;
  get(id: string): Promise<TradeIntentRecord | null>;
  listByOwner(owner: string, limit?: number): Promise<TradeIntentRecord[]>;
}

export interface TradeExecutionRecord {
  id: string;
  intentId: string;
  agentId: string;
  owner: string;
  provider: string;
  fromAmount: string;
  toAmount: string;
  valueUsd: string;
  status: string;
  txHash: string | null;
  failReason: string | null;
  quote: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface TradeExecutionsRepository {
  create(exec: TradeExecutionRecord): Promise<TradeExecutionRecord>;
  get(id: string): Promise<TradeExecutionRecord | null>;
  update(exec: TradeExecutionRecord): Promise<TradeExecutionRecord>;
  listByOwner(owner: string, limit?: number): Promise<TradeExecutionRecord[]>;
  /** Sum of valueUsd for an owner since an ISO timestamp (for daily limits). */
  sumValueUsdSince(owner: string, sinceIso: string): Promise<number>;
}

export interface AgentTransferRecord {
  id: string;
  fromAgentId: string;
  toPublicKey: string;
  assetId: number;
  amount: string;
  operationId: string | null;
  status: string;
  createdAt: string;
}

export interface AgentTransfersRepository {
  create(transfer: AgentTransferRecord): Promise<AgentTransferRecord>;
  update(transfer: AgentTransferRecord): Promise<AgentTransferRecord>;
  listByAgent(agentId: string, limit?: number): Promise<AgentTransferRecord[]>;
}

export interface PortfolioSnapshotRecord {
  id: string;
  owner: string;
  totalValueUsd: string;
  positions: unknown[];
  takenAt: string;
}

export interface PortfolioRepository {
  saveSnapshot(snapshot: PortfolioSnapshotRecord): Promise<void>;
  latest(owner: string): Promise<PortfolioSnapshotRecord | null>;
  history(owner: string, limit?: number): Promise<PortfolioSnapshotRecord[]>;
  getTarget(owner: string): Promise<Record<string, number> | null>;
  setTarget(owner: string, allocations: Record<string, number>): Promise<void>;
}

export type MemoryType = "WORKING" | "SEMANTIC" | "EPISODIC";

export interface AgentMemoryRecord {
  id: string;
  owner: string;
  agentId: string | null;
  memoryType: MemoryType;
  content: string;
  asset: string | null;
  importance: number;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface AgentMemoryRepository {
  create(memory: AgentMemoryRecord, embedding?: number[] | null): Promise<AgentMemoryRecord>;
  /** Rank by importance then recency; optionally filter by types. */
  recall(owner: string, opts?: { types?: MemoryType[]; limit?: number }): Promise<AgentMemoryRecord[]>;
  /** pgvector cosine-similarity search against a query embedding. */
  recallSimilar(owner: string, embedding: number[], opts?: { types?: MemoryType[]; limit?: number }): Promise<AgentMemoryRecord[]>;
  count(owner: string): Promise<number>;
  delete(id: string): Promise<void>;
  clear(owner: string): Promise<void>;
}

export interface Repositories {
  notes: NotesRepository;
  operations: OperationsRepository;
  proofs: ProofsRepository;
  transactions: TransactionsRepository;
  merkle: MerkleRepository;
  nullifiers: NullifiersRepository;
  events: EventsRepository;
  idempotency: IdempotencyRepository;
  // Phase 6
  agents: AgentsRepository;
  tradeIntents: TradeIntentsRepository;
  tradeExecutions: TradeExecutionsRepository;
  agentTransfers: AgentTransfersRepository;
  portfolio: PortfolioRepository;
  memory: AgentMemoryRepository;
}
