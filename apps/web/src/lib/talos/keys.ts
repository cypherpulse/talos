/**
 * Talos identity keys for private transfers.
 *
 * On the wire a Talos owner key is a BN254 field element (a big decimal). For humans we
 * present it as a prefixed, fixed-width hex string that reads like a real key:
 *   - public key  → `tpub…`  (share this so others can send you private notes)
 *   - spending key → `tsec…` (keep secret — needed to spend notes sent to you)
 * Encoding is reversible so the transfer form can accept a `tpub…` and recover the
 * field element the Core Server expects.
 */

export interface TalosIdentity {
  /** Field-element decimal strings (as the Core Server uses them). */
  ownerPublicKey: string;
  spendingKey: string;
}

const STORAGE_KEY = "talos.identity";

const toKey = (prefix: string, decimal: string): string =>
  prefix + BigInt(decimal).toString(16).padStart(64, "0");

export const encodePub = (decimal: string): string => toKey("tpub", decimal);
export const encodeSec = (decimal: string): string => toKey("tsec", decimal);

/** Accept a `tpub…` (or `tsec…`, or a raw decimal) and return the field-element decimal. */
export function decodeKey(input: string): string | null {
  const s = input.trim();
  const m = s.match(/^t(?:pub|sec)([0-9a-fA-F]+)$/i);
  if (m) {
    try {
      return BigInt("0x" + m[1]).toString();
    } catch {
      return null;
    }
  }
  return /^\d{6,}$/.test(s) ? s : null; // tolerate a raw field element too
}

export function loadIdentity(): TalosIdentity | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as TalosIdentity) : null;
  } catch {
    return null;
  }
}

export function saveIdentity(identity: TalosIdentity): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
  } catch {
    /* storage unavailable — identity just won't persist this session */
  }
}

export function clearIdentity(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/*//////////////////////////////////////////////////////////////////////////////
  B4 — Non-custodial key derivation (deterministic, client-only).

  The server must never learn a note's spending secret. These helpers derive the whole
  Talos key tree ON THE CLIENT, deterministically, from a single wallet signature — so
  the user backs up nothing extra (their wallet regenerates every key) and no secret ever
  leaves the browser:

    masterSeed        = SHA256("Talos/masterseed/v1" ‖ walletSignature)
    sk (spending key) = reduce( SHA256(masterSeed ‖ "Talos/spend/v1") )  → spend authority
    vk (viewing key)  = reduce( SHA256(masterSeed ‖ "Talos/view/v1") )   → discovery only
    secret(i)         = reduce( SHA256(vk32 ‖ "Talos/secret/v1" ‖ i) )    → per-note, no storage
    nonce(i)          = reduce( SHA256(vk32 ‖ "Talos/nonce/v1"  ‖ i) )

  Spending/viewing separation: `vk` lets a wallet (or a delegated watch-only indexer)
  FIND and read notes without the power to SPEND them (which needs `sk`). `ownerPubKey =
  Poseidon(sk)` and note encryption are computed at point of use where Poseidon is
  available. Zero dependencies (Web Crypto + BigInt only): trivially auditable, runs
  identically in the browser and in Node tests.
//////////////////////////////////////////////////////////////////////////////*/

/** BN254 scalar field modulus `r`. Keys/secrets are canonical elements of GF(r). */
export const FIELD_SIZE =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

/**
 * The fixed message the wallet signs to unlock the key tree. Signing it is free and sends
 * no transaction; the signature is the ONLY entropy source, so it must be stable. Bump the
 * version suffix only with an explicit key-rotation/migration plan.
 */
export const TALOS_KEY_MESSAGE =
  "Talos key derivation v1 — sign to access your private notes. This does not send a transaction and costs no gas.";

const te = new TextEncoder();

function requireSubtle(): SubtleCrypto {
  const s = globalThis.crypto?.subtle;
  if (!s) throw new Error("Web Crypto (crypto.subtle) unavailable; cannot derive keys securely.");
  return s;
}

function hexToBytes(hex: string): Uint8Array {
  const h = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (h.length % 2 !== 0) throw new Error("odd-length hex");
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const len = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** Big-endian 32-byte encoding of a field element (for use as hash-input key material). */
function fieldToBytes32(x: bigint): Uint8Array {
  const out = new Uint8Array(32);
  let v = x;
  for (let i = 31; i >= 0; i--) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return out;
}

/** Big-endian 8-byte encoding of a non-negative index (domain-separates per-note derivations). */
function indexToBytes8(i: number): Uint8Array {
  if (!Number.isInteger(i) || i < 0) throw new Error("index must be a non-negative integer");
  const out = new Uint8Array(8);
  let v = BigInt(i);
  for (let j = 7; j >= 0; j--) {
    out[j] = Number(v & 0xffn);
    v >>= 8n;
  }
  return out;
}

async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await requireSubtle().digest("SHA-256", bytes as unknown as BufferSource));
}

/** Reduce 32 hash bytes to a canonical NONZERO field element (bias is negligible for BN254). */
function toFieldNonzero(bytes: Uint8Array): bigint {
  let x = 0n;
  for (const b of bytes) x = (x << 8n) | BigInt(b);
  return (x % (FIELD_SIZE - 1n)) + 1n;
}

/** All keys derived from one wallet signature. `spendingKey` is spend authority; guard it. */
export interface TalosKeys {
  masterSeed: Uint8Array;
  spendingKey: bigint; // sk
  viewingKey: bigint; // vk
}

/** Derive the master seed from a wallet signature (hex, 0x-prefixed or not). */
export async function masterSeedFromSignature(signatureHex: string): Promise<Uint8Array> {
  const sig = hexToBytes(signatureHex);
  if (sig.length < 32) throw new Error("signature too short to be a secure seed");
  return sha256(concatBytes(te.encode("Talos/masterseed/v1"), sig));
}

/** sk = reduce(SHA256(masterSeed ‖ "Talos/spend/v1")). */
export async function deriveSpendingKey(masterSeed: Uint8Array): Promise<bigint> {
  return toFieldNonzero(await sha256(concatBytes(masterSeed, te.encode("Talos/spend/v1"))));
}

/** vk = reduce(SHA256(masterSeed ‖ "Talos/view/v1")). Discovery only — never spend authority. */
export async function deriveViewingKey(masterSeed: Uint8Array): Promise<bigint> {
  return toFieldNonzero(await sha256(concatBytes(masterSeed, te.encode("Talos/view/v1"))));
}

/** Deterministic per-note secret from the viewing key + note index (nothing to persist). */
export async function deriveNoteSecret(viewingKey: bigint, index: number): Promise<bigint> {
  return toFieldNonzero(
    await sha256(concatBytes(fieldToBytes32(viewingKey), te.encode("Talos/secret/v1"), indexToBytes8(index))),
  );
}

/** Deterministic per-note nonce from the viewing key + note index. */
export async function deriveNoteNonce(viewingKey: bigint, index: number): Promise<bigint> {
  return toFieldNonzero(
    await sha256(concatBytes(fieldToBytes32(viewingKey), te.encode("Talos/nonce/v1"), indexToBytes8(index))),
  );
}

/** Derive the full key tree from a wallet signature over {@link TALOS_KEY_MESSAGE}. */
export async function deriveTalosKeys(signatureHex: string): Promise<TalosKeys> {
  const masterSeed = await masterSeedFromSignature(signatureHex);
  const [spendingKey, viewingKey] = await Promise.all([
    deriveSpendingKey(masterSeed),
    deriveViewingKey(masterSeed),
  ]);
  return { masterSeed, spendingKey, viewingKey };
}
