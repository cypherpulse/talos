/**
 * Client-side PLONK proving. Runs snarkjs where the SDK runs — Node (CLI/agents) or the
 * browser — so witness generation + proving happen on the client and the server only ever
 * sees the public proof. `wasm`/`zkey` are file paths in Node and HTTP URLs in the browser
 * (snarkjs accepts both). The 24-word proof encoding matches the Core Server + on-chain
 * verifier, so a client-made proof verifies identically to a server-made one.
 */
import { plonk } from "snarkjs";

export interface PlonkProofResult {
  proof: string[]; // flat 24-word PLONK proof
  publicSignals: string[];
}

/**
 * Parse snarkjs PLONK `exportSolidityCallData`, which emits two adjacent arrays
 * `[..24..][..N..]` with NO separating comma; splice one in so it parses.
 */
export function parsePlonkCalldata(calldata: string): { proof: string[]; publicSignals: string[] } {
  const [proof, publicSignals] = JSON.parse(`[${calldata.replace(/\]\s*\[/, "],[")}]`) as [string[], string[]];
  if (!Array.isArray(proof) || proof.length !== 24) {
    throw new Error(`expected a 24-word PLONK proof, got ${proof?.length}`);
  }
  return { proof, publicSignals };
}

/** Generate + self-verify a PLONK proof, returning the flat 24-word proof + public signals. */
export async function provePlonk(
  wasm: string,
  zkey: string,
  vkey: unknown,
  input: Record<string, unknown>,
): Promise<PlonkProofResult> {
  const { proof: raw, publicSignals } = await plonk.fullProve(input, wasm, zkey);
  if (!(await plonk.verify(vkey, publicSignals, raw))) {
    throw new Error("client PLONK self-verification failed");
  }
  return parsePlonkCalldata(await plonk.exportSolidityCallData(raw, publicSignals));
}
