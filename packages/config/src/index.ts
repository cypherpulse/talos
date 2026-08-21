/**
 * @talos/config
 *
 * Shared, non-secret configuration constants for the Talos monorepo.
 *
 * Phase 1 scope: identity/version constants only. Environment parsing and typed
 * runtime configuration (via Zod) are added in later phases. Secrets are NEVER
 * hardcoded here — they are read from the environment at runtime.
 */

export const TALOS_VERSION = "0.1.0" as const;

/**
 * X Layer testnet chain id. Kept here as a shared, non-secret constant so every
 * workspace agrees on the target network. Confirm against the live network before
 * relying on it for signing.
 */
export const XLAYER_TESTNET_CHAIN_ID = 195 as const;

export type TalosNetwork = "xlayer-testnet";
