import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { groth16 } from "snarkjs";
import type { Groth16Proof, OperationType, ProofPackage } from "../domain/types.js";
import { ProofGenerationFailed, ProofValidationFailed } from "../errors/index.js";
import type { Logger } from "../observability/logger.js";

/** Frozen public-signal counts per circuit (Phase 3 §17). */
const PUBLIC_SIGNAL_COUNT: Record<string, number> = {
  deposit: 3,
  transfer: 4,
  split: 4,
  merge: 4,
  withdraw: 5,
};

function circuitName(op: OperationType): string {
  return op.toLowerCase();
}

/**
 * ProofService (Phase 4 §16). Generates REAL Groth16 proofs with snarkjs using the
 * Phase 3 artifacts, self-verifies every proof off-chain, and returns a validated
 * {ProofPackage}. No mock proofs, ever. Private witness inputs stay in memory and are
 * never logged.
 */
export class ProofService {
  constructor(
    private readonly artifactsDir: string,
    private readonly logger: Logger,
  ) {}

  private paths(circuit: string): { wasm: string; zkey: string; vkey: string } {
    const base = join(this.artifactsDir, circuit);
    return {
      wasm: join(base, `${circuit}_js`, `${circuit}.wasm`),
      zkey: join(base, `${circuit}_final.zkey`),
      vkey: join(base, "verification_key.json"),
    };
  }

  /** Assert the Phase 3 artifacts exist for every circuit (used by /ready). */
  artifactsPresent(): boolean {
    return Object.keys(PUBLIC_SIGNAL_COUNT).every((c) => {
      const p = this.paths(c);
      return existsSync(p.wasm) && existsSync(p.zkey) && existsSync(p.vkey);
    });
  }

  async prove(op: OperationType, input: Record<string, unknown>): Promise<ProofPackage> {
    const circuit = circuitName(op);
    const { wasm, zkey, vkey } = this.paths(circuit);

    let proofRaw;
    let publicSignals: string[];
    try {
      const out = await groth16.fullProve(input, wasm, zkey);
      proofRaw = out.proof;
      publicSignals = out.publicSignals;
    } catch (e) {
      throw ProofGenerationFailed(`witness/proof generation failed for ${circuit}`, { cause: String(e) });
    }

    // Self-verify off-chain before anything else touches the proof.
    const vk = JSON.parse(readFileSync(vkey, "utf8"));
    const ok = await groth16.verify(vk, publicSignals, proofRaw);
    if (!ok) throw ProofGenerationFailed(`snarkjs verification failed for ${circuit}`);

    const expected = PUBLIC_SIGNAL_COUNT[circuit]!;
    if (publicSignals.length !== expected) {
      throw ProofValidationFailed(`unexpected public-signal count for ${circuit}`, {
        expected,
        got: publicSignals.length,
      });
    }

    const proof = await this.toSolidityProof(proofRaw, publicSignals);
    this.logger.info("proof generated", { circuit, publicSignalCount: publicSignals.length });

    return {
      operation: op,
      circuit,
      proof,
      publicSignals,
      verificationKeyId: `${circuit}:groth16:v1`,
      generatedAt: new Date().toISOString(),
    };
  }

  private async toSolidityProof(proofRaw: unknown, publicSignals: string[]): Promise<Groth16Proof> {
    const calldata = await groth16.exportSolidityCallData(proofRaw as never, publicSignals);
    const [a, b, c] = JSON.parse(`[${calldata}]`) as [
      [string, string],
      [[string, string], [string, string]],
      [string, string],
      string[],
    ];
    return { a, b, c };
  }
}

export { PUBLIC_SIGNAL_COUNT };
