/**
 * Key-derivation tests (B4). Run with `pnpm --filter @talos/web test:keys` (tsx).
 * No browser needed — the derivation lib is isomorphic (Web Crypto + BigInt only).
 */
import {
  deriveTalosKeys,
  deriveNoteSecret,
  deriveNoteNonce,
  deriveSpendingKey,
  masterSeedFromSignature,
  FIELD_SIZE,
  TALOS_KEY_MESSAGE,
} from "./keys";

let fail = 0;
const ok = (m: string) => console.log("  PASS:", m);
const bad = (m: string) => {
  console.error("  FAIL:", m);
  fail++;
};
const inRange = (x: bigint) => x > 0n && x < FIELD_SIZE;

const sigA = "0x" + "ab".repeat(32);
const sigB = "0x" + "cd".repeat(32);

async function main() {
  console.log("Talos key-derivation tests:\n");

  const k1 = await deriveTalosKeys(sigA);
  const k2 = await deriveTalosKeys(sigA);
  const k3 = await deriveTalosKeys(sigB);

  k1.spendingKey === k2.spendingKey && k1.viewingKey === k2.viewingKey
    ? ok("deterministic: same signature -> same keys")
    : bad("nondeterministic");
  k1.spendingKey !== k3.spendingKey
    ? ok("different signature -> different spending key")
    : bad("collision across signatures");
  k1.spendingKey !== k1.viewingKey
    ? ok("spending key != viewing key (domain separation)")
    : bad("sk == vk!");
  inRange(k1.spendingKey) && inRange(k1.viewingKey)
    ? ok("keys are canonical nonzero field elements")
    : bad("key out of field range");

  const s0 = await deriveNoteSecret(k1.viewingKey, 0);
  const s0b = await deriveNoteSecret(k1.viewingKey, 0);
  const s1 = await deriveNoteSecret(k1.viewingKey, 1);
  const n0 = await deriveNoteNonce(k1.viewingKey, 0);
  s0 === s0b ? ok("note secret deterministic per index") : bad("note secret nondeterministic");
  s0 !== s1 ? ok("note secret varies by index") : bad("note secret collides across indices");
  s0 !== n0 ? ok("secret != nonce at same index (label separation)") : bad("secret == nonce!");
  inRange(s0) && inRange(n0) ? ok("note secret/nonce in field range") : bad("note secret/nonce out of range");

  const seed = await masterSeedFromSignature(sigA);
  (await deriveSpendingKey(seed)) === k1.spendingKey
    ? ok("spending key reproducible from master seed")
    : bad("sk derivation mismatch");

  // Known-answer vectors: pin exact outputs so an accidental algorithm change is caught.
  const KAT_SK = 4901461198332064644505973284917619782542839394298022017915863869999366258500n;
  const KAT_VK = 8477227994697765362676287856872736555304984573851138735083419642406013217461n;
  k1.spendingKey === KAT_SK ? ok("KAT: spending key matches pinned vector") : bad(`KAT sk drift: ${k1.spendingKey}`);
  k1.viewingKey === KAT_VK ? ok("KAT: viewing key matches pinned vector") : bad(`KAT vk drift: ${k1.viewingKey}`);
  TALOS_KEY_MESSAGE.length > 0 ? ok("signing message present") : bad("empty signing message");

  console.log(fail === 0 ? "\nAll key-derivation tests passed." : `\n${fail} test(s) FAILED.`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
