import type { Address, Hash } from "viem";
import type { ChainClient } from "../blockchain/client.js";
import type { Groth16Proof } from "../domain/types.js";
import { erc20Abi, talosPoolAbi } from "./abis.js";

/**
 * Typed clients for TalosPool and the ERC-20 test asset (Phase 4 §6). All raw
 * contract interaction is confined here; the rest of the app calls typed methods and
 * works in decimal strings / bigints, never in ABIs.
 */

function toProofArg(p: Groth16Proof) {
  return {
    a: [BigInt(p.a[0]), BigInt(p.a[1])] as const,
    b: [
      [BigInt(p.b[0][0]), BigInt(p.b[0][1])],
      [BigInt(p.b[1][0]), BigInt(p.b[1][1])],
    ] as const,
    c: [BigInt(p.c[0]), BigInt(p.c[1])] as const,
  };
}

export class ContractClient {
  constructor(
    private readonly chain: ChainClient,
    readonly poolAddress: Address,
    readonly assetAddress: Address,
  ) {}

  /** The signer address holding the ERC-20 balance and paying gas. */
  get signer(): Address {
    return this.chain.signerAddress;
  }

  // --- TalosPool writes ---

  deposit(assetId: bigint, amount: bigint, commitment: bigint): Promise<Hash> {
    return this.chain.writeContract(this.poolAddress, talosPoolAbi, "deposit", [assetId, amount, commitment]);
  }

  transfer(proof: Groth16Proof, root: bigint, nullifier: bigint, out1: bigint, out2: bigint): Promise<Hash> {
    return this.chain.writeContract(this.poolAddress, talosPoolAbi, "transfer", [
      toProofArg(proof),
      root,
      nullifier,
      out1,
      out2,
    ]);
  }

  split(proof: Groth16Proof, root: bigint, nullifier: bigint, out1: bigint, out2: bigint): Promise<Hash> {
    return this.chain.writeContract(this.poolAddress, talosPoolAbi, "split", [
      toProofArg(proof),
      root,
      nullifier,
      out1,
      out2,
    ]);
  }

  merge(proof: Groth16Proof, root: bigint, n1: bigint, n2: bigint, out: bigint): Promise<Hash> {
    return this.chain.writeContract(this.poolAddress, talosPoolAbi, "merge", [toProofArg(proof), root, n1, n2, out]);
  }

  withdraw(
    proof: Groth16Proof,
    root: bigint,
    nullifier: bigint,
    amount: bigint,
    recipient: Address,
    assetId: bigint,
  ): Promise<Hash> {
    return this.chain.writeContract(this.poolAddress, talosPoolAbi, "withdraw", [
      toProofArg(proof),
      root,
      nullifier,
      amount,
      recipient,
      assetId,
    ]);
  }

  // --- TalosPool reads (authoritative on-chain state) ---

  getLastRoot(): Promise<bigint> {
    return this.chain.readContract(this.poolAddress, talosPoolAbi, "getLastRoot");
  }
  isKnownRoot(root: bigint): Promise<boolean> {
    return this.chain.readContract(this.poolAddress, talosPoolAbi, "isKnownRoot", [root]);
  }
  isNullifierSpent(nullifier: bigint): Promise<boolean> {
    return this.chain.readContract(this.poolAddress, talosPoolAbi, "isNullifierSpent", [nullifier]);
  }
  nextLeafIndex(): Promise<bigint> {
    return this.chain.readContract(this.poolAddress, talosPoolAbi, "nextLeafIndex");
  }
  merkleDepth(): Promise<bigint> {
    return this.chain.readContract(this.poolAddress, talosPoolAbi, "merkleDepth");
  }

  // --- ERC-20 ---

  allowance(owner: Address, spender: Address): Promise<bigint> {
    return this.chain.readContract(this.assetAddress, erc20Abi, "allowance", [owner, spender]);
  }
  balanceOf(account: Address): Promise<bigint> {
    return this.chain.readContract(this.assetAddress, erc20Abi, "balanceOf", [account]);
  }
  approve(spender: Address, amount: bigint): Promise<Hash> {
    return this.chain.writeContract(this.assetAddress, erc20Abi, "approve", [spender, amount]);
  }
  mint(to: Address, amount: bigint): Promise<Hash> {
    return this.chain.writeContract(this.assetAddress, erc20Abi, "mint", [to, amount]);
  }
}
