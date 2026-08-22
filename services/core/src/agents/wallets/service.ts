import { randomUUID } from "node:crypto";
import { createWalletClient, defineChain, http, type Address, type Hash, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import type { AgentRecord, AgentRole, AgentsRepository } from "../../database/repositories.js";
import type { NoteEncryptionService } from "../../notes/encryption.js";
import { deriveOwnerPubKey } from "../../crypto/poseidon.js";
import { randomFieldElement } from "../../crypto/random.js";

/**
 * AgentWalletService (Phase 6 §9). Each agent has (1) an X Layer EOA that signs trades
 * and (2) a Talos receive identity (owner pub key + spending key) for private transfers.
 * Both private materials are AES-256-GCM encrypted at rest via {NoteEncryptionService}
 * and only ever decrypted transiently here — never logged, returned by an API, or given
 * to the LLM. Execution flows: Agent → Guard → ExecutionService → this signer → X Layer.
 */

export interface AgentSigner {
  address: Address;
  sendTransaction(tx: { to: string; data?: string; value?: bigint; gas?: bigint }): Promise<Hash>;
}

export interface AgentWalletDeps {
  repo: AgentsRepository;
  enc: NoteEncryptionService;
  chain: { id: number; rpcUrl: string };
}

const ROLE_NAME: Record<AgentRole, string> = {
  RESEARCH: "Research Agent",
  TRADER: "Trader Agent",
  PORTFOLIO: "Portfolio Agent",
};

function minimalChain(id: number, rpcUrl: string) {
  return defineChain({
    id,
    name: "X Layer",
    nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  });
}

export class AgentWalletService {
  constructor(private readonly d: AgentWalletDeps) {}

  /**
   * Get the owner's Trading Agent, creating its execution wallet + Talos identity if absent.
   * ONLY the Trading Agent owns a wallet — Research and Portfolio are read-only cognitive
   * agents with no keys (Phase 6 architecture correction).
   */
  async getOrCreate(owner: string, role: AgentRole, name?: string): Promise<AgentRecord> {
    if (role !== "TRADER") {
      throw new Error("only the Trading Agent owns a wallet; Research and Portfolio are read-only");
    }
    const ownerLc = owner.toLowerCase();
    const existing = await this.d.repo.getByOwnerRole(ownerLc, role);
    if (existing) return existing;

    const pk = generatePrivateKey();
    const account = privateKeyToAccount(pk);
    const sk = randomFieldElement();
    const ownerPub = await deriveOwnerPubKey(sk);

    return this.d.repo.create({
      id: `agent_${randomUUID()}`,
      owner: ownerLc,
      role,
      name: name ?? ROLE_NAME[role],
      walletAddress: account.address,
      walletKeyBlob: this.d.enc.encrypt(pk),
      talosPublicKey: ownerPub.toString(),
      spendingKeyBlob: this.d.enc.encrypt(sk.toString()),
      status: "ACTIVE",
      createdAt: new Date().toISOString(),
    });
  }

  get(id: string): Promise<AgentRecord | null> {
    return this.d.repo.get(id);
  }

  listByOwner(owner: string): Promise<AgentRecord[]> {
    return this.d.repo.listByOwner(owner.toLowerCase());
  }

  /** Decrypt the agent's Talos spending key for internal note ops. Never exposed via API. */
  async getSpendingKey(id: string): Promise<string | null> {
    const blobs = await this.d.repo.getSecretBlobs(id);
    return blobs ? this.d.enc.decrypt(blobs.spendingKeyBlob) : null;
  }

  /** In-memory signer for the agent's EOA. The key is decrypted transiently, never returned. */
  async getSigner(id: string): Promise<AgentSigner | null> {
    const blobs = await this.d.repo.getSecretBlobs(id);
    if (!blobs) return null;
    const account = privateKeyToAccount(this.d.enc.decrypt(blobs.walletKeyBlob) as Hex);
    const chain = minimalChain(this.d.chain.id, this.d.chain.rpcUrl);
    const wallet = createWalletClient({ account, chain, transport: http(this.d.chain.rpcUrl) });
    return {
      address: account.address,
      sendTransaction: (tx) =>
        wallet.sendTransaction({
          account,
          chain,
          to: tx.to as Address,
          data: (tx.data ?? "0x") as Hex,
          value: tx.value ?? 0n,
          ...(tx.gas ? { gas: tx.gas } : {}),
        }),
    };
  }
}
