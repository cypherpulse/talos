/**
 * Client-side PLONK proving (B4 — step 3 foundation).
 *
 * Runs snarkjs PLONK proving in the browser so witness generation and proving happen on
 * the client; the server only ever sees the public proof + signals, never `sk`/`secret`.
 * snarkjs is INJECTED (not imported) to keep this module dependency-free and unit-testable
 * in Node — the browser passes its bundled snarkjs, Node tests pass the root one. In the
 * browser, `wasmUrl`/`zkeyUrl` are HTTP URLs snarkjs fetches; in Node they are file paths.
 *
 * The 24-word proof encoding and the "two adjacent arrays with no comma" quirk of PLONK's
 * exportSolidityCallData match the Core Server (`proofs/service.ts`) and the on-chain
 * verifier exactly, so a client-made proof verifies identically to a server-made one.
 */

/** The subset of snarkjs' `plonk` API this module needs. */
export interface PlonkBackend {
  fullProve(
    input: Record<string, unknown>,
    wasm: string,
    zkey: string,
  ): Promise<{ proof: unknown; publicSignals: string[] }>;
  exportSolidityCallData(proof: unknown, publicSignals: string[]): Promise<string>;
  verify(vkey: unknown, publicSignals: string[], proof: unknown): Promise<boolean>;
}

export interface PlonkProofResult {
  /** Flat 24-word PLONK proof for the pool's Solidity verifier / hand-encoded calldata. */
  proof: string[];
  publicSignals: string[];
}

/**
 * Parse PLONK's `exportSolidityCallData` output. It emits two adjacent arrays
 * `[..24..][..N..]` with NO separating comma; splice one in so it parses as
 * `[proof, publicSignals]`.
 */
export function parsePlonkCalldata(calldata: string): { proof: string[]; publicSignals: string[] } {
  const [proof, publicSignals] = JSON.parse(`[${calldata.replace(/\]\s*\[/, "],[")}]`) as [
    string[],
    string[],
  ];
  if (!Array.isArray(proof) || proof.length !== 24) {
    throw new Error(`expected a 24-word PLONK proof, got ${proof?.length}`);
  }
  return { proof, publicSignals };
}

/**
 * Generate + self-verify a PLONK proof for `input`, returning the flat 24-word proof.
 * @param plonk   snarkjs `plonk` (browser bundle or root install).
 * @param wasmUrl circuit witness-generator wasm (HTTP URL in browser, file path in Node).
 * @param zkeyUrl circuit proving key (HTTP URL in browser, file path in Node).
 * @param vkey    verification key JSON (object) for the mandatory off-chain self-check.
 */
export async function provePlonk(
  plonk: PlonkBackend,
  wasmUrl: string,
  zkeyUrl: string,
  vkey: unknown,
  input: Record<string, unknown>,
): Promise<PlonkProofResult> {
  const { proof: raw, publicSignals } = await plonk.fullProve(input, wasmUrl, zkeyUrl);

  // Self-verify off-chain before the proof touches the wire — never submit an invalid proof.
  if (!(await plonk.verify(vkey, publicSignals, raw))) {
    throw new Error("client PLONK self-verification failed");
  }

  const { proof } = parsePlonkCalldata(await plonk.exportSolidityCallData(raw, publicSignals));
  return { proof, publicSignals };
}
