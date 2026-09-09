import { randomUUID } from "node:crypto";
import type { Address, Hash } from "viem";
import type { Repositories } from "../database/repositories.js";
import type { NoteManager } from "../notes/manager.js";
import type { ProofService } from "../proofs/service.js";
import type { ContractClient } from "../contracts/index.js";
import type { ChainClient } from "../blockchain/client.js";
import type { TransactionManager } from "../transactions/manager.js";
import type { MerkleSynchronizer } from "../merkle/synchronizer.js";
import type { LockService } from "./locks.js";
import type { Logger } from "../observability/logger.js";
import type { PlonkProof, OperationRecord, OperationStatus, OperationType } from "../domain/types.js";
import { assertTransition, isTerminal } from "../domain/state-machine.js";
import { ASSET_ID, MAX_VALUE } from "../crypto/poseidon.js";
import {
  depositWitness,
  mergeWitness,
  splitWitness,
  transferWitness,
  withdrawWitness,
} from "../proofs/witness.js";
import {
  InvalidMerkleRoot,
  InvalidRequest,
  NullifierAlreadySpent,
  OperationNotFound,
  ProofValidationFailed,
  TalosError,
  UnsupportedAsset,
} from "../errors/index.js";

export interface EngineDeps {
  repos: Repositories;
  notes: NoteManager;
  proofs: ProofService;
  contract: ContractClient;
  chain: ChainClient;
  txManager: TransactionManager;
  merkle: MerkleSynchronizer;
  locks: LockService;
  logger: Logger;
}

/**
 * ExecutionEngine (Phase 4 §7, §19–§23). Orchestrates each operation through its
 * lifecycle: validate → prove → submit → confirm → reconcile. It is the ONLY place
 * that spends notes, and it enforces the security checks before every submission
 * (§18): the proof root must be a known on-chain root and the nullifier must be
 * unspent on-chain. Notes are locked for the duration; on failure before the
 * nullifier is consumed on-chain, locks are released and notes returned to AVAILABLE.
 */
export class ExecutionEngine {
  constructor(private readonly d: EngineDeps) {}

  // ---- Operation creation (idempotent) ----

  async createOperation(
    type: OperationType,
    request: Record<string, unknown>,
    idempotencyKey: string | null,
  ): Promise<OperationRecord> {
    if (idempotencyKey) {
      const existing = await this.d.repos.operations.getByIdempotencyKey(idempotencyKey);
      if (existing) return existing;
    }
    const now = new Date().toISOString();
    const op: OperationRecord = {
      id: `talos_op_${randomUUID()}`,
      type,
      status: "CREATED",
      idempotencyKey,
      noteIds: [],
      proofId: null,
      txHash: null,
      errorCode: null,
      errorMessage: null,
      request,
      result: null,
      createdAt: now,
      updatedAt: now,
    };
    await this.d.repos.operations.create(op);
    if (idempotencyKey) await this.d.repos.idempotency.put(idempotencyKey, op.id);
    return op;
  }

  async getOperation(id: string): Promise<OperationRecord> {
    const op = await this.d.repos.operations.get(id);
    if (!op) throw OperationNotFound(`operation ${id} not found`);
    return op;
  }

  /** Execute an operation to completion (called by a worker or the inline dispatcher). */
  async runOperation(id: string): Promise<OperationRecord> {
    let op = await this.getOperation(id);
    if (op.status !== "CREATED") return op; // already running/terminal (idempotent)
    try {
      switch (op.type) {
        case "DEPOSIT":
          return await this.runDeposit(op);
        case "SPLIT":
          return await this.runSplit(op);
        case "MERGE":
          return await this.runMerge(op);
        case "TRANSFER":
          return await this.runTransfer(op);
        case "WITHDRAW":
          return await this.runWithdraw(op);
      }
    } catch (e) {
      op = await this.getOperation(id);
      return this.fail(op, e);
    }
  }

  // ---- Shared helpers ----

  private async setStatus(op: OperationRecord, status: OperationStatus, patch: Partial<OperationRecord> = {}): Promise<OperationRecord> {
    assertTransition(op.status, status);
    const updated: OperationRecord = { ...op, ...patch, status, updatedAt: new Date().toISOString() };
    return this.d.repos.operations.update(updated);
  }

  private async fail(op: OperationRecord, e: unknown): Promise<OperationRecord> {
    const code = e instanceof TalosError ? e.code : "INTERNAL_ERROR";
    const message = e instanceof Error ? e.message : String(e);
    this.d.logger.error("operation failed", { operationId: op.id, code, message });
    // Release any locked notes back to AVAILABLE (nullifier not consumed on-chain).
    for (const noteId of op.noteIds) await this.d.notes.releaseLock(noteId).catch(() => {});
    // Pre-execution failures (bad request, unavailable note) are rejections; failures
    // once proving/submission has begun are execution failures.
    const target: OperationStatus =
      op.status === "CREATED" || op.status === "VALIDATING" ? "REJECTED" : "FAILED";
    try {
      return await this.setStatus(op, target, { errorCode: code, errorMessage: message });
    } catch {
      const forced: OperationRecord = { ...op, status: "FAILED", errorCode: code, errorMessage: message, updatedAt: new Date().toISOString() };
      return this.d.repos.operations.update(forced);
    }
  }

  private async ensureKnownRoot(root: string): Promise<void> {
    if (!(await this.d.contract.isKnownRoot(BigInt(root)))) {
      throw InvalidMerkleRoot(`root ${root} is not a known on-chain root`);
    }
  }

  private async ensureNullifierUnspent(nullifier: string): Promise<void> {
    if (await this.d.contract.isNullifierSpent(BigInt(nullifier))) {
      throw NullifierAlreadySpent(`nullifier ${nullifier} already spent on-chain`);
    }
  }

  private async resolvePath(commitment: string) {
    await this.d.merkle.sync();
    let path = await this.d.merkle.getPath(commitment);
    if (!path) {
      await this.d.merkle.sync();
      path = await this.d.merkle.getPath(commitment);
    }
    if (!path) throw InvalidMerkleRoot(`commitment ${commitment} not found in the tree yet`);
    return path;
  }

  /**
   * The Merkle inclusion path for a note, so a client can build a spend witness itself
   * (B4). Returns public data only — root, sibling path, direction bits, leaf index — never
   * a secret. Throws if the note's commitment isn't in the synchronized tree yet.
   */
  async notePath(
    noteId: string,
  ): Promise<{ root: string; pathElements: string[]; pathIndices: number[]; leafIndex: number | null }> {
    const note = await this.d.notes.get(noteId);
    const path = await this.resolvePath(note.commitment);
    return {
      root: path.root,
      pathElements: path.pathElements,
      pathIndices: path.pathIndices,
      leafIndex: note.leafIndex,
    };
  }

  /** Sync events and return the on-chain leaf index of a commitment (best-effort). */
  private async resolveLeafIndex(commitment: string): Promise<number | null> {
    await this.d.merkle.sync();
    let li = await this.d.repos.merkle.getLeafIndex(commitment);
    if (li === null) {
      await this.d.merkle.sync();
      li = await this.d.repos.merkle.getLeafIndex(commitment);
    }
    return li;
  }

  // ---- DEPOSIT ----

  private async runDeposit(op0: OperationRecord): Promise<OperationRecord> {
    let op = await this.setStatus(op0, "VALIDATING");
    const assetId = BigInt(String(op.request.assetId ?? ASSET_ID));
    const amount = BigInt(String(op.request.amount));
    if (assetId !== ASSET_ID) throw UnsupportedAsset(`asset ${assetId} not supported`);
    if (amount <= 0n || amount > MAX_VALUE) throw InvalidRequest("amount out of range");

    const note = await this.d.notes.createNote({ assetId, value: amount });
    op = await this.d.repos.operations.update({ ...op, noteIds: [note.id] });

    // Deposit binding proof (B1): verified ON-CHAIN by the pool's Deposit verifier —
    // binds the public (assetId, amount) to the value/asset committed in the note.
    op = await this.setStatus(op, "PROVING");
    const proofPkg = await this.d.proofs.prove("DEPOSIT", depositWitness(note));
    const proofId = `proof_${randomUUID()}`;
    await this.d.repos.proofs.create(proofId, proofPkg);
    op = await this.setStatus(op, "PROOF_READY", { proofId });

    // Fund + approve if necessary, then deposit.
    op = await this.setStatus(op, "READY_TO_SUBMIT");
    op = await this.setStatus(op, "SUBMITTING");
    const pool = this.d.contract.poolAddress;
    const allowance = await this.d.contract.allowance(this.d.contract.signer, pool).catch(() => 0n);
    if (allowance < amount) {
      // Confirm the ERC-20 approval before the deposit (distinct approval tx, §19).
      await this.d.txManager.submitAndConfirm(op.id, this.d.contract.assetAddress, () =>
        this.d.contract.approve(pool, MAX_VALUE),
      );
    }
    const tx = await this.d.txManager.submitAndConfirm(op.id, pool, () =>
      this.d.contract.deposit(proofPkg.proof, assetId, amount, BigInt(note.commitment)),
    );
    op = await this.setStatus(op, "SUBMITTED", { txHash: tx.txHash });
    op = await this.setStatus(op, "CONFIRMING");
    op = await this.setStatus(op, "CONFIRMED");

    // Reconcile: sync events, attach leaf index, mark note AVAILABLE. The deposit is
    // confirmed on-chain, so the note becomes AVAILABLE regardless; the leaf index is
    // best-effort here and is always re-resolved from the synced tree at spend time.
    const leafIndex = await this.resolveLeafIndex(note.commitment);
    await this.d.notes.markAvailable(note.id, leafIndex);

    return this.setStatus(op, "FINALIZED", {
      result: { noteId: note.id, commitment: note.commitment, leafIndex, txHash: tx.txHash },
    });
  }

  // ---- DEPOSIT (non-custodial: user's browser wallet signs + funds the on-chain tx) ----

  /**
   * Phase 1 of a user-signed deposit: create the private note + commitment, generate the
   * B1 deposit binding proof, and stop at READY_TO_SUBMIT. The pool now verifies this
   * proof on-chain, so the browser calls `pool.deposit(proof, assetId, amount, commitment)`
   * with the returned `proof` (approving the ERC-20 or sending native OKB as value). The
   * server never holds the user's funds and never spends them; the proof only *binds* the
   * public (assetId, amount) to the committed note value.
   */
  async prepareDeposit(
    op0: OperationRecord,
  ): Promise<{ op: OperationRecord; commitment: string; proof: PlonkProof | null }> {
    let op = await this.setStatus(op0, "VALIDATING");
    const assetId = BigInt(String(op.request.assetId ?? ASSET_ID));
    const amount = BigInt(String(op.request.amount));
    if (assetId <= 0n) throw UnsupportedAsset(`asset ${assetId} not supported`);
    if (amount <= 0n || amount > MAX_VALUE) throw InvalidRequest("amount out of range");

    const owner = op.request.owner ? String(op.request.owner) : undefined;
    const clientCommitment = op.request.commitment ? String(op.request.commitment) : undefined;
    const clientOwnerPubKey = op.request.ownerPublicKey ? String(op.request.ownerPublicKey) : undefined;

    // --- B4 non-custodial path: the client proved the deposit binding itself and holds the
    // spending key. We only index its commitment (server learns NO spend secret) and return
    // no server proof — the browser submits its own. ---
    if (clientCommitment && clientOwnerPubKey) {
      const note = await this.d.notes.createClientNote({
        assetId,
        value: amount,
        commitment: clientCommitment,
        ownerPubKey: clientOwnerPubKey,
        owner,
      });
      op = await this.d.repos.operations.update({ ...op, noteIds: [note.id] });
      // Follow the same lifecycle as the custodial path — the binding proof simply exists
      // client-side, so the server has nothing to prove and holds no proof of its own.
      op = await this.setStatus(op, "PROVING");
      op = await this.setStatus(op, "PROOF_READY");
      op = await this.setStatus(op, "READY_TO_SUBMIT");
      return { op, commitment: note.commitment, proof: null };
    }

    // --- Custodial path (default): server mints the note + generates the binding proof. ---
    const note = await this.d.notes.createNote({ assetId, value: amount, owner });
    op = await this.d.repos.operations.update({ ...op, noteIds: [note.id] });

    op = await this.setStatus(op, "PROVING");
    const proofPkg = await this.d.proofs.prove("DEPOSIT", depositWitness(note));
    const proofId = `proof_${randomUUID()}`;
    await this.d.repos.proofs.create(proofId, proofPkg);
    op = await this.setStatus(op, "PROOF_READY", { proofId });
    op = await this.setStatus(op, "READY_TO_SUBMIT");
    return { op, commitment: note.commitment, proof: proofPkg.proof };
  }

  /**
   * Phase 2 of a user-signed deposit: the browser has broadcast the deposit tx and
   * hands back its hash. Wait for the receipt, then reconcile the note (sync the tree,
   * attach the leaf index, mark it AVAILABLE) and finalize.
   */
  async confirmDeposit(id: string, txHash: string): Promise<OperationRecord> {
    let op = await this.getOperation(id);
    if (op.type !== "DEPOSIT") throw InvalidRequest("operation is not a deposit");
    if (isTerminal(op.status)) return op; // idempotent — already reconciled
    if (op.status !== "READY_TO_SUBMIT") throw InvalidRequest(`deposit not awaiting a tx (status ${op.status})`);
    try {
      op = await this.setStatus(op, "SUBMITTING");
      op = await this.setStatus(op, "SUBMITTED", { txHash });
      op = await this.setStatus(op, "CONFIRMING");
      const receipt = await this.d.chain.waitForReceipt(txHash as Hash);
      if (receipt.status !== "success") throw InvalidRequest("deposit transaction reverted on-chain");
      op = await this.setStatus(op, "CONFIRMED");

      const noteId = op.noteIds[0]!;
      const note = await this.d.notes.get(noteId);
      const leafIndex = await this.resolveLeafIndex(note.commitment);
      await this.d.notes.markAvailable(noteId, leafIndex);
      return this.setStatus(op, "FINALIZED", {
        result: { noteId, commitment: note.commitment, leafIndex, txHash },
      });
    } catch (e) {
      op = await this.getOperation(id);
      return this.fail(op, e);
    }
  }

  // ---- SPLIT ----

  private async runSplit(op0: OperationRecord): Promise<OperationRecord> {
    const inputNoteId = String(op0.request.noteId);
    return this.d.locks.withLock(inputNoteId, async () => {
      let op = await this.setStatus(op0, "VALIDATING");
      const input = await this.d.notes.get(inputNoteId);
      const a1 = BigInt(String(op.request.amount1));
      const a2 = BigInt(String(op.request.amount2));
      if (a1 + a2 !== BigInt(input.value)) throw InvalidRequest("amount1 + amount2 must equal note value");
      if (a1 <= 0n || a2 <= 0n) throw InvalidRequest("split amounts must be positive");

      const locked = await this.d.notes.lockForSpend(inputNoteId);
      op = await this.d.repos.operations.update({ ...op, noteIds: [inputNoteId] });
      const path = await this.resolvePath(locked.commitment);
      await this.ensureKnownRoot(path.root);
      await this.ensureNullifierUnspent(locked.nullifier);

      op = await this.setStatus(op, "PROVING");
      const sk = BigInt(locked.nullifierSecret);
      const owner = input.owner ?? undefined; // child notes inherit the owner
      const out1 = await this.d.notes.createNote({ assetId: BigInt(input.assetId), value: a1, sk, owner });
      const out2 = await this.d.notes.createNote({ assetId: BigInt(input.assetId), value: a2, sk, owner });
      const proofPkg = await this.d.proofs.prove("SPLIT", splitWitness(locked, path, out1, out2));
      this.assertPublicSignals(proofPkg.publicSignals, [path.root, locked.nullifier, out1.commitment, out2.commitment]);
      const proofId = `proof_${randomUUID()}`;
      await this.d.repos.proofs.create(proofId, proofPkg);
      op = await this.setStatus(op, "PROOF_READY", { proofId });

      op = await this.setStatus(op, "READY_TO_SUBMIT");
      op = await this.setStatus(op, "SUBMITTING");
      const tx = await this.d.txManager.submitAndConfirm(op.id, this.d.contract.poolAddress, () =>
        this.d.contract.split(proofPkg.proof, BigInt(path.root), BigInt(locked.nullifier), BigInt(out1.commitment), BigInt(out2.commitment)),
      );
      op = await this.setStatus(op, "SUBMITTED", { txHash: tx.txHash });
      op = await this.setStatus(op, "CONFIRMING");
      op = await this.setStatus(op, "CONFIRMED");

      await this.d.notes.markSpent(inputNoteId);
      for (const n of [out1, out2]) await this.d.notes.markAvailable(n.id, await this.resolveLeafIndex(n.commitment));
      return this.setStatus(op, "FINALIZED", {
        result: { inputNoteId, outputNoteIds: [out1.id, out2.id], txHash: tx.txHash },
      });
    });
  }

  // ---- MERGE ----

  private async runMerge(op0: OperationRecord): Promise<OperationRecord> {
    const id1 = String(op0.request.noteId1);
    const id2 = String(op0.request.noteId2);
    return this.d.locks.withLock(id1, () =>
      this.d.locks.withLock(id2, async () => {
        let op = await this.setStatus(op0, "VALIDATING");
        const n1 = await this.d.notes.get(id1);
        const n2 = await this.d.notes.get(id2);
        if (n1.assetId !== n2.assetId) throw InvalidRequest("notes must share the same asset");
        if (n1.commitment === n2.commitment) throw InvalidRequest("cannot merge a note with itself");

        const l1 = await this.d.notes.lockForSpend(id1);
        const l2 = await this.d.notes.lockForSpend(id2);
        op = await this.d.repos.operations.update({ ...op, noteIds: [id1, id2] });
        const p1 = await this.resolvePath(l1.commitment);
        const p2 = await this.resolvePath(l2.commitment);
        await this.ensureKnownRoot(p1.root);
        await this.ensureNullifierUnspent(l1.nullifier);
        await this.ensureNullifierUnspent(l2.nullifier);

        op = await this.setStatus(op, "PROVING");
        const value = BigInt(l1.value) + BigInt(l2.value);
        const out = await this.d.notes.createNote({ assetId: BigInt(n1.assetId), value, sk: BigInt(l1.nullifierSecret), owner: n1.owner ?? undefined });
        const proofPkg = await this.d.proofs.prove("MERGE", mergeWitness(l1, p1, l2, p2, out));
        this.assertPublicSignals(proofPkg.publicSignals, [p1.root, l1.nullifier, l2.nullifier, out.commitment]);
        const proofId = `proof_${randomUUID()}`;
        await this.d.repos.proofs.create(proofId, proofPkg);
        op = await this.setStatus(op, "PROOF_READY", { proofId });

        op = await this.setStatus(op, "READY_TO_SUBMIT");
        op = await this.setStatus(op, "SUBMITTING");
        const tx = await this.d.txManager.submitAndConfirm(op.id, this.d.contract.poolAddress, () =>
          this.d.contract.merge(proofPkg.proof, BigInt(p1.root), BigInt(l1.nullifier), BigInt(l2.nullifier), BigInt(out.commitment)),
        );
        op = await this.setStatus(op, "SUBMITTED", { txHash: tx.txHash });
        op = await this.setStatus(op, "CONFIRMING");
        op = await this.setStatus(op, "CONFIRMED");

        await this.d.notes.markSpent(id1);
        await this.d.notes.markSpent(id2);
        await this.d.notes.markAvailable(out.id, await this.resolveLeafIndex(out.commitment));
        return this.setStatus(op, "FINALIZED", { result: { inputNoteIds: [id1, id2], outputNoteId: out.id, txHash: tx.txHash } });
      }),
    );
  }

  // ---- TRANSFER ----

  private async runTransfer(op0: OperationRecord): Promise<OperationRecord> {
    const inputNoteId = String(op0.request.noteId);
    return this.d.locks.withLock(inputNoteId, async () => {
      let op = await this.setStatus(op0, "VALIDATING");
      const input = await this.d.notes.get(inputNoteId);
      const a1 = BigInt(String(op.request.amount1));
      const a2 = BigInt(String(op.request.amount2));
      if (a1 + a2 !== BigInt(input.value)) throw InvalidRequest("amount1 + amount2 must equal note value");

      const locked = await this.d.notes.lockForSpend(inputNoteId);
      op = await this.d.repos.operations.update({ ...op, noteIds: [inputNoteId] });
      const path = await this.resolvePath(locked.commitment);
      await this.ensureKnownRoot(path.root);
      await this.ensureNullifierUnspent(locked.nullifier);

      op = await this.setStatus(op, "PROVING");
      // out1 -> recipient key (external, server cannot spend); out2 -> self.
      const recipientPub = BigInt(String(op.request.recipientOwnerPubKey));
      const out1 = await this.d.notes.createExternalNote(BigInt(input.assetId), a1, recipientPub);
      const out2 = await this.d.notes.createNote({ assetId: BigInt(input.assetId), value: a2, owner: input.owner ?? undefined });
      const proofPkg = await this.d.proofs.prove("TRANSFER", transferWitness(locked, path, out1, out2));
      this.assertPublicSignals(proofPkg.publicSignals, [path.root, locked.nullifier, out1.commitment, out2.commitment]);
      const proofId = `proof_${randomUUID()}`;
      await this.d.repos.proofs.create(proofId, proofPkg);
      op = await this.setStatus(op, "PROOF_READY", { proofId });

      op = await this.setStatus(op, "READY_TO_SUBMIT");
      op = await this.setStatus(op, "SUBMITTING");
      const tx = await this.d.txManager.submitAndConfirm(op.id, this.d.contract.poolAddress, () =>
        this.d.contract.transfer(proofPkg.proof, BigInt(path.root), BigInt(locked.nullifier), BigInt(out1.commitment), BigInt(out2.commitment)),
      );
      op = await this.setStatus(op, "SUBMITTED", { txHash: tx.txHash });
      op = await this.setStatus(op, "CONFIRMING");
      op = await this.setStatus(op, "CONFIRMED");

      await this.d.notes.markSpent(inputNoteId);
      await this.d.notes.markAvailable(out2.id, await this.resolveLeafIndex(out2.commitment));
      // Recipient (out1) private fields are intentionally NOT returned via the API.
      return this.setStatus(op, "FINALIZED", {
        result: { inputNoteId, changeNoteId: out2.id, recipientCommitment: out1.commitment, txHash: tx.txHash },
      });
    });
  }

  // ---- WITHDRAW ----

  private async runWithdraw(op0: OperationRecord): Promise<OperationRecord> {
    const inputNoteId = String(op0.request.noteId);
    return this.d.locks.withLock(inputNoteId, async () => {
      let op = await this.setStatus(op0, "VALIDATING");
      const input = await this.d.notes.get(inputNoteId);
      const recipient = String(op.request.recipient) as Address;
      if (!/^0x[0-9a-fA-F]{40}$/.test(recipient)) throw InvalidRequest("invalid recipient address");

      const locked = await this.d.notes.lockForSpend(inputNoteId);
      op = await this.d.repos.operations.update({ ...op, noteIds: [inputNoteId] });
      const path = await this.resolvePath(locked.commitment);
      await this.ensureKnownRoot(path.root);
      await this.ensureNullifierUnspent(locked.nullifier);

      op = await this.setStatus(op, "PROVING");
      const amount = BigInt(locked.value);
      const recipientField = BigInt(recipient).toString();
      const proofPkg = await this.d.proofs.prove("WITHDRAW", withdrawWitness(locked, path, amount.toString(), recipientField));
      this.assertPublicSignals(proofPkg.publicSignals, [path.root, locked.nullifier, amount.toString(), recipientField, input.assetId]);
      const proofId = `proof_${randomUUID()}`;
      await this.d.repos.proofs.create(proofId, proofPkg);
      op = await this.setStatus(op, "PROOF_READY", { proofId });

      op = await this.setStatus(op, "READY_TO_SUBMIT");
      op = await this.setStatus(op, "SUBMITTING");
      const tx = await this.d.txManager.submitAndConfirm(op.id, this.d.contract.poolAddress, () =>
        this.d.contract.withdraw(proofPkg.proof, BigInt(path.root), BigInt(locked.nullifier), amount, recipient, BigInt(input.assetId)),
      );
      op = await this.setStatus(op, "SUBMITTED", { txHash: tx.txHash });
      op = await this.setStatus(op, "CONFIRMING");
      op = await this.setStatus(op, "CONFIRMED");

      await this.d.notes.markSpent(inputNoteId);
      await this.d.merkle.sync();
      return this.setStatus(op, "FINALIZED", {
        result: { inputNoteId, recipient, amount: amount.toString(), txHash: tx.txHash },
      });
    });
  }

  /**
   * B4 relay: submit a withdraw whose PLONK proof was generated CLIENT-SIDE. The server
   * never held the spending key; it validates the note it owns for this wallet, then relays
   * the client's proof. The proof binds (root, nullifier, amount, recipient, assetId), and
   * the server pins `amount`/`assetId` from its own record of the note — so a client cannot
   * withdraw a different amount/asset than the note holds (the on-chain verifier would
   * reject a proof over mismatched public signals). Double-spend is enforced on-chain by the
   * nullifier set. Griefing is bounded: only the note's owner can trigger this, and the note
   * is locked, so a bad proof (which the pool rejects) at worst costs the relayer one revert.
   */
  async submitClientWithdraw(op0: OperationRecord, clientProof: PlonkProof): Promise<OperationRecord> {
    const inputNoteId = String(op0.request.noteId);
    return this.d.locks.withLock(inputNoteId, async () => {
      let op = await this.setStatus(op0, "VALIDATING");
      const recipient = String(op.request.recipient) as Address;
      if (!/^0x[0-9a-fA-F]{40}$/.test(recipient)) throw InvalidRequest("invalid recipient address");
      const root = BigInt(String(op.request.root)).toString();
      const nullifier = BigInt(String(op.request.nullifier)).toString();

      const locked = await this.d.notes.lockClientNote(inputNoteId);
      op = await this.d.repos.operations.update({ ...op, noteIds: [inputNoteId] });
      await this.ensureKnownRoot(root);
      await this.ensureNullifierUnspent(nullifier);

      op = await this.setStatus(op, "PROOF_READY"); // proof came from the client
      op = await this.setStatus(op, "READY_TO_SUBMIT");
      op = await this.setStatus(op, "SUBMITTING");
      const amount = BigInt(locked.value);
      const tx = await this.d.txManager.submitAndConfirm(op.id, this.d.contract.poolAddress, () =>
        this.d.contract.withdraw(clientProof, BigInt(root), BigInt(nullifier), amount, recipient, BigInt(locked.assetId)),
      );
      op = await this.setStatus(op, "SUBMITTED", { txHash: tx.txHash });
      op = await this.setStatus(op, "CONFIRMING");
      op = await this.setStatus(op, "CONFIRMED");

      await this.d.notes.markSpent(inputNoteId);
      await this.d.merkle.sync();
      return this.setStatus(op, "FINALIZED", {
        result: { inputNoteId, recipient, amount: amount.toString(), nullifier, txHash: tx.txHash },
      });
    });
  }

  /**
   * B4 relay for multi-output spends (SPLIT / TRANSFER / MERGE) proved CLIENT-SIDE. The
   * server never held a spending key; it locks the client-owned input note(s), relays the
   * client's proof, then registers the resulting output commitments as client-owned notes
   * (again no spending key). The pool's on-chain verifier enforces conservation, nullifier
   * correctness, and membership; the server pins nothing it cannot know for a client note.
   */
  async submitClientSpend(
    op0: OperationRecord,
    clientProof: PlonkProof,
    spend: {
      inputNoteIds: string[];
      root: string;
      nullifiers: string[];
      outCommitments: string[];
      outputs: { commitment: string; assetId: string; value: string; ownerPubKey: string; mine: boolean }[];
      owner?: string;
    },
  ): Promise<OperationRecord> {
    const ids = spend.inputNoteIds;
    const root = BigInt(spend.root).toString();

    const body = async (): Promise<OperationRecord> => {
      let op = await this.setStatus(op0, "VALIDATING");
      for (const id of ids) await this.d.notes.lockClientNote(id);
      op = await this.d.repos.operations.update({ ...op, noteIds: ids });
      await this.ensureKnownRoot(root);
      for (const nf of spend.nullifiers) await this.ensureNullifierUnspent(BigInt(nf).toString());

      op = await this.setStatus(op, "PROOF_READY"); // proof came from the client
      op = await this.setStatus(op, "READY_TO_SUBMIT");
      op = await this.setStatus(op, "SUBMITTING");

      const oc = spend.outCommitments.map((x) => BigInt(x));
      const nf = spend.nullifiers.map((x) => BigInt(x));
      const call = () => {
        switch (op0.type) {
          case "SPLIT":
            return this.d.contract.split(clientProof, BigInt(root), nf[0]!, oc[0]!, oc[1]!);
          case "TRANSFER":
            return this.d.contract.transfer(clientProof, BigInt(root), nf[0]!, oc[0]!, oc[1]!);
          case "MERGE":
            return this.d.contract.merge(clientProof, BigInt(root), nf[0]!, nf[1]!, oc[0]!);
          default:
            throw InvalidRequest(`unsupported client spend op ${op0.type}`);
        }
      };
      const tx = await this.d.txManager.submitAndConfirm(op.id, this.d.contract.poolAddress, call);
      op = await this.setStatus(op, "SUBMITTED", { txHash: tx.txHash });
      op = await this.setStatus(op, "CONFIRMING");
      op = await this.setStatus(op, "CONFIRMED");

      for (const id of ids) await this.d.notes.markSpent(id);
      // Register the created output notes (client-owned; server holds no spend secret) and
      // attach their on-chain leaf indices after syncing the tree.
      const outIds: string[] = [];
      for (const out of spend.outputs) {
        const note = await this.d.notes.createClientNote({
          assetId: BigInt(out.assetId),
          value: BigInt(out.value),
          commitment: out.commitment,
          ownerPubKey: out.ownerPubKey,
          owner: out.mine ? spend.owner : undefined,
        });
        await this.d.notes.markAvailable(note.id, await this.resolveLeafIndex(note.commitment));
        outIds.push(note.id);
      }
      return this.setStatus(op, "FINALIZED", {
        result: { inputNoteIds: ids, outputNoteIds: outIds, txHash: tx.txHash },
      });
    };

    // Lock all inputs (at most two) before running.
    if (ids.length === 2) return this.d.locks.withLock(ids[0]!, () => this.d.locks.withLock(ids[1]!, body));
    return this.d.locks.withLock(ids[0]!, body);
  }

  /** Validate proof public signals exactly match the intended values (§17/§18). */
  private assertPublicSignals(actual: string[], expected: string[]): void {
    const norm = (x: string) => BigInt(x).toString();
    if (actual.length !== expected.length || actual.some((v, i) => norm(v) !== norm(expected[i]!))) {
      throw ProofValidationFailed("public signals do not match intended operation", {
        expected: expected.map(norm),
        actual: actual.map(norm),
      });
    }
  }
}
