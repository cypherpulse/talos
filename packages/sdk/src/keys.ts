/**
 * Talos key derivation (non-custodial). Derives the whole key tree deterministically from
 * a single wallet signature, so the holder backs up nothing extra and no secret is ever
 * transmitted. Isomorphic: uses only Web Crypto (`globalThis.crypto.subtle`, available in
 * Node 18+ and browsers) + BigInt — zero dependencies.
 *
 *   masterSeed = SHA256("Talos/masterseed/v1" ‖ signature)
 *   sk (spend) = reduce(SHA256(masterSeed ‖ "Talos/spend/v1"))
 *   vk (view)  = reduce(SHA256(masterSeed ‖ "Talos/view/v1"))
 *   secret(i)  = reduce(SHA256(vk32 ‖ "Talos/secret/v1" ‖ i))
 *   nonce(i)   = reduce(SHA256(vk32 ‖ "Talos/nonce/v1"  ‖ i))
 */

/** BN254 scalar field modulus `r`. */
export const FIELD_SIZE =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

/** The fixed message the wallet signs to unlock the key tree (free; sends no transaction). */
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

function fieldToBytes32(x: bigint): Uint8Array {
  const out = new Uint8Array(32);
  let v = x;
  for (let i = 31; i >= 0; i--) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return out;
}

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

function toFieldNonzero(bytes: Uint8Array): bigint {
  let x = 0n;
  for (const b of bytes) x = (x << 8n) | BigInt(b);
  return (x % (FIELD_SIZE - 1n)) + 1n;
}

/** The key tree derived from one wallet signature. `spendingKey` is spend authority. */
export interface TalosKeys {
  masterSeed: Uint8Array;
  spendingKey: bigint;
  viewingKey: bigint;
}

export async function masterSeedFromSignature(signatureHex: string): Promise<Uint8Array> {
  const sig = hexToBytes(signatureHex);
  if (sig.length < 32) throw new Error("signature too short to be a secure seed");
  return sha256(concatBytes(te.encode("Talos/masterseed/v1"), sig));
}

export async function deriveSpendingKey(masterSeed: Uint8Array): Promise<bigint> {
  return toFieldNonzero(await sha256(concatBytes(masterSeed, te.encode("Talos/spend/v1"))));
}

export async function deriveViewingKey(masterSeed: Uint8Array): Promise<bigint> {
  return toFieldNonzero(await sha256(concatBytes(masterSeed, te.encode("Talos/view/v1"))));
}

export async function deriveNoteSecret(viewingKey: bigint, index: number): Promise<bigint> {
  return toFieldNonzero(
    await sha256(concatBytes(fieldToBytes32(viewingKey), te.encode("Talos/secret/v1"), indexToBytes8(index))),
  );
}

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

/** Human-facing key encoding: `tpub…` (share to receive) / `tsec…` (secret). */
const toKey = (prefix: string, decimal: string | bigint): string =>
  prefix + BigInt(decimal).toString(16).padStart(64, "0");
export const encodePub = (decimal: string | bigint): string => toKey("tpub", decimal);
export const encodeSec = (decimal: string | bigint): string => toKey("tsec", decimal);

/** Accept a `tpub…`/`tsec…` (or a raw decimal) and return the field-element decimal string. */
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
  return /^\d{6,}$/.test(s) ? s : null;
}
