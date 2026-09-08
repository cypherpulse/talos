/**
 * Browser-side proving glue (B4 — runnable test).
 *
 * Wires the dependency-free crypto core (keys.ts / notes.ts / proof.ts) to real
 * snarkjs + circomlibjs in the browser and produces a genuine client-side PLONK deposit
 * proof — the spending key `sk` never leaves the browser. snarkjs/circomlibjs are
 * DYNAMICALLY imported so they are code-split out of the main bundle and only fetched when
 * a user actually proves. Circuit artifacts are served from `public/circuits/…`.
 *
 * This module powers the "prove in browser" self-test on the deposit page. It does not
 * replace the custodial deposit flow yet (backend note indexing + client-side SPEND proving
 * are the remaining B4 work); it lets you verify the browser proving pipeline + its timing.
 */
import { Buffer } from "buffer";
import { poseidon1, poseidon2, poseidon5 } from "poseidon-lite";
import { getInjected, type Eip1193 } from "./evm";
import { deriveNoteNonce, deriveNoteSecret, deriveTalosKeys, TALOS_KEY_MESSAGE } from "./keys";
import { depositArtifacts, depositWitness, withdrawWitness, type MerklePath, type Poseidon } from "./notes";
import { provePlonk, type PlonkBackend } from "./proof";

// snarkjs (loaded lazily below) expects a global Buffer in the browser.
if (typeof (globalThis as { Buffer?: unknown }).Buffer === "undefined") {
  (globalThis as { Buffer?: unknown }).Buffer = Buffer;
}

// circomlib-compatible Poseidon for the arities Talos uses (1, 2, 5). poseidon-lite is
// pure JS (no Node built-ins → no Vite polyfill headaches) and produces the SAME field
// elements as circomlib/circomlibjs. Cross-checked in packages/zk (zk:poseidon-check).
const poseidon: Poseidon = (inputs: bigint[]) => {
  switch (inputs.length) {
    case 1:
      return poseidon1(inputs);
    case 2:
      return poseidon2(inputs);
    case 5:
      return poseidon5(inputs);
    default:
      throw new Error(`unsupported Poseidon arity: ${inputs.length}`);
  }
};

const DEPOSIT_BASE = "/circuits/deposit";
const WASM_URL = `${DEPOSIT_BASE}/deposit_js/deposit.wasm`;
const ZKEY_URL = `${DEPOSIT_BASE}/deposit_final.zkey`;
const VKEY_URL = `${DEPOSIT_BASE}/verification_key.json`;

const WITHDRAW_BASE = "/circuits/withdraw";
const W_WASM_URL = `${WITHDRAW_BASE}/withdraw_js/withdraw.wasm`;
const W_ZKEY_URL = `${WITHDRAW_BASE}/withdraw_final.zkey`;
const W_VKEY_URL = `${WITHDRAW_BASE}/verification_key.json`;

export interface ClientDepositProof {
  proof: string[]; // 24-word PLONK proof
  publicSignals: string[]; // [assetId, amount, commitment]
  commitment: string;
  ownerPubKey: string;
  provingMs: number; // wall-clock proving time (the perf number to watch)
}

/** Local record of a client-owned note so its secrets can be re-derived later to spend it. */
export interface ClientNoteRecord {
  commitment: string;
  noteIndex: number; // selects the deterministic secret/nonce from the viewing key
  assetId: string;
  amount: string;
  createdAt: string;
}

const REGISTRY_KEY = "talos.clientNotes.v1";

/**
 * Persist a client-owned note locally. The spend secret is NOT stored — only the
 * `noteIndex` needed to re-derive it from the wallet-signed viewing key — so this registry
 * is not itself sensitive, but losing it just means re-scanning indices later.
 */
export function rememberClientNote(rec: Omit<ClientNoteRecord, "createdAt">): void {
  try {
    const cur = JSON.parse(localStorage.getItem(REGISTRY_KEY) ?? "[]") as ClientNoteRecord[];
    cur.push({ ...rec, createdAt: new Date().toISOString() });
    localStorage.setItem(REGISTRY_KEY, JSON.stringify(cur));
  } catch {
    /* storage unavailable — non-fatal for a testnet deposit */
  }
}

/** Read back the locally-recorded client-owned notes. */
export function loadClientNotes(): ClientNoteRecord[] {
  try {
    return JSON.parse(localStorage.getItem(REGISTRY_KEY) ?? "[]") as ClientNoteRecord[];
  } catch {
    return [];
  }
}

async function getPlonk(): Promise<PlonkBackend> {
  const snarkjs = (await import("snarkjs")) as unknown as { plonk: PlonkBackend };
  return snarkjs.plonk;
}

/** Ask the connected wallet to sign the fixed key-derivation message (free, no tx). */
async function signKeyMessage(provider: Eip1193, address: string): Promise<string> {
  const sig = await provider.request({ method: "personal_sign", params: [TALOS_KEY_MESSAGE, address] });
  return String(sig);
}

/**
 * Produce a client-side deposit binding proof for `amountBase` of `assetId`, deriving all
 * keys locally from a wallet signature. `noteIndex` selects the deterministic per-note
 * secret/nonce (use a fresh value per deposit).
 */
export async function proveDepositInBrowser(
  assetId: bigint,
  amountBase: bigint,
  noteIndex: number,
): Promise<ClientDepositProof> {
  const provider = getInjected();
  if (!provider) throw new Error("No browser wallet found — connect one first.");
  const accounts = (await provider.request({ method: "eth_accounts" })) as string[];
  const address = accounts?.[0];
  if (!address) throw new Error("No wallet account available.");

  const signature = await signKeyMessage(provider, address);
  const keys = await deriveTalosKeys(signature);
  const [secret, nonce, plonk] = await Promise.all([
    deriveNoteSecret(keys.viewingKey, noteIndex),
    deriveNoteNonce(keys.viewingKey, noteIndex),
    getPlonk(),
  ]);

  const note = { assetId, value: amountBase, sk: keys.spendingKey, secret, nonce };
  const { ownerPubKey, commitment } = depositArtifacts(poseidon, note);
  const witness = depositWitness(poseidon, note);

  const vkey = await fetch(VKEY_URL).then((r) => {
    if (!r.ok) throw new Error(`could not load verification key (${r.status})`);
    return r.json();
  });

  const t0 = performance.now();
  const { proof, publicSignals } = await provePlonk(plonk, WASM_URL, ZKEY_URL, vkey, witness);
  const provingMs = Math.round(performance.now() - t0);

  return { proof, publicSignals, commitment, ownerPubKey, provingMs };
}

export interface ClientWithdrawProof {
  proof: string[]; // 24-word PLONK proof
  root: string;
  nullifier: string;
  publicSignals: string[]; // [root, nullifier, amount, recipient, assetId]
  provingMs: number;
}

/**
 * Produce a client-side WITHDRAW proof: re-derive the note's keys locally (sk never leaves
 * the browser), build the witness from the server-provided Merkle `path`, and prove with the
 * real withdraw circuit. The server relays the resulting proof — it never needs `sk`.
 * `noteIndex` selects the note's deterministic secret/nonce (from the client note registry).
 */
export async function proveWithdrawInBrowser(params: {
  noteIndex: number;
  assetId: bigint;
  value: bigint;
  recipient: string;
  path: MerklePath;
}): Promise<ClientWithdrawProof> {
  const provider = getInjected();
  if (!provider) throw new Error("No browser wallet found — connect one first.");
  const accounts = (await provider.request({ method: "eth_accounts" })) as string[];
  const address = accounts?.[0];
  if (!address) throw new Error("No wallet account available.");

  const signature = await signKeyMessage(provider, address);
  const keys = await deriveTalosKeys(signature);
  const [secret, nonce, plonk] = await Promise.all([
    deriveNoteSecret(keys.viewingKey, params.noteIndex),
    deriveNoteNonce(keys.viewingKey, params.noteIndex),
    getPlonk(),
  ]);

  const note = { assetId: params.assetId, value: params.value, sk: keys.spendingKey, secret, nonce };
  const recipientField = BigInt(params.recipient).toString();
  const witness = withdrawWitness(poseidon, note, params.path, recipientField);

  const vkey = await fetch(W_VKEY_URL).then((r) => {
    if (!r.ok) throw new Error(`could not load withdraw verification key (${r.status})`);
    return r.json();
  });

  const t0 = performance.now();
  const { proof, publicSignals } = await provePlonk(plonk, W_WASM_URL, W_ZKEY_URL, vkey, witness);
  const provingMs = Math.round(performance.now() - t0);

  // Public signals (frozen): [root, nullifier, amount, recipient, assetId].
  if (publicSignals.length !== 5) throw new Error(`unexpected withdraw public-signal count: ${publicSignals.length}`);
  return { proof, root: publicSignals[0]!, nullifier: publicSignals[1]!, publicSignals, provingMs };
}
