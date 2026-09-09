/**
 * @zktalos/sdk — the typed client SDK for Talos.
 *
 * Isomorphic (Node/CLI/agents + browser): key derivation is Web-Crypto-only, the REST client
 * uses global `fetch`, and PLONK proving runs wherever the SDK runs. Non-custodial by design
 * — the spending key is derived on the client from a wallet signature and never transmitted;
 * the server relays client-generated proofs.
 *
 *   import { TalosApi, signerFromPrivateKey, deriveTalosKeys } from "@zktalos/sdk";
 *
 * The high-level `TalosClient` (ties signer + api + proving for one-call deposit/withdraw/
 * split/merge/transfer) and the `talos` CLI build on these primitives.
 */
export const SDK_PACKAGE = "@zktalos/sdk" as const;

export * from "./types";
export * from "./keys";
export * from "./notes";
export { poseidon } from "./poseidon";
export { provePlonk, parsePlonkCalldata, type PlonkProofResult } from "./proof";
export { TalosApi, TalosApiError, type TalosApiOptions, type SpendSubmitBody } from "./api";
export {
  signerFromPrivateKey,
  signerFromInjected,
  type TalosSigner,
  type Eip1193Provider,
} from "./signer";
export { httpArtifacts, fileArtifacts, type ArtifactSource, type CircuitArtifacts } from "./artifacts";
export {
  TalosClient,
  type TalosClientOptions,
  type NoteRef,
  type OutputRecord,
  type DepositPrep,
} from "./client";
