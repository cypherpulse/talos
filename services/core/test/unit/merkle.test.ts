import { describe, expect, it } from "vitest";
import { MerkleTree, poseidon, deriveCommitment, deriveNullifier, deriveOwnerPubKey } from "../../src/crypto/poseidon.js";

describe("MerkleTree (mirrors MerkleTreeLib)", () => {
  it("recomputes the root from a leaf + authentication path", async () => {
    const tree = await MerkleTree.create();
    const leaves = [111n, 222n, 333n, 444n];
    for (const l of leaves) tree.insert(l);

    const { root, pathElements, pathIndices } = await tree.proof(2);
    // Fold the leaf up using the path, exactly like the circuit / contract.
    let cur = leaves[2]!;
    for (let i = 0; i < pathElements.length; i++) {
      cur = pathIndices[i] === 0 ? await poseidon([cur, pathElements[i]!]) : await poseidon([pathElements[i]!, cur]);
    }
    expect(cur).toBe(root);
    expect(root).toBe(await tree.root());
  });

  it("changes root on insert and is deterministic", async () => {
    const t1 = await MerkleTree.create();
    const t2 = await MerkleTree.create();
    t1.insert(999n);
    t2.insert(999n);
    expect(await t1.root()).toBe(await t2.root());
    t2.insert(1000n);
    expect(await t2.root()).not.toBe(await t1.root());
  });
});

describe("note derivation", () => {
  it("derives a stable commitment and nullifier", async () => {
    const sk = 1001n;
    const pub = await deriveOwnerPubKey(sk);
    const commitment = await deriveCommitment(1n, 100n, pub, 11n, 12n);
    const nullifier = await deriveNullifier(sk, 11n);
    // Deterministic: same inputs → same outputs.
    expect(await deriveCommitment(1n, 100n, pub, 11n, 12n)).toBe(commitment);
    expect(await deriveNullifier(sk, 11n)).toBe(nullifier);
    expect(commitment).not.toBe(nullifier);
  });
});
