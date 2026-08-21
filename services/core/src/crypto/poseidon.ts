import { buildPoseidon, type Poseidon } from "circomlibjs";

/**
 * Poseidon + note derivation, identical to the Phase 3 circuits and the on-chain
 * Poseidon(2) contract. This is the ONE hash of the protocol — never substitute it.
 * Everything is BigInt over BN254.
 */

export const FIELD_SIZE =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;
export const ZERO_VALUE = 0x00690d5549b641a93200f57d5dff1c979ffbb084c3b78d4bf51ed712f2dd431fn;
export const MERKLE_DEPTH = 20;
export const ROOT_HISTORY_SIZE = 30;
/** The single supported test asset id (frozen protocol constant). */
export const ASSET_ID = 1n;
/** Maximum note value (2^128 - 1). */
export const MAX_VALUE = (1n << 128n) - 1n;

let poseidonInstance: Poseidon | null = null;
export async function getPoseidon(): Promise<Poseidon> {
  if (!poseidonInstance) poseidonInstance = await buildPoseidon();
  return poseidonInstance;
}

export async function poseidon(inputs: (bigint | number | string)[]): Promise<bigint> {
  const p = await getPoseidon();
  return p.F.toObject(p(inputs.map((x) => BigInt(x))));
}

export function isFieldElement(x: bigint): boolean {
  return x >= 0n && x < FIELD_SIZE;
}

// --- Note derivation (Phase 3 key model) ---
// sk = spending key; ownerPubKey = Poseidon(sk); nullifierSecret = sk.

export async function deriveOwnerPubKey(sk: bigint): Promise<bigint> {
  return poseidon([sk]);
}

export async function deriveCommitment(
  assetId: bigint,
  value: bigint,
  ownerPubKey: bigint,
  secret: bigint,
  nonce: bigint,
): Promise<bigint> {
  return poseidon([assetId, value, ownerPubKey, secret, nonce]);
}

export async function deriveNullifier(sk: bigint, secret: bigint): Promise<bigint> {
  return poseidon([sk, secret]);
}

/**
 * Fixed-depth incremental Merkle tree that reproduces MerkleTreeLib exactly (same
 * ZERO_VALUE, same Poseidon(2), same append order), so the root computed here equals
 * the on-chain pool root after inserting the same commitments in the same order.
 */
export class MerkleTree {
  private constructor(
    readonly depth: number,
    private readonly zeros: bigint[],
    private readonly leaves: bigint[],
  ) {}

  static async create(depth = MERKLE_DEPTH, zeroValue = ZERO_VALUE): Promise<MerkleTree> {
    const zeros: bigint[] = [zeroValue];
    for (let i = 1; i <= depth; i++) zeros.push(await poseidon([zeros[i - 1]!, zeros[i - 1]!]));
    return new MerkleTree(depth, zeros, []);
  }

  get size(): number {
    return this.leaves.length;
  }

  insert(leaf: bigint): number {
    this.leaves.push(leaf);
    return this.leaves.length - 1;
  }

  indexOf(leaf: bigint): number {
    return this.leaves.findIndex((l) => l === leaf);
  }

  async proof(index: number): Promise<{ root: bigint; pathElements: bigint[]; pathIndices: number[] }> {
    let level = this.leaves.slice();
    let idx = index;
    const pathElements: bigint[] = [];
    const pathIndices: number[] = [];
    for (let d = 0; d < this.depth; d++) {
      const isRight = idx % 2;
      const pairIndex = isRight ? idx - 1 : idx + 1;
      const sibling = pairIndex < level.length ? level[pairIndex]! : this.zeros[d]!;
      pathElements.push(sibling);
      pathIndices.push(isRight);

      const next: bigint[] = [];
      for (let i = 0; i < level.length; i += 2) {
        const left = level[i]!;
        const right = i + 1 < level.length ? level[i + 1]! : this.zeros[d]!;
        next.push(await poseidon([left, right]));
      }
      level = next.length ? next : [this.zeros[d + 1]!];
      idx = Math.floor(idx / 2);
    }
    return { root: level[0]!, pathElements, pathIndices };
  }

  async root(): Promise<bigint> {
    if (this.leaves.length === 0) return poseidon([this.zeros[this.depth - 1]!, this.zeros[this.depth - 1]!]);
    return (await this.proof(this.leaves.length - 1)).root;
  }
}
