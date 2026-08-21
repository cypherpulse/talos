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
  list(limit: number): Promise<Note[]>;
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

export interface Repositories {
  notes: NotesRepository;
  operations: OperationsRepository;
  proofs: ProofsRepository;
  transactions: TransactionsRepository;
  merkle: MerkleRepository;
  nullifiers: NullifiersRepository;
  events: EventsRepository;
  idempotency: IdempotencyRepository;
}
