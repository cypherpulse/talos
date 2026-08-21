// Generate deterministic Poseidon/commitment/nullifier/Merkle test vectors.
//
// These are consumed by BOTH circom (implicitly, via proofs) and Solidity
// (contracts/test/PoseidonVectors.t.sol) to prove the in-circuit, off-chain, and
// on-chain Poseidon implementations agree. If they ever disagree, STOP.

import fs from "fs";
import path from "path";
import {
  ROOT,
  ZERO_VALUE,
  ASSET_ID,
  poseidon,
  ownerPubKey,
  commitmentOf,
  nullifierOf,
  MerkleTree,
} from "./lib.mjs";

function s(x) {
  // Hex so Solidity's stdJson.readUint parses reliably; still human-inspectable.
  return "0x" + BigInt(x).toString(16);
}

async function main() {
  // A deterministic synthetic note (clearly non-secret test values).
  const note = { assetId: ASSET_ID, value: 100n, sk: 111n, secret: 222n, nonce: 333n };
  const pub = await ownerPubKey(note.sk);
  const commitment = await commitmentOf(note);
  const nullifier = await nullifierOf(note);

  // Merkle: a known parent and a small tree root over 3 leaves.
  const a = 12345n;
  const b = 67890n;
  const parent = await poseidon([a, b]);

  const tree = await MerkleTree.build();
  const leaves = [commitment, 4444n, 5555n];
  for (const l of leaves) tree.insert(l);
  const root = await tree.root();
  const proof0 = await tree.proof(0);

  const vectors = {
    description:
      "Talos Poseidon/commitment/nullifier/Merkle test vectors (BN254). Synthetic values.",
    field_size:
      "21888242871839275222246405745257275088548364400416034343698204186575808495617",
    zero_value: s(ZERO_VALUE),
    poseidon2: { inputs: [s(a), s(b)], output: s(parent) },
    ownerPubKey: { sk: s(note.sk), output: s(pub) },
    commitment: {
      note: {
        assetId: s(note.assetId),
        value: s(note.value),
        ownerPubKey: s(pub),
        secret: s(note.secret),
        nonce: s(note.nonce),
      },
      output: s(commitment),
    },
    nullifier: { nullifierSecret: s(note.sk), secret: s(note.secret), output: s(nullifier) },
    merkle: {
      depth: 20,
      leaves: leaves.map(s),
      root: s(root),
      proofForLeaf0: {
        leaf: s(leaves[0]),
        pathElements: proof0.pathElements.map(s),
        pathIndices: proof0.pathIndices.map(s),
      },
    },
  };

  const outDir = path.join(ROOT, "circuits", "test-vectors");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, "vectors.json");
  fs.writeFileSync(outFile, JSON.stringify(vectors, null, 2) + "\n");
  console.log("wrote", path.relative(ROOT, outFile));
  console.log("  poseidon2(12345,67890) =", s(parent));
  console.log("  commitment             =", s(commitment));
  console.log("  nullifier              =", s(nullifier));
  console.log("  merkle root (3 leaves) =", s(root));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
