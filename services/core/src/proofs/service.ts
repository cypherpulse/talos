import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { plonk } from "snarkjs";
import type { OperationType, PlonkProof, ProofPackage } from "../domain/types.js";
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
 * ProofService (Phase 4 §16). Generates REAL PLONK proofs with snarkjs using the
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
      const out = await plonk.fullProve(input, wasm, zkey);
      proofRaw = out.proof;
      publicSignals = out.publicSignals;
    } catch (e) {
      throw ProofGenerationFailed(`witness/proof generation failed for ${circuit}`, { cause: String(e) });
    }

    // Self-verify off-chain before anything else touches the proof.
    const vk = JSON.parse(readFileSync(vkey, "utf8"));
    const ok = await plonk.verify(vk, publicSignals, proofRaw);
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
      verificationKeyId: `${circuit}:plonk:v1`,
      generatedAt: new Date().toISOString(),
    };
  }

  private async toSolidityProof(proofRaw: unknown, publicSignals: string[]): Promise<PlonkProof> {
    // PLONK's exportSolidityCallData emits two adjacent arrays "[..24..][..N..]" with no
    // separating comma; splice one in so it parses as [proof, publicSignals].
    const calldata = await plonk.exportSolidityCallData(proofRaw as never, publicSignals);
    const [proof] = JSON.parse(`[${calldata.replace(/\]\s*\[/, "],[")}]`) as [string[], string[]];
    if (proof.length !== 24) {
      throw ProofValidationFailed(`unexpected PLONK proof length`, { expected: 24, got: proof.length });
    }
    return proof;
  }
}

export { PUBLIC_SIGNAL_COUNT };
