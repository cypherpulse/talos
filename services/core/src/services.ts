import type { Address } from "viem";
import type { TalosConfig } from "./config/index.js";
import type { Repositories } from "./database/repositories.js";
import { createLogger, type Logger } from "./observability/logger.js";
import { createEnvSigner } from "./blockchain/signer.js";
import { ChainClient } from "./blockchain/client.js";
import { ContractClient } from "./contracts/index.js";
import { ProofService } from "./proofs/service.js";
import { NoteManager } from "./notes/manager.js";
import { NoteEncryptionService } from "./notes/encryption.js";
import { TransactionManager } from "./transactions/manager.js";
import { MerkleSynchronizer } from "./merkle/synchronizer.js";
import { ExecutionEngine } from "./execution/engine.js";
import { InlineDispatcher, type OperationDispatcher } from "./execution/dispatcher.js";
import { InMemoryLockService, type LockService } from "./execution/locks.js";

/** Everything the API and workers need, wired from config + repositories. */
export interface Services {
  config: TalosConfig;
  logger: Logger;
  repos: Repositories;
  chain: ChainClient;
  contract: ContractClient;
  proofs: ProofService;
  notes: NoteManager;
  encryption: NoteEncryptionService;
  merkle: MerkleSynchronizer;
  txManager: TransactionManager;
  engine: ExecutionEngine;
  dispatcher: OperationDispatcher;
  locks: LockService;
}

export interface BuildOptions {
  config: TalosConfig;
  repos: Repositories;
  logger?: Logger;
  locks?: LockService;
  fromBlock?: bigint;
  dispatcherFactory?: (engine: ExecutionEngine, logger: Logger) => OperationDispatcher;
}

export function buildServices(opts: BuildOptions): Services {
  const { config, repos } = opts;
  const logger = opts.logger ?? createLogger({ service: "talos-core" });
  const locks = opts.locks ?? new InMemoryLockService();

  const signer = createEnvSigner(config.signerPrivateKey);
  const chain = new ChainClient(config.chain, signer);
  const pool = config.contracts.talosPool as Address;
  const asset = config.contracts.testAsset as Address;
  const contract = new ContractClient(chain, pool, asset);
  const encryption = new NoteEncryptionService(config.noteEncryptionKey);
  const proofs = new ProofService(config.circuitArtifactsDir, logger);
  const notes = new NoteManager(repos.notes, contract, logger);
  const txManager = new TransactionManager(chain, repos.transactions, logger);
  const merkle = new MerkleSynchronizer(
    chain,
    contract,
    repos.merkle,
    repos.nullifiers,
    repos.events,
    pool,
    logger,
    opts.fromBlock ?? 0n,
  );

  const engine = new ExecutionEngine({ repos, notes, proofs, contract, chain, txManager, merkle, locks, logger });
  const dispatcher = (opts.dispatcherFactory ?? ((e, l) => new InlineDispatcher(e, l)))(engine, logger);

  return { config, logger, repos, chain, contract, proofs, notes, encryption, merkle, txManager, engine, dispatcher, locks };
}
