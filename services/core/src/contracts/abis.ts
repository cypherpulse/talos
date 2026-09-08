import { parseAbi } from "viem";

/**
 * Typed ABIs for the Talos contracts. Human-readable signatures mirror the frozen
 * Phase 2/3 interfaces (contracts/src/interfaces). Centralized here so raw contract
 * shapes never leak into the rest of the app (Phase 4 §6).
 */

export const talosPoolAbi = parseAbi([
  "struct Proof { uint256[24] data; }",
  "function deposit(Proof proof, uint256 assetId, uint256 amount, uint256 commitment) payable",
  "function transfer(Proof proof, uint256 root, uint256 nullifier, uint256 outputCommitment1, uint256 outputCommitment2)",
  "function split(Proof proof, uint256 root, uint256 nullifier, uint256 outputCommitment1, uint256 outputCommitment2)",
  "function merge(Proof proof, uint256 root, uint256 nullifier1, uint256 nullifier2, uint256 outputCommitment)",
  "function withdraw(Proof proof, uint256 root, uint256 nullifier, uint256 amount, address recipient, uint256 assetId)",
  "function getLastRoot() view returns (uint256)",
  "function isKnownRoot(uint256 root) view returns (bool)",
  "function isNullifierSpent(uint256 nullifier) view returns (bool)",
  "function nextLeafIndex() view returns (uint256)",
  "function merkleDepth() pure returns (uint256)",
  "event Deposit(uint256 indexed commitment, uint256 indexed leafIndex, uint256 assetId, uint256 amount, uint256 newRoot)",
  "event CommitmentInserted(uint256 indexed commitment, uint256 indexed leafIndex, uint256 newRoot)",
  "event PrivateTransfer(uint256 indexed nullifier, uint256 outputCommitment1, uint256 outputCommitment2, uint256 newRoot)",
  "event Split(uint256 indexed nullifier, uint256 outputCommitment1, uint256 outputCommitment2, uint256 newRoot)",
  "event Merge(uint256 indexed nullifier1, uint256 indexed nullifier2, uint256 outputCommitment, uint256 newRoot)",
  "event Withdrawal(uint256 indexed nullifier, address indexed recipient, uint256 assetId, uint256 amount)",
  "event NullifierSpent(uint256 indexed nullifier)",
  "event RootUpdated(uint256 indexed newRoot, uint256 leafIndex)",
]);

export const erc20Abi = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)",
  "function mint(address to, uint256 amount)",
]);
