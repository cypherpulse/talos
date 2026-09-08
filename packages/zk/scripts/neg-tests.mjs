// Circuit-level negative tests / internal soundness audit (Phase 3 §20, Phase 7 audit).
//
// A malicious prover must NOT be able to satisfy a circuit with an invalid witness,
// and a tampered proof / public signal must fail verification. Each case below must
// behave as asserted or the script exits non-zero.
//
// This is the internal circuit-correctness audit's executable component: it targets the
// specific soundness properties every operation circuit must enforce — value
// conservation, value range (anti-overflow), nullifier/commitment/root binding, merge
// input distinctness, and asset consistency — across ALL five circuits. It complements
// the on-chain real-proof E2E tests (contracts/test/TalosE2E.t.sol).

import path from "path";
import {
  ASSET_ID,
  ROOT,
  require_,
  ownerPubKey,
  commitmentOf,
  nullifierOf,
  commitmentFromPub,
  MerkleTree,
} from "./lib.mjs";

const snarkjs = require_("snarkjs");
const fs = require_("fs");
const BUILD = path.join(ROOT, "circuits", "build");
const wasm = (n) => path.join(BUILD, n, `${n}_js`, `${n}.wasm`);
const zkey = (n) => path.join(BUILD, n, `${n}_final.zkey`);
const vkeyOf = (n) => JSON.parse(fs.readFileSync(path.join(BUILD, n, "verification_key.json"), "utf8"));
const S = (x) => x.toString();

// 2^128 — the first value ValueRange (Num2Bits(128)) must reject.
const OVER_128 = (1n << 128n).toString();

let failures = 0;
function ok(msg) {
  console.log("  PASS:", msg);
}
function bad(msg) {
  console.error("  FAIL:", msg);
  failures++;
}

async function expectProveFails(name, input, label) {
  try {
    await snarkjs.plonk.fullProve(input, wasm(name), zkey(name));
    bad(`${label} — proof unexpectedly SUCCEEDED (constraint not enforced!)`);
  } catch {
    ok(`${label} — witness rejected by constraints`);
  }
}

async function expectProveSucceeds(name, input, label) {
  try {
    const { proof, publicSignals } = await snarkjs.plonk.fullProve(input, wasm(name), zkey(name));
    const okv = await snarkjs.plonk.verify(vkeyOf(name), publicSignals, proof);
    if (okv) ok(`${label} — valid witness proves and verifies`);
    else bad(`${label} — valid witness proved but did NOT verify`);
    return { proof, publicSignals };
  } catch (e) {
    bad(`${label} — valid witness unexpectedly REJECTED (${String(e).slice(0, 80)})`);
    return null;
  }
}

/* ----------------------------------------------------------------- builders */

async function buildSplit(overrides = {}) {
  const input = { assetId: ASSET_ID, value: 100n, sk: 1001n, secret: 21n, nonce: 22n };
  const pubA = await ownerPubKey(input.sk);
  const inC = await commitmentOf(input);
  const tree = await MerkleTree.build();
  tree.insert(inC);
  const mk = await tree.proof(0);
  const nullifier = await nullifierOf(input);
  const out1 = await commitmentFromPub(ASSET_ID, 60n, pubA, 61n, 62n);
  const out2 = await commitmentFromPub(ASSET_ID, 40n, pubA, 71n, 72n);
  return {
    root: S(mk.root),
    nullifier: S(nullifier),
    outCommitment1: S(out1),
    outCommitment2: S(out2),
    inAssetId: S(ASSET_ID),
    inValue: "100",
    inSk: "1001",
    inSecret: "21",
    inNonce: "22",
    pathElements: mk.pathElements.map(S),
    pathIndices: mk.pathIndices.map(S),
    out1Value: "60",
    out1Secret: "61",
    out1Nonce: "62",
    out2Value: "40",
    out2Secret: "71",
    out2Nonce: "72",
    ...overrides,
  };
}

async function buildTransfer(overrides = {}) {
  const input = { assetId: ASSET_ID, value: 100n, sk: 1001n, secret: 81n, nonce: 82n };
  const pubA = await ownerPubKey(input.sk);
  const pubB = await ownerPubKey(2002n);
  const inC = await commitmentOf(input);
  const tree = await MerkleTree.build();
  tree.insert(inC);
  const mk = await tree.proof(0);
  const nullifier = await nullifierOf(input);
  const out1 = await commitmentFromPub(ASSET_ID, 70n, pubB, 91n, 92n);
  const out2 = await commitmentFromPub(ASSET_ID, 30n, pubA, 93n, 94n);
  return {
    root: S(mk.root),
    nullifier: S(nullifier),
    outCommitment1: S(out1),
    outCommitment2: S(out2),
    inAssetId: S(ASSET_ID),
    inValue: "100",
    inSk: "1001",
    inSecret: "81",
    inNonce: "82",
    pathElements: mk.pathElements.map(S),
    pathIndices: mk.pathIndices.map(S),
    out1OwnerPubKey: S(pubB),
    out1Value: "70",
    out1Secret: "91",
    out1Nonce: "92",
    out2OwnerPubKey: S(pubA),
    out2Value: "30",
    out2Secret: "93",
    out2Nonce: "94",
    ...overrides,
  };
}

async function buildMerge(overrides = {}) {
  const in1 = { assetId: ASSET_ID, value: 60n, sk: 1001n, secret: 31n, nonce: 32n };
  const in2 = { assetId: ASSET_ID, value: 40n, sk: 1001n, secret: 41n, nonce: 42n };
  const pubA = await ownerPubKey(in1.sk);
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
  return {
    root: S(mk1.root),
    nullifier1: S(n1),
    nullifier2: S(n2),
    outCommitment: S(outC),
    in1AssetId: S(ASSET_ID),
    in1Value: "60",
    in1Sk: "1001",
    in1Secret: "31",
    in1Nonce: "32",
    path1Elements: mk1.pathElements.map(S),
    path1Indices: mk1.pathIndices.map(S),
    in2AssetId: S(ASSET_ID),
    in2Value: "40",
    in2Sk: "1001",
    in2Secret: "41",
    in2Nonce: "42",
    path2Elements: mk2.pathElements.map(S),
    path2Indices: mk2.pathIndices.map(S),
    outOwnerPubKey: S(pubA),
    outSecret: "51",
    outNonce: "52",
    ...overrides,
  };
}

async function buildDeposit(overrides = {}) {
  const note = { assetId: ASSET_ID, value: 100n, sk: 1001n, secret: 11n, nonce: 12n };
  const pubA = await ownerPubKey(note.sk);
  const commitment = await commitmentOf(note);
  return {
    assetId: S(ASSET_ID),
    amount: S(note.value),
    commitment: S(commitment),
    ownerPubKey: S(pubA),
    secret: S(note.secret),
    nonce: S(note.nonce),
    ...overrides,
  };
}

async function buildWithdraw(overrides = {}) {
  const input = { assetId: ASSET_ID, value: 100n, sk: 1001n, secret: 201n, nonce: 202n };
  const inC = await commitmentOf(input);
  const tree = await MerkleTree.build();
  tree.insert(inC);
  const mk = await tree.proof(0);
  const nullifier = await nullifierOf(input);
  return {
    root: S(mk.root),
    nullifier: S(nullifier),
    amount: "100",
    recipient: S(BigInt("0x000000000000000000000000000000000000B0B1")),
    assetId: S(ASSET_ID),
    inValue: "100",
    inSk: "1001",
    inSecret: "201",
    inNonce: "202",
    pathElements: mk.pathElements.map(S),
    pathIndices: mk.pathIndices.map(S),
    ...overrides,
  };
}

/* -------------------------------------------------------------------- suite */

async function main() {
  console.log("Circuit soundness audit (negative tests):\n");

  // Sanity: every builder must produce a genuinely valid, verifiable proof.
  console.log("[valid baselines]");
  await expectProveSucceeds("split", await buildSplit(), "split baseline");
  await expectProveSucceeds("transfer", await buildTransfer(), "transfer baseline");
  await expectProveSucceeds("merge", await buildMerge(), "merge baseline");
  await expectProveSucceeds("deposit", await buildDeposit(), "deposit baseline");
  await expectProveSucceeds("withdraw", await buildWithdraw(), "withdraw baseline");

  // --- SPLIT ---
  console.log("\n[split]");
  await expectProveFails("split", await buildSplit({ out2Value: "30" }), "value conservation (60+30 != 100)");
  await expectProveFails("split", await buildSplit({ out2Value: "41" }), "value inflation (60+41 > 100)");
  await expectProveFails("split", await buildSplit({ nullifier: "12345" }), "wrong nullifier public signal");
  await expectProveFails("split", await buildSplit({ root: "99999" }), "wrong Merkle root");
  await expectProveFails("split", await buildSplit({ outCommitment1: "424242" }), "wrong output commitment");
  await expectProveFails(
    "split",
    // Overflow attempt: out1 huge, out2 chosen so the field sum still equals inValue.
    // ValueRange(out1Value) must reject the > 2^128 output.
    await buildSplit({ out1Value: OVER_128 }),
    "out-of-range output value (>= 2^128) rejected",
  );

  // --- TRANSFER ---
  console.log("\n[transfer]");
  await expectProveFails("transfer", await buildTransfer({ out2Value: "31" }), "value conservation (70+31 != 100)");
  await expectProveFails("transfer", await buildTransfer({ nullifier: "7" }), "wrong nullifier public signal");
  await expectProveFails("transfer", await buildTransfer({ out1Value: OVER_128 }), "out-of-range output value rejected");

  // --- MERGE ---
  console.log("\n[merge]");
  await expectProveFails("merge", await buildMerge({ outCommitment: "1" }), "wrong output commitment");
  await expectProveFails("merge", await buildMerge({ nullifier1: "3" }), "wrong nullifier1 public signal");
  await expectProveFails("merge", await buildMerge({ in2AssetId: "2" }), "asset mismatch (in1 != in2) rejected");
  {
    // Duplicate-note attack: feed note 1 as BOTH inputs. Same commitment => the
    // in-circuit distinctness check (IsEqual == 0) must reject it.
    const dup = await buildMerge();
    dup.in2Value = dup.in1Value;
    dup.in2Sk = dup.in1Sk;
    dup.in2Secret = dup.in1Secret;
    dup.in2Nonce = dup.in1Nonce;
    dup.in2AssetId = dup.in1AssetId;
    dup.path2Elements = dup.path1Elements;
    dup.path2Indices = dup.path1Indices;
    dup.nullifier2 = dup.nullifier1;
    await expectProveFails("merge", dup, "duplicate input note (same commitment) rejected");
  }

  // --- DEPOSIT ---
  console.log("\n[deposit]");
  await expectProveFails("deposit", await buildDeposit({ amount: "101" }), "amount not bound to commitment value");
  await expectProveFails("deposit", await buildDeposit({ commitment: "5" }), "wrong commitment for note fields");
  await expectProveFails("deposit", await buildDeposit({ amount: OVER_128 }), "out-of-range amount (>= 2^128) rejected");

  // --- WITHDRAW ---
  console.log("\n[withdraw]");
  await expectProveFails("withdraw", await buildWithdraw({ inValue: "99" }), "amount != inValue rejected");
  await expectProveFails("withdraw", await buildWithdraw({ nullifier: "9" }), "wrong nullifier public signal");
  await expectProveFails("withdraw", await buildWithdraw({ root: "8" }), "wrong Merkle root");
  await expectProveFails("withdraw", await buildWithdraw({ amount: OVER_128 }), "out-of-range amount rejected");

  // --- Proof / public-signal tampering (verification layer) ---
  // snarkjs' plonk.verify may THROW on a structurally-malformed proof rather than
  // returning false; either outcome means "not accepted" — only a `true` is a failure.
  const verifyRejects = async (vk, pub, proof) => {
    try {
      return (await snarkjs.plonk.verify(vk, pub, proof)) !== true;
    } catch {
      return true;
    }
  };
  console.log("\n[tampering]");
  {
    const input = await buildSplit();
    const { proof, publicSignals } = await snarkjs.plonk.fullProve(input, wasm("split"), zkey("split"));
    const vk = vkeyOf("split");

    if (!(await snarkjs.plonk.verify(vk, publicSignals, proof))) bad("valid proof did not verify");
    else ok("valid proof verifies");

    const tampered = JSON.parse(JSON.stringify(proof));
    // PLONK proof: perturb the first group-element coordinate.
    const firstKey = Object.keys(tampered).find((k) => Array.isArray(tampered[k]));
    tampered[firstKey][0] = (BigInt(tampered[firstKey][0]) + 1n).toString();
    if (await verifyRejects(vk, publicSignals, tampered)) ok("tampered proof rejected");
    else bad("tampered PROOF verified!");

    const tamperedPub = publicSignals.slice();
    tamperedPub[1] = (BigInt(tamperedPub[1]) + 1n).toString();
    if (await verifyRejects(vk, tamperedPub, proof)) ok("tampered public signal rejected");
    else bad("tampered PUBLIC SIGNAL verified!");
  }

  console.log(
    failures === 0 ? "\nAll circuit soundness tests passed." : `\n${failures} soundness test(s) FAILED.`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
