// Shared ZK helpers for Talos circuit tooling (test/dev only).
//
// Poseidon here is circomlibjs' Poseidon — the SAME constants as circomlib's circom
// templates and the poseidon_gencontract Solidity contract — so in-circuit,
// off-chain, and on-chain hashes agree. All arithmetic uses BigInt over BN254.

import { createRequire } from "module";
import { fileURLToPath } from "url";
import path from "path";

const require = createRequire(import.meta.url);
const { buildPoseidon, poseidonContract } = require("circomlibjs");

export const require_ = require;

// --- Frozen protocol constants (mirror contracts/src/TalosTypes.sol) ---
export const FIELD_SIZE =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;
export const ZERO_VALUE =
  0x00690d5549b641a93200f57d5dff1c979ffbb084c3b78d4bf51ed712f2dd431fn;
export const MERKLE_DEPTH = 20;
export const ASSET_ID = 1n;

export const ROOT = path.resolve(fileURLToPath(import.meta.url), "../../../..");

let _poseidon = null;
export async function getPoseidon() {
  if (!_poseidon) _poseidon = await buildPoseidon();
  return _poseidon;
}

/** Poseidon over an array of BigInt field elements → BigInt. */
export async function poseidon(inputs) {
  const p = await getPoseidon();
  return p.F.toObject(p(inputs.map((x) => BigInt(x))));
}

/** circomlibjs-generated Poseidon(2) contract (bytecode + ABI) for on-chain use. */
export function poseidonT3Artifact() {
  return {
    bytecode: poseidonContract.createCode(2),
    abi: poseidonContract.generateABI(2),
  };
}

// --- Note model (mirrors the frozen commitment/nullifier construction) ---
// spending key sk (private) → ownerPubKey = Poseidon(sk); nullifierSecret = sk.

export async function ownerPubKey(sk) {
  return poseidon([sk]);
}

/** commitment = Poseidon(assetId, value, ownerPubKey, secret, nonce). */
export async function commitmentOf(note) {
  const pk = await ownerPubKey(note.sk);
  return poseidon([note.assetId, note.value, pk, note.secret, note.nonce]);
}

/** nullifier = Poseidon(sk, secret). */
export async function nullifierOf(note) {
  return poseidon([note.sk, note.secret]);
}

/** Commitment for an output note given an owner PUBLIC key (owner may differ). */
export async function commitmentFromPub(assetId, value, pub, secret, nonce) {
  return poseidon([assetId, value, pub, secret, nonce]);
}

/**
 * Incremental, fixed-depth Merkle tree that reproduces MerkleTreeLib exactly:
 * same ZERO_VALUE, same Poseidon(2), same append order. Roots therefore match the
 * on-chain pool after depositing the same commitments in the same order.
 */
export class MerkleTree {
  constructor(depth, zeros) {
    this.depth = depth;
    this.zeros = zeros; // zeros[i] = empty-subtree root at level i
    this.leaves = [];
  }

  static async build(depth = MERKLE_DEPTH, zeroValue = ZERO_VALUE) {
    const zeros = [zeroValue];
    for (let i = 1; i <= depth; i++) {
      zeros.push(await poseidon([zeros[i - 1], zeros[i - 1]]));
    }
    return new MerkleTree(depth, zeros);
  }

  insert(leaf) {
    this.leaves.push(BigInt(leaf));
    return this.leaves.length - 1;
  }

  async proof(index) {
    let level = this.leaves.slice();
    let idx = index;
    const pathElements = [];
    const pathIndices = [];
    for (let d = 0; d < this.depth; d++) {
      const isRight = idx % 2;
      const pairIndex = isRight ? idx - 1 : idx + 1;
      const sibling = pairIndex < level.length ? level[pairIndex] : this.zeros[d];
      pathElements.push(sibling);
      pathIndices.push(isRight);

      const next = [];
      for (let i = 0; i < level.length; i += 2) {
        const left = level[i];
        const right = i + 1 < level.length ? level[i + 1] : this.zeros[d];
        next.push(await poseidon([left, right]));
      }
      level = next.length ? next : [this.zeros[d + 1]];
      idx = Math.floor(idx / 2);
    }
    return { root: level[0], pathElements, pathIndices };
  }

  async root() {
    if (this.leaves.length === 0) {
      return poseidon([this.zeros[this.depth - 1], this.zeros[this.depth - 1]]);
    }
    return (await this.proof(this.leaves.length - 1)).root;
  }
}
