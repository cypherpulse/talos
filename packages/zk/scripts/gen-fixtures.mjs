// Generate real Groth16 proof fixtures for the Solidity end-to-end tests.
//
// For each scenario we build the note(s), reproduce the on-chain Merkle state, prove
// the circuit, verify with snarkjs, and write a PUBLIC-ONLY fixture (proof + public
// signals + on-chain call args + the commitments to deposit first). Private witness
// values (sk, secret, nonce, hidden note values) are NEVER written to fixtures.

import fs from "fs";
import os from "os";
import path from "path";
import {
  ROOT,
  ASSET_ID,
  require_,
  poseidon,
  ownerPubKey,
  commitmentOf,
  nullifierOf,
  commitmentFromPub,
  MerkleTree,
} from "./lib.mjs";

const snarkjs = require_("snarkjs");
const BUILD = path.join(ROOT, "circuits", "build");
const FIX = path.join(ROOT, "contracts", "test", "fixtures");

const S = (x) => x.toString(); // decimal (for circom witness inputs)
const H = (x) => "0x" + BigInt(x).toString(16); // hex (for robust Solidity JSON reads)
const HA = (arr) => arr.map(H); // hex array
const pubHex = (signals) => signals.map(H);
const wasm = (n) => path.join(BUILD, n, `${n}_js`, `${n}.wasm`);
const zkey = (n) => path.join(BUILD, n, `${n}_final.zkey`);
const vkeyOf = (n) => JSON.parse(fs.readFileSync(path.join(BUILD, n, "verification_key.json")));

// spending keys (synthetic, non-secret test values)
const SK_A = 1001n;
const SK_B = 2002n;
const RECIPIENT = "0x000000000000000000000000000000000000B0B1";

async function prove(name, input) {
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, wasm(name), zkey(name));
  const ok = await snarkjs.groth16.verify(vkeyOf(name), publicSignals, proof);
  if (!ok) throw new Error(`${name}: snarkjs verification FAILED`);
  const calldata = await snarkjs.groth16.exportSolidityCallData(proof, publicSignals);
  const [a, b, c, pub] = JSON.parse(`[${calldata}]`);
  return { a, b, c, pub, publicSignals, ok };
}

function writeFixture(name, obj) {
  fs.mkdirSync(FIX, { recursive: true });
  fs.writeFileSync(path.join(FIX, `${name}.json`), JSON.stringify(obj, null, 2) + "\n");
  console.log(`  wrote contracts/test/fixtures/${name}.json (snarkjs verify: OK)`);
}

async function pad(mkProof) {
  return { pe: mkProof.pathElements.map(S), pi: mkProof.pathIndices.map(S) };
}

async function main() {
  const pubA = await ownerPubKey(SK_A);
  const pubB = await ownerPubKey(SK_B);

  // ---------------------------------------------------------------- deposit
  {
    const note = { assetId: ASSET_ID, value: 100n, sk: SK_A, secret: 11n, nonce: 12n };
    const commitment = await commitmentOf(note);
    const r = await prove("deposit", {
      assetId: S(note.assetId),
      amount: S(note.value),
      commitment: S(commitment),
      ownerPubKey: S(pubA),
      secret: S(note.secret),
      nonce: S(note.nonce),
    });
    writeFixture("deposit", {
      op: "deposit",
      assetId: H(ASSET_ID),
      amount: H(note.value),
      commitment: H(commitment),
      proof: { a: r.a, b: r.b, c: r.c },
      publicSignals: pubHex(r.publicSignals),
    });
  }

  // ------------------------------------------------------------------ split
  {
    const input = { assetId: ASSET_ID, value: 100n, sk: SK_A, secret: 21n, nonce: 22n };
    const inC = await commitmentOf(input);
    const tree = await MerkleTree.build();
    tree.insert(inC);
    const mk = await tree.proof(0);
    const { pe, pi } = await pad(mk);
    const nullifier = await nullifierOf(input);
    const out1 = await commitmentFromPub(ASSET_ID, 60n, pubA, 61n, 62n);
    const out2 = await commitmentFromPub(ASSET_ID, 40n, pubA, 71n, 72n);
    const r = await prove("split", {
      root: S(mk.root),
      nullifier: S(nullifier),
      outCommitment1: S(out1),
      outCommitment2: S(out2),
      inAssetId: S(ASSET_ID),
      inValue: S(input.value),
      inSk: S(SK_A),
      inSecret: S(input.secret),
      inNonce: S(input.nonce),
      pathElements: pe,
      pathIndices: pi,
      out1Value: "60",
      out1Secret: "61",
      out1Nonce: "62",
      out2Value: "40",
      out2Secret: "71",
      out2Nonce: "72",
    });
    writeFixture("split", {
      op: "split",
      depositCommitments: HA([inC]),
      depositAmounts: HA([100n]),
      root: H(mk.root),
      nullifier: H(nullifier),
      outCommitment1: H(out1),
      outCommitment2: H(out2),
      proof: { a: r.a, b: r.b, c: r.c },
      publicSignals: pubHex(r.publicSignals),
    });
  }

  // ------------------------------------------------------------------ merge
  {
    const in1 = { assetId: ASSET_ID, value: 60n, sk: SK_A, secret: 31n, nonce: 32n };
    const in2 = { assetId: ASSET_ID, value: 40n, sk: SK_A, secret: 41n, nonce: 42n };
    const c1 = await commitmentOf(in1);
    const c2 = await commitmentOf(in2);
    const tree = await MerkleTree.build();
    tree.insert(c1);
    tree.insert(c2);
    const mk1 = await tree.proof(0);
    const mk2 = await tree.proof(1);
    const n1 = await nullifierOf(in1);
    const n2 = await nullifierOf(in2);
    const outC = await commitmentFromPub(ASSET_ID, 100n, pubA, 51n, 52n);
    const p1 = await pad(mk1);
    const p2 = await pad(mk2);
    const r = await prove("merge", {
      root: S(mk1.root),
      nullifier1: S(n1),
      nullifier2: S(n2),
      outCommitment: S(outC),
      in1AssetId: S(ASSET_ID),
      in1Value: "60",
      in1Sk: S(SK_A),
      in1Secret: "31",
      in1Nonce: "32",
      path1Elements: p1.pe,
      path1Indices: p1.pi,
      in2AssetId: S(ASSET_ID),
      in2Value: "40",
      in2Sk: S(SK_A),
      in2Secret: "41",
      in2Nonce: "42",
      path2Elements: p2.pe,
      path2Indices: p2.pi,
      outOwnerPubKey: S(pubA),
      outSecret: "51",
      outNonce: "52",
    });
    writeFixture("merge", {
      op: "merge",
      depositCommitments: HA([c1, c2]),
      depositAmounts: HA([60n, 40n]),
      root: H(mk1.root),
      nullifier1: H(n1),
      nullifier2: H(n2),
      outCommitment: H(outC),
      proof: { a: r.a, b: r.b, c: r.c },
      publicSignals: pubHex(r.publicSignals),
    });
  }

  // --------------------------------------------------------------- transfer
  {
    const input = { assetId: ASSET_ID, value: 100n, sk: SK_A, secret: 81n, nonce: 82n };
    const inC = await commitmentOf(input);
    const tree = await MerkleTree.build();
    tree.insert(inC);
    const mk = await tree.proof(0);
    const { pe, pi } = await pad(mk);
    const nullifier = await nullifierOf(input);
    // out1 -> owner B (different owner), out2 -> owner A
    const out1 = await commitmentFromPub(ASSET_ID, 70n, pubB, 91n, 92n);
    const out2 = await commitmentFromPub(ASSET_ID, 30n, pubA, 93n, 94n);
    const r = await prove("transfer", {
      root: S(mk.root),
      nullifier: S(nullifier),
      outCommitment1: S(out1),
      outCommitment2: S(out2),
      inAssetId: S(ASSET_ID),
      inValue: "100",
      inSk: S(SK_A),
      inSecret: "81",
      inNonce: "82",
      pathElements: pe,
      pathIndices: pi,
      out1OwnerPubKey: S(pubB),
      out1Value: "70",
      out1Secret: "91",
      out1Nonce: "92",
      out2OwnerPubKey: S(pubA),
      out2Value: "30",
      out2Secret: "93",
      out2Nonce: "94",
    });
    writeFixture("transfer", {
      op: "transfer",
      depositCommitments: HA([inC]),
      depositAmounts: HA([100n]),
      root: H(mk.root),
      nullifier: H(nullifier),
      outCommitment1: H(out1),
      outCommitment2: H(out2),
      proof: { a: r.a, b: r.b, c: r.c },
      publicSignals: pubHex(r.publicSignals),
    });
  }

  // --------------------------------------------------------------- withdraw
  {
    const input = { assetId: ASSET_ID, value: 100n, sk: SK_A, secret: 201n, nonce: 202n };
    const inC = await commitmentOf(input);
    const tree = await MerkleTree.build();
    tree.insert(inC);
    const mk = await tree.proof(0);
    const { pe, pi } = await pad(mk);
    const nullifier = await nullifierOf(input);
    const recipientNum = BigInt(RECIPIENT);
    const r = await prove("withdraw", {
      root: S(mk.root),
      nullifier: S(nullifier),
      amount: "100",
      recipient: S(recipientNum),
      assetId: S(ASSET_ID),
      inValue: "100",
      inSk: S(SK_A),
      inSecret: "201",
      inNonce: "202",
      pathElements: pe,
      pathIndices: pi,
    });
    writeFixture("withdraw", {
      op: "withdraw",
      depositCommitments: HA([inC]),
      depositAmounts: HA([100n]),
      root: H(mk.root),
      nullifier: H(nullifier),
      amount: H(100n),
      recipient: RECIPIENT,
      assetId: H(ASSET_ID),
      proof: { a: r.a, b: r.b, c: r.c },
      publicSignals: pubHex(r.publicSignals),
    });
  }

  console.log("\nAll fixtures generated and snarkjs-verified.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
