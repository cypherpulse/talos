import { randomUUID } from "node:crypto";
import type { Note, NoteState } from "../domain/types.js";
import { assertNoteTransition } from "../domain/state-machine.js";
import type { NotesRepository } from "../database/repositories.js";
import type { ContractClient } from "../contracts/index.js";
import { deriveCommitment, deriveNullifier, deriveOwnerPubKey } from "../crypto/poseidon.js";
import { randomFieldElement } from "../crypto/random.js";
import { NoteAlreadySpent, NoteNotAvailable, NoteNotFound, NullifierAlreadySpent } from "../errors/index.js";
import type { Logger } from "../observability/logger.js";

export interface CreateNoteParams {
  assetId: bigint;
  value: bigint;
  sk?: bigint; // spending key; generated if absent
  secret?: bigint;
  nonce?: bigint;
  owner?: string; // wallet address that owns this note (per-user scoping)
}

/**
 * NoteManager — server-side private note lifecycle (Phase 4 §11–§13).
 *
 * Derives commitments/nullifiers with the frozen Poseidon construction, manages the
 * note state machine, and reconciles against authoritative on-chain state (the
 * contract's nullifier set) before every spend. Note secrets live only in the domain
 * object in memory; the durable store encrypts them at rest.
 */
export class NoteManager {
  constructor(
    private readonly notes: NotesRepository,
    private readonly contract: ContractClient,
    private readonly logger: Logger,
  ) {}

  async createNote(params: CreateNoteParams): Promise<Note> {
    const sk = params.sk ?? randomFieldElement();
    const secret = params.secret ?? randomFieldElement();
    const nonce = params.nonce ?? randomFieldElement();
    const ownerPubKey = await deriveOwnerPubKey(sk);
    const commitment = await deriveCommitment(params.assetId, params.value, ownerPubKey, secret, nonce);
    const nullifier = await deriveNullifier(sk, secret);

    const now = new Date().toISOString();
    const note: Note = {
      id: `note_${randomUUID()}`,
      assetId: params.assetId.toString(),
      value: params.value.toString(),
      ownerPubKey: ownerPubKey.toString(),
      secret: secret.toString(),
      nonce: nonce.toString(),
      nullifierSecret: sk.toString(),
      commitment: commitment.toString(),
      nullifier: nullifier.toString(),
      state: "CREATED",
      leafIndex: null,
      owner: params.owner ? params.owner.toLowerCase() : null,
      createdAt: now,
      updatedAt: now,
    };
    await this.notes.create(note);
    this.logger.info("note created", { noteId: note.id, commitment: note.commitment });
    return note;
  }

  /**
   * Create an output note owned by an external recipient public key. The server
   * chooses secret/nonce and can compute the commitment, but does NOT know the
   * recipient's spending key, so it cannot spend the note (nullifierSecret unknown).
   * Used for private transfers to a counterparty (§22).
   */
  async createExternalNote(assetId: bigint, value: bigint, ownerPubKey: bigint): Promise<Note> {
    const secret = randomFieldElement();
    const nonce = randomFieldElement();
    const commitment = await deriveCommitment(assetId, value, ownerPubKey, secret, nonce);
    const now = new Date().toISOString();
    const note: Note = {
      id: `note_${randomUUID()}`,
      assetId: assetId.toString(),
      value: value.toString(),
      ownerPubKey: ownerPubKey.toString(),
      secret: secret.toString(),
      nonce: nonce.toString(),
      nullifierSecret: "",
      nullifier: "",
      commitment: commitment.toString(),
      state: "CREATED",
      leafIndex: null,
      owner: null, // counterparty note — not owned by any local wallet
      createdAt: now,
      updatedAt: now,
    };
    await this.notes.create(note);
    return note;
  }

  async get(id: string): Promise<Note> {
    const note = await this.notes.get(id);
    if (!note) throw NoteNotFound(`note ${id} not found`);
    return note;
  }

  private async transition(note: Note, to: NoteState): Promise<Note> {
    assertNoteTransition(note.state, to);
    const updated: Note = { ...note, state: to, updatedAt: new Date().toISOString() };
    return this.notes.update(updated);
  }

  async markAvailable(id: string, leafIndex: number | null): Promise<Note> {
    const note = await this.get(id);
    const withLeaf: Note = { ...note, leafIndex: leafIndex ?? note.leafIndex };
    if (note.state === "AVAILABLE") return this.notes.update(withLeaf);
    return this.transition(withLeaf, "AVAILABLE");
  }

  /** Lock a note for spending, after confirming its nullifier is not already spent on-chain. */
  async lockForSpend(id: string): Promise<Note> {
    const note = await this.get(id);
    if (note.state === "SPENT") throw NoteAlreadySpent(`note ${id} already spent`);
    if (note.state !== "AVAILABLE") throw NoteNotAvailable(`note ${id} is ${note.state}, not AVAILABLE`);
    if (await this.contract.isNullifierSpent(BigInt(note.nullifier))) {
      await this.transition(note, "PENDING_SPEND").then((n) => this.transition(n, "SPENT")).catch(() => {});
      throw NullifierAlreadySpent(`note ${id} nullifier already spent on-chain`);
    }
    return this.transition(note, "PENDING_SPEND");
  }

  /** Release a lock when a spend fails before the nullifier is consumed on-chain. */
  async releaseLock(id: string): Promise<Note> {
    const note = await this.get(id);
    if (note.state !== "PENDING_SPEND") return note;
    this.logger.info("note lock released", { noteId: id });
    return this.transition(note, "AVAILABLE");
  }

  async markSpent(id: string): Promise<Note> {
    const note = await this.get(id);
    if (note.state === "SPENT") return note;
    return this.transition(note, "SPENT");
  }
}
