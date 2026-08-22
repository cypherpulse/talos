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
