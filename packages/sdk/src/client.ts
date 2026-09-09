/**
 * TalosClient — the one-call, non-custodial surface for builders and agents. Ties a signer
 * (for key derivation), the REST API, and an artifact source (for in-process PLONK proving).
 * The spending key is derived from the signer's wallet signature and never leaves the
 * process; spends are proved locally and relayed by the server. Reads pass through to the API.
 *
 *   const talos = new TalosClient({ baseUrl, signer, artifacts: fileArtifacts("circuits/build") });
 *   const { proof } = await talos.prepareDeposit({ assetId: 1, amount: "1000000" });
 *   await talos.withdraw({ note, noteIndex, recipient });
 *
 * Notes created non-custodially are identified by the `noteIndex` used to derive their
 * secret/nonce from the viewing key; the caller persists that index (the web app uses a
 * localStorage registry). Spend methods return the indices of any output notes they create.
 */
import { TalosApi, type TalosApiOptions } from "./api";
import type { ArtifactSource } from "./artifacts";
import {
  deriveNoteNonce,
  deriveNoteSecret,
  deriveTalosKeys,
  TALOS_KEY_MESSAGE,
  type TalosKeys,
} from "./keys";
import {
  depositArtifacts,
  depositWitness,
  deriveOwnerPubKey,
  mergeWitness,
  splitWitness,
  transferWitness,
  withdrawWitness,
  type NoteFields,
  type OutputSpec,
} from "./notes";
import { provePlonk } from "./proof";
import type { TalosSigner } from "./signer";
import type { OperationView } from "./types";

export interface TalosClientOptions {
  baseUrl: string;
  signer: TalosSigner;
  artifacts: ArtifactSource;
  fetch?: TalosApiOptions["fetch"];
  /** Override the freshly-created note index generator (default: monotonic timestamp). */
  nextIndex?: () => number;
}

/** Minimal note reference a spend needs: id + the index its secret/nonce were derived from. */
export interface NoteRef {
  id: string;
  assetId: number;
  value: string;
  noteIndex: number;
}

export interface OutputRecord {
  commitment: string;
  noteIndex: number;
  assetId: string;
  value: string;
  ownerPubKey: string;
  mine: boolean;
}

export interface DepositPrep {
  operationId: string;
  commitment: string;
  ownerPubKey: string;
  proof: string[];
  noteIndex: number;
  poolAddress: string;
  assetId: number;
  amount: string;
}

export class TalosClient {
  readonly api: TalosApi;
  private readonly signer: TalosSigner;
  private readonly artifacts: ArtifactSource;
  private readonly nextIndex: () => number;
  private _keys?: Promise<TalosKeys>;

  constructor(opts: TalosClientOptions) {
    this.api = new TalosApi({ baseUrl: opts.baseUrl, ...(opts.fetch ? { fetch: opts.fetch } : {}) });
    this.signer = opts.signer;
    this.artifacts = opts.artifacts;
    let counter = 0;
    this.nextIndex = opts.nextIndex ?? (() => Date.now() * 1000 + counter++);
  }

  /** Derive (and cache) the wallet's key tree by signing the fixed key message once. */
  keys(): Promise<TalosKeys> {
    if (!this._keys) this._keys = this.signer.signMessage(TALOS_KEY_MESSAGE).then(deriveTalosKeys);
    return this._keys;
  }

  address(): Promise<string> {
    return this.signer.getAddress();
  }

  private async noteFields(assetId: number, value: string, noteIndex: number): Promise<NoteFields> {
    const keys = await this.keys();
    return {
      assetId: BigInt(assetId),
      value: BigInt(value),
      sk: keys.spendingKey,
      secret: await deriveNoteSecret(keys.viewingKey, noteIndex),
      nonce: await deriveNoteNonce(keys.viewingKey, noteIndex),
    };
  }

  private async output(assetId: number, value: bigint, ownerPubKey: bigint, mine: boolean): Promise<{ spec: OutputSpec; rec: Omit<OutputRecord, "commitment"> }> {
    const keys = await this.keys();
    const noteIndex = this.nextIndex();
    return {
      spec: { value, ownerPubKey, secret: await deriveNoteSecret(keys.viewingKey, noteIndex), nonce: await deriveNoteNonce(keys.viewingKey, noteIndex) },
      rec: { noteIndex, assetId: assetId.toString(), value: value.toString(), ownerPubKey: ownerPubKey.toString(), mine },
    };
  }

  // --- deposit (non-custodial): prove locally; the caller submits the on-chain tx + confirms ---
  async prepareDeposit(params: { assetId: number; amount: string; owner?: string; noteIndex?: number }): Promise<DepositPrep> {
    const noteIndex = params.noteIndex ?? this.nextIndex();
    const note = await this.noteFields(params.assetId, params.amount, noteIndex);
    const { ownerPubKey, commitment } = depositArtifacts(note);
    const art = await this.artifacts.load("deposit");
    const { proof } = await provePlonk(art.wasm, art.zkey, art.vkey, depositWitness(note));
    const owner = params.owner ?? (await this.address());
    const prep = await this.api.depositPrepare({ assetId: params.assetId, amount: params.amount, owner, commitment, ownerPublicKey: ownerPubKey });
    return {
      operationId: prep.operationId,
      commitment,
      ownerPubKey,
      proof,
      noteIndex,
      poolAddress: prep.poolAddress,
      assetId: params.assetId,
      amount: params.amount,
    };
  }

  /** Finalize a deposit after the on-chain tx is broadcast (server syncs the leaf). */
  confirmDeposit(operationId: string, txHash: string): Promise<OperationView> {
    return this.api.depositConfirm(operationId, txHash);
  }

  // --- withdraw (non-custodial, server-relayed; no client tx) ---
  async withdraw(params: { note: NoteRef; recipient: string }, idempotencyKey?: string): Promise<OperationView> {
    const path = await this.api.notePath(params.note.id);
    const note = await this.noteFields(params.note.assetId, params.note.value, params.note.noteIndex);
    const witness = withdrawWitness(note, path, BigInt(params.recipient).toString());
    const art = await this.artifacts.load("withdraw");
    const { proof, publicSignals } = await provePlonk(art.wasm, art.zkey, art.vkey, witness);
    return this.api.withdrawSubmit(
      { noteId: params.note.id, recipient: params.recipient, root: publicSignals[0]!, nullifier: publicSignals[1]!, proof },
      idempotencyKey,
    );
  }

  // --- split (non-custodial): 1 note -> 2 same-owner notes ---
  async split(
    params: { note: NoteRef; amount1: string; amount2: string },
    idempotencyKey?: string,
  ): Promise<{ op: OperationView; outputs: OutputRecord[] }> {
    const keys = await this.keys();
    const self = deriveOwnerPubKey(keys.spendingKey);
    const path = await this.api.notePath(params.note.id);
    const input = await this.noteFields(params.note.assetId, params.note.value, params.note.noteIndex);
    const a = await this.output(params.note.assetId, BigInt(params.amount1), self, true);
    const b = await this.output(params.note.assetId, BigInt(params.amount2), self, true);
    const art = await this.artifacts.load("split");
    const { proof, publicSignals } = await provePlonk(art.wasm, art.zkey, art.vkey, splitWitness(input, path, a.spec, b.spec));
    const outputs: OutputRecord[] = [
      { ...a.rec, commitment: publicSignals[2]! },
      { ...b.rec, commitment: publicSignals[3]! },
    ];
    const op = await this.relaySpend("splits", [params.note.id], publicSignals[0]!, [publicSignals[1]!], outputs, proof, idempotencyKey);
    return { op, outputs };
  }

  // --- transfer (non-custodial): out1 -> recipient key, out2 -> self change ---
  async transfer(
    params: { note: NoteRef; amount: string; recipientOwnerPubKey: string | bigint },
    idempotencyKey?: string,
  ): Promise<{ op: OperationView; outputs: OutputRecord[] }> {
    const keys = await this.keys();
    const self = deriveOwnerPubKey(keys.spendingKey);
    const change = (BigInt(params.note.value) - BigInt(params.amount)).toString();
    const path = await this.api.notePath(params.note.id);
    const input = await this.noteFields(params.note.assetId, params.note.value, params.note.noteIndex);
    const a = await this.output(params.note.assetId, BigInt(params.amount), BigInt(params.recipientOwnerPubKey), false);
    const b = await this.output(params.note.assetId, BigInt(change), self, true);
    const art = await this.artifacts.load("transfer");
    const { proof, publicSignals } = await provePlonk(art.wasm, art.zkey, art.vkey, transferWitness(input, path, a.spec, b.spec));
    const outputs: OutputRecord[] = [
      { ...a.rec, commitment: publicSignals[2]! },
      { ...b.rec, commitment: publicSignals[3]! },
    ];
    const op = await this.relaySpend("transfers", [params.note.id], publicSignals[0]!, [publicSignals[1]!], outputs, proof, idempotencyKey);
    return { op, outputs };
  }

  // --- merge (non-custodial): 2 same-owner notes -> 1 ---
  async merge(
    params: { note1: NoteRef; note2: NoteRef },
    idempotencyKey?: string,
  ): Promise<{ op: OperationView; outputs: OutputRecord[] }> {
    const keys = await this.keys();
    const self = deriveOwnerPubKey(keys.spendingKey);
    const [path1, path2] = await Promise.all([this.api.notePath(params.note1.id), this.api.notePath(params.note2.id)]);
    const in1 = await this.noteFields(params.note1.assetId, params.note1.value, params.note1.noteIndex);
    const in2 = await this.noteFields(params.note2.assetId, params.note2.value, params.note2.noteIndex);
    const total = BigInt(params.note1.value) + BigInt(params.note2.value);
    const out = await this.output(params.note1.assetId, total, self, true);
    const art = await this.artifacts.load("merge");
    const { proof, publicSignals } = await provePlonk(art.wasm, art.zkey, art.vkey, mergeWitness(in1, path1, in2, path2, out.spec));
    const outputs: OutputRecord[] = [{ ...out.rec, commitment: publicSignals[3]! }];
    const op = await this.relaySpend(
      "merges",
      [params.note1.id, params.note2.id],
      publicSignals[0]!,
      [publicSignals[1]!, publicSignals[2]!],
      outputs,
      proof,
      idempotencyKey,
    );
    return { op, outputs };
  }

  private async relaySpend(
    op: "splits" | "transfers" | "merges",
    inputNoteIds: string[],
    root: string,
    nullifiers: string[],
    outputs: OutputRecord[],
    proof: string[],
    idempotencyKey?: string,
  ): Promise<OperationView> {
    const owner = await this.address();
    return this.api.spendSubmit(
      op,
      {
        inputNoteIds,
        root,
        nullifiers,
        outCommitments: outputs.map((o) => o.commitment),
        outputs: outputs.map((o) => ({ commitment: o.commitment, assetId: o.assetId, value: o.value, ownerPubKey: o.ownerPubKey, mine: o.mine })),
        owner,
        proof,
      },
      idempotencyKey,
    );
  }
}
