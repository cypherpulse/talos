import type { Address } from "viem";
import type { ChainClient } from "../blockchain/client.js";
import type { ContractClient } from "../contracts/index.js";
import type { EventsRepository, MerkleRepository, NullifiersRepository } from "../database/repositories.js";
import { MerkleTree } from "../crypto/poseidon.js";
import { talosPoolAbi } from "../contracts/abis.js";
import type { Logger } from "../observability/logger.js";

export interface MerklePath {
  leafIndex: number;
  root: string;
  pathElements: string[];
  pathIndices: number[];
}

/**
 * MerkleSynchronizer (Phase 4 §14–§15). Rebuilds and maintains an in-process mirror
 * of the on-chain commitment tree by consuming CommitmentInserted / NullifierSpent
 * events, and answers root / membership / path queries. It is reorg-aware: after each
 * sync it checks the computed root against the authoritative on-chain root and, on a
 * mismatch, rebuilds the tree from chain history (idempotent, never appends dupes).
 */
export class MerkleSynchronizer {
  private tree: MerkleTree | null = null;

  constructor(
    private readonly chain: ChainClient,
    private readonly contract: ContractClient,
    private readonly merkleRepo: MerkleRepository,
    private readonly nullifiers: NullifiersRepository,
    private readonly events: EventsRepository,
    private readonly poolAddress: Address,
    private readonly logger: Logger,
    private readonly fromBlock: bigint = 0n,
  ) {}

  private async ensureTree(): Promise<MerkleTree> {
    if (this.tree) return this.tree;
    const tree = await MerkleTree.create();
    for (const commitment of await this.merkleRepo.getOrderedCommitments()) tree.insert(BigInt(commitment));
    this.tree = tree;
    return tree;
  }

  /**
   * Full idempotent reconciliation from chain history. Reads ALL CommitmentInserted
   * and NullifierSpent events from the deployment block, upserts them into the repo
   * (dedup by commitment / nullifier), rebuilds the tree deterministically from the
   * ordered commitment set, and verifies the computed root against the authoritative
   * on-chain root. Reading from block 0 each time is intentionally simple and
   * reorg-safe for the MVP; production can window this with a checkpoint.
   */
  async sync(): Promise<{ inserted: number; nullified: number }> {
    let inserted = 0;
    let nullified = 0;
    // Retry until the mirror's computed root matches the authoritative on-chain root.
    // The events are already on-chain (the tx confirmed), so this converges quickly;
    // it just absorbs RPC log-propagation lag deterministically.
    for (let attempt = 0; attempt < 15; attempt++) {
      const head = await this.chain.getBlockNumber();
      const inserts = await this.chain.publicClient.getContractEvents({
        address: this.poolAddress,
        abi: talosPoolAbi,
        eventName: "CommitmentInserted",
        fromBlock: this.fromBlock,
        toBlock: head,
      });
      const spends = await this.chain.publicClient.getContractEvents({
        address: this.poolAddress,
        abi: talosPoolAbi,
        eventName: "NullifierSpent",
        fromBlock: this.fromBlock,
        toBlock: head,
      });

      const ordered = [...inserts].sort((a, b) => Number((a.args.leafIndex ?? 0n) - (b.args.leafIndex ?? 0n)));
      for (const log of ordered) {
        const commitment = (log.args.commitment ?? 0n).toString();
        const leafIndex = Number(log.args.leafIndex ?? 0n);
        await this.events.record({
          txHash: log.transactionHash ?? "",
          logIndex: Number(log.logIndex ?? 0),
          blockNumber: Number(log.blockNumber ?? 0n),
          blockHash: log.blockHash ?? "",
          name: "CommitmentInserted",
          data: { commitment, leafIndex, newRoot: (log.args.newRoot ?? 0n).toString() },
        });
        if (await this.merkleRepo.hasCommitment(commitment)) continue;
        await this.merkleRepo.insertLeaf({
          leafIndex,
          commitment,
          root: (log.args.newRoot ?? 0n).toString(),
          blockNumber: Number(log.blockNumber ?? 0n),
          txHash: log.transactionHash ?? "",
        });
        inserted++;
      }
      for (const log of spends) {
        const nullifier = (log.args.nullifier ?? 0n).toString();
        if (await this.nullifiers.isSpent(nullifier)) continue;
        await this.nullifiers.markSpent(nullifier, Number(log.blockNumber ?? 0n), log.transactionHash ?? "");
        nullified++;
      }

      // Rebuild the tree deterministically from the full ordered commitment set.
      const commitments = await this.merkleRepo.getOrderedCommitments();
      const tree = await MerkleTree.create();
      for (const c of commitments) tree.insert(BigInt(c));
      this.tree = tree;
      await this.events.setLastProcessedBlock(Number(head));

      const computed = await tree.root();
      const onchain = await this.contract.getLastRoot();
      if (computed === onchain) return { inserted, nullified };
      await new Promise((r) => setTimeout(r, 150));
    }

    this.logger.warn("merkle sync did not converge to on-chain root");
    return { inserted, nullified };
  }

  async getRoot(): Promise<string> {
    const tree = await this.ensureTree();
    return (await tree.root()).toString();
  }

  async hasCommitment(commitment: string): Promise<boolean> {
    return this.merkleRepo.hasCommitment(commitment);
  }

  async getPath(commitment: string): Promise<MerklePath | null> {
    const leafIndex = await this.merkleRepo.getLeafIndex(commitment);
    if (leafIndex === null) return null;
    const tree = await this.ensureTree();
    const { root, pathElements, pathIndices } = await tree.proof(leafIndex);
    return {
      leafIndex,
      root: root.toString(),
      pathElements: pathElements.map((x) => x.toString()),
      pathIndices,
    };
  }
}
