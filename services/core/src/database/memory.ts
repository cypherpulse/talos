import type { Note, NoteState, OperationRecord, ProofPackage, TransactionRecord } from "../domain/types.js";
import type {
  BlockchainEvent,
  EventsRepository,
  IdempotencyRepository,
  MerkleLeaf,
  MerkleRepository,
  NotesRepository,
  NullifiersRepository,
  OperationsRepository,
  ProofsRepository,
  Repositories,
  TransactionsRepository,
} from "./repositories.js";

/**
 * In-memory repository implementation for unit and end-to-end tests. It exercises
 * the full orchestration/state-machine logic without a database. Production uses the
 * PostgreSQL/Drizzle implementation; both satisfy the same ports.
 */

class MemNotes implements NotesRepository {
  private m = new Map<string, Note>();
  async create(n: Note) {
    this.m.set(n.id, { ...n });
    return n;
  }
  async get(id: string) {
    const n = this.m.get(id);
    return n ? { ...n } : null;
  }
  async getByCommitment(c: string) {
    for (const n of this.m.values()) if (n.commitment === c) return { ...n };
    return null;
  }
  async getByNullifier(nf: string) {
    for (const n of this.m.values()) if (n.nullifier === nf) return { ...n };
    return null;
  }
  async listByState(state: NoteState) {
    return [...this.m.values()].filter((n) => n.state === state).map((n) => ({ ...n }));
  }
  async list(limit: number, owner?: string) {
    const all = [...this.m.values()];
    const scoped = owner ? all.filter((n) => n.owner === owner.toLowerCase()) : all;
    return scoped.slice(-limit).map((n) => ({ ...n }));
  }
  async update(n: Note) {
    this.m.set(n.id, { ...n });
    return n;
  }
}

class MemOperations implements OperationsRepository {
  private m = new Map<string, OperationRecord>();
  private byKey = new Map<string, string>();
  async create(op: OperationRecord) {
    this.m.set(op.id, { ...op });
    if (op.idempotencyKey) this.byKey.set(op.idempotencyKey, op.id);
    return op;
  }
  async get(id: string) {
    const o = this.m.get(id);
    return o ? { ...o } : null;
  }
  async getByIdempotencyKey(key: string) {
    const id = this.byKey.get(key);
    return id ? this.get(id) : null;
  }
  async update(op: OperationRecord) {
    this.m.set(op.id, { ...op });
    return op;
  }
  async list(limit: number) {
    return [...this.m.values()].slice(-limit).map((o) => ({ ...o }));
  }
}

class MemProofs implements ProofsRepository {
  private m = new Map<string, ProofPackage>();
  async create(id: string, pkg: ProofPackage) {
    this.m.set(id, pkg);
    return id;
  }
  async get(id: string) {
    return this.m.get(id) ?? null;
  }
}

class MemTransactions implements TransactionsRepository {
  private m = new Map<string, TransactionRecord>();
  async create(tx: TransactionRecord) {
    this.m.set(tx.id, { ...tx });
    return tx;
  }
  async get(id: string) {
    const t = this.m.get(id);
    return t ? { ...t } : null;
  }
  async getByOperation(operationId: string) {
    for (const t of this.m.values()) if (t.operationId === operationId) return { ...t };
    return null;
  }
  async update(tx: TransactionRecord) {
    this.m.set(tx.id, { ...tx });
    return tx;
  }
}

class MemMerkle implements MerkleRepository {
  private leaves: MerkleLeaf[] = [];
  private byCommitment = new Map<string, number>();
  async insertLeaf(leaf: MerkleLeaf) {
    if (this.byCommitment.has(leaf.commitment)) return;
    this.leaves[leaf.leafIndex] = leaf;
    this.byCommitment.set(leaf.commitment, leaf.leafIndex);
  }
  async getOrderedCommitments() {
    return this.leaves.filter((l) => l).map((l) => l.commitment);
  }
  async getLatestRoot() {
    const last = this.leaves.filter((l) => l).at(-1);
    return last ? last.root : null;
  }
  async hasCommitment(c: string) {
    return this.byCommitment.has(c);
  }
  async getLeafIndex(c: string) {
    return this.byCommitment.get(c) ?? null;
  }
  async count() {
    return this.byCommitment.size;
  }
}

class MemNullifiers implements NullifiersRepository {
  private m = new Set<string>();
  async markSpent(nullifier: string) {
    this.m.add(nullifier);
  }
  async isSpent(nullifier: string) {
    return this.m.has(nullifier);
  }
}

class MemEvents implements EventsRepository {
  private seen = new Set<string>();
  private lastBlock = 0;
  async record(e: BlockchainEvent) {
    const key = `${e.txHash}:${e.logIndex}`;
    if (this.seen.has(key)) return false;
    this.seen.add(key);
    return true;
  }
  async getLastProcessedBlock() {
    return this.lastBlock;
  }
  async setLastProcessedBlock(block: number) {
    this.lastBlock = block;
  }
}

class MemIdempotency implements IdempotencyRepository {
  private m = new Map<string, string>();
  async get(key: string) {
    return this.m.get(key) ?? null;
  }
  async put(key: string, operationId: string) {
    this.m.set(key, operationId);
  }
}

export function createInMemoryRepositories(): Repositories {
  return {
    notes: new MemNotes(),
    operations: new MemOperations(),
    proofs: new MemProofs(),
    transactions: new MemTransactions(),
    merkle: new MemMerkle(),
    nullifiers: new MemNullifiers(),
    events: new MemEvents(),
    idempotency: new MemIdempotency(),
  };
}
