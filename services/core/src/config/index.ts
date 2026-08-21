import { z } from "zod";

/**
 * Talos Core configuration.
 *
 * All configuration is validated with Zod at load time; the server refuses to start
 * with an invalid environment. Secrets (signer key, note-encryption key) come only
 * from the environment and are never logged. See docs/server/architecture.md.
 */

const hexKey = z.string().regex(/^0x[0-9a-fA-F]+$/, "must be a 0x-hex string");

export const ConfigSchema = z.object({
  nodeEnv: z.enum(["development", "test", "production"]).default("development"),
  port: z.coerce.number().int().positive().default(3000),

  // Datastores
  databaseUrl: z.string().min(1),
  redisUrl: z.string().min(1),

  // X Layer (EVM)
  chain: z.object({
    rpcUrl: z.string().url(),
    chainId: z.coerce.number().int().positive(),
    explorerUrl: z.string().url().optional(),
    confirmationsRequired: z.coerce.number().int().min(1).default(2),
    // Block-confirmation polling interval (ms).
    pollingIntervalMs: z.coerce.number().int().positive().default(1000),
  }),

  // Contracts (populated after deployment)
  contracts: z.object({
    talosPool: hexKey.length(42),
    testAsset: hexKey.length(42),
  }),

  // Signer — testnet/dev key only. NEVER a funded mainnet key.
  signerPrivateKey: hexKey.length(66),

  // 32-byte AES-256-GCM key for note-at-rest encryption (0x + 64 hex).
  noteEncryptionKey: hexKey.length(66),

  // Directory holding the Phase 3 circuit artifacts (wasm + zkey + vkey).
  circuitArtifactsDir: z.string().min(1),

  // Feature flags for workers (allow running API-only or worker-only processes).
  runWorkers: z.coerce.boolean().default(true),
});

export type TalosConfig = z.infer<typeof ConfigSchema>;

/** Load and validate configuration from a raw environment object. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): TalosConfig {
  return ConfigSchema.parse({
    nodeEnv: env.NODE_ENV,
    port: env.PORT,
    databaseUrl: env.DATABASE_URL,
    redisUrl: env.REDIS_URL,
    chain: {
      rpcUrl: env.X_LAYER_RPC_URL,
      chainId: env.X_LAYER_CHAIN_ID,
      explorerUrl: env.X_LAYER_EXPLORER_URL,
      confirmationsRequired: env.X_LAYER_CONFIRMATIONS_REQUIRED,
      pollingIntervalMs: env.X_LAYER_POLLING_INTERVAL_MS,
    },
    contracts: {
      talosPool: env.TALOS_POOL_ADDRESS,
      testAsset: env.TEST_USDC_ADDRESS,
    },
    signerPrivateKey: env.SIGNER_PRIVATE_KEY,
    noteEncryptionKey: env.NOTE_ENCRYPTION_KEY,
    circuitArtifactsDir: env.CIRCUIT_ARTIFACTS_DIR,
    runWorkers: env.RUN_WORKERS ?? true,
  });
}
