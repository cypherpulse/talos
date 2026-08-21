import { asc, desc, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { Note, NoteState, OperationRecord, ProofPackage, TransactionRecord } from "../domain/types.js";
import type { NoteEncryptionService } from "../notes/encryption.js";
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
  async list(limit: number) {
    const rows = await this.db.select().from(s.notes).orderBy(desc(s.notes.createdAt)).limit(limit);
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
  };
}
