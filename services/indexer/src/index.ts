/**
 * @talos/indexer
 *
 * The indexer watches X Layer for protocol events (commitments, nullifiers, tree
 * updates) and materializes them into PostgreSQL for fast reads. This index is
 * derived, rebuildable state — NEVER the source of cryptographic truth, which is
 * the on-chain contract state plus verified ZK proofs.
 *
 * Phase 1 is a placeholder. Indexer logic is implemented in a later phase.
 */

export const INDEXER_SERVICE = "@talos/indexer" as const;
