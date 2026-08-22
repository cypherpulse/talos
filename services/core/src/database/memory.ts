import type { Note, NoteState, OperationRecord, ProofPackage, TransactionRecord } from "../domain/types.js";
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

// ---- Phase 6 in-memory repositories ----

class MemAgents implements AgentsRepository {
  private m = new Map<string, StoredAgent>();
  private pub(a: StoredAgent): AgentRecord {
    const { walletKeyBlob: _w, spendingKeyBlob: _s, ...pub } = a;
    return pub;
  }
  async create(a: StoredAgent) {
    this.m.set(a.id, { ...a });
    return this.pub(a);
  }
  async get(id: string) {
    const a = this.m.get(id);
    return a ? this.pub(a) : null;
  }
  async getByOwnerRole(owner: string, role: AgentRole) {
    for (const a of this.m.values()) if (a.owner === owner && a.role === role) return this.pub(a);
    return null;
  }
  async listByOwner(owner: string) {
    return [...this.m.values()].filter((a) => a.owner === owner).map((a) => this.pub(a));
  }
  async getSecretBlobs(id: string) {
    const a = this.m.get(id);
    return a ? { walletKeyBlob: a.walletKeyBlob, spendingKeyBlob: a.spendingKeyBlob } : null;
  }
  async setStatus(id: string, status: "ACTIVE" | "DISABLED") {
    const a = this.m.get(id);
    if (a) a.status = status;
  }
}

class MemTradeIntents implements TradeIntentsRepository {
  private m = new Map<string, TradeIntentRecord>();
  async create(i: TradeIntentRecord) {
    this.m.set(i.id, { ...i });
    return i;
  }
  async get(id: string) {
    const i = this.m.get(id);
    return i ? { ...i } : null;
  }
  async listByOwner(owner: string, limit = 100) {
    return [...this.m.values()].filter((i) => i.owner === owner).slice(-limit).reverse();
  }
}

class MemTradeExecutions implements TradeExecutionsRepository {
  private m = new Map<string, TradeExecutionRecord>();
  async create(e: TradeExecutionRecord) {
    this.m.set(e.id, { ...e });
    return e;
  }
  async get(id: string) {
    const e = this.m.get(id);
    return e ? { ...e } : null;
  }
  async update(e: TradeExecutionRecord) {
    this.m.set(e.id, { ...e });
    return e;
  }
  async listByOwner(owner: string, limit = 100) {
    return [...this.m.values()].filter((e) => e.owner === owner).slice(-limit).reverse();
  }
  async sumValueUsdSince(owner: string, sinceIso: string) {
    const since = new Date(sinceIso).getTime();
    return [...this.m.values()]
      .filter((e) => e.owner === owner && new Date(e.createdAt).getTime() >= since)
      .reduce((sum, e) => sum + (Number(e.valueUsd) || 0), 0);
  }
}

class MemAgentTransfers implements AgentTransfersRepository {
  private m = new Map<string, AgentTransferRecord>();
  async create(t: AgentTransferRecord) {
    this.m.set(t.id, { ...t });
    return t;
  }
  async update(t: AgentTransferRecord) {
    this.m.set(t.id, { ...t });
    return t;
  }
  async listByAgent(agentId: string, limit = 100) {
    return [...this.m.values()].filter((t) => t.fromAgentId === agentId).slice(-limit).reverse();
  }
}

class MemPortfolio implements PortfolioRepository {
  private snaps: PortfolioSnapshotRecord[] = [];
  private targets = new Map<string, Record<string, number>>();
  async saveSnapshot(snap: PortfolioSnapshotRecord) {
    this.snaps.push({ ...snap });
  }
  async latest(owner: string) {
    const owned = this.snaps.filter((s) => s.owner === owner);
    return owned.length ? { ...owned[owned.length - 1]! } : null;
  }
  async history(owner: string, limit = 50) {
    return this.snaps.filter((s) => s.owner === owner).slice(-limit).reverse();
  }
  async getTarget(owner: string) {
    return this.targets.get(owner) ?? null;
  }
  async setTarget(owner: string, allocations: Record<string, number>) {
    this.targets.set(owner, allocations);
  }
}

class MemAgentMemory implements AgentMemoryRepository {
  private m = new Map<string, AgentMemoryRecord>();
  async create(x: AgentMemoryRecord, _embedding?: number[] | null) {
    this.m.set(x.id, { ...x });
    return x;
  }
  async recall(owner: string, opts?: { types?: MemoryType[]; limit?: number }) {
    return [...this.m.values()]
      .filter((x) => x.owner === owner && (!opts?.types?.length || opts.types.includes(x.memoryType)))
      .sort((a, b) => b.importance - a.importance || (a.createdAt < b.createdAt ? 1 : -1))
      .slice(0, opts?.limit ?? 20);
  }
  async recallSimilar(owner: string, _embedding: number[], opts?: { types?: MemoryType[]; limit?: number }) {
    // No vector index in memory — fall back to importance/recency.
    return this.recall(owner, opts);
  }
  async count(owner: string) {
    return [...this.m.values()].filter((x) => x.owner === owner).length;
  }
  async delete(id: string) {
    this.m.delete(id);
  }
  async clear(owner: string) {
    for (const [id, x] of this.m) if (x.owner === owner) this.m.delete(id);
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
    agents: new MemAgents(),
    tradeIntents: new MemTradeIntents(),
    tradeExecutions: new MemTradeExecutions(),
    agentTransfers: new MemAgentTransfers(),
    portfolio: new MemPortfolio(),
    memory: new MemAgentMemory(),
  };
}
