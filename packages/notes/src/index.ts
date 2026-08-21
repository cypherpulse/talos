/**
 * @talos/notes
 *
 * The private note model — the client-side representation of ZK-private value
 * (commitment construction, note secrets, and nullifier derivation inputs).
 *
 * Phase 1 is a placeholder. The note model, commitment scheme, and nullifier
 * derivation are specified in `docs/protocol/` and implemented in Phase 3.
 * Note secrets must NEVER be logged or persisted in plaintext.
 */

export const NOTES_PACKAGE = "@talos/notes" as const;
