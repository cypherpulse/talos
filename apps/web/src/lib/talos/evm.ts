/**
 * Minimal EVM helper for the browser wallet path.
 *
 * Talos deposits are non-custodial: the connected wallet (e.g. MetaMask) signs and
 * funds the ERC-20 approval + `pool.deposit(...)` itself. All arguments are static
 * (uint256 / address), so the calldata is hand-encoded here — no heavy web3 library.
 * Reads use the public RPC directly so they work regardless of the wallet's chain.
 */
import { CHAIN_ID } from "./api";

export type Eip1193 = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

const RPC_URL: string =
  (import.meta.env["VITE_XLAYER_RPC_URL"] as string | undefined) ?? "https://testrpc.xlayer.tech/terigon";
const EXPLORER: string =
  (import.meta.env["VITE_XLAYER_EXPLORER_URL"] as string | undefined) ??
  "https://www.okx.com/web3/explorer/xlayer-test";
const CHAIN_HEX = "0x" + CHAIN_ID.toString(16);

export function getInjected(): Eip1193 | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { ethereum?: Eip1193 }).ethereum ?? null;
}

// --- ABI encoding (static args only) ---
const pad32 = (hex: string): string => hex.replace(/^0x/, "").toLowerCase().padStart(64, "0");
const uint = (v: bigint): string => pad32(v.toString(16));
const addr = (a: string): string => pad32(a.replace(/^0x/, ""));

export const encodeApprove = (spender: string, amount: bigint): string =>
  "0x095ea7b3" + addr(spender) + uint(amount);

/** PLONK proof in the pool's Solidity-verifier order (as returned by /deposits/prepare): 24 words. */
export type SolProof = string[];

/**
 * Encode `deposit(Proof proof, uint256 assetId, uint256 amount, uint256 commitment)`.
 * Proof is the flat PLONK `uint256[24]` — a fixed-size tuple, so its 24 words are
 * head-encoded inline before the three uint256 args.
 * Selector = deposit((uint256[24]),uint256,uint256,uint256).
 */
export function encodeDeposit(proof: SolProof, assetId: bigint, amount: bigint, commitment: bigint): string {
  if (proof.length !== 24) throw new Error(`PLONK proof must be 24 words, got ${proof.length}`);
  const proofWords = proof.map((v) => uint(BigInt(v))).join("");
  return "0x7f6c5081" + proofWords + uint(assetId) + uint(amount) + uint(commitment);
}
const encodeBalanceOf = (owner: string): string => "0x70a08231" + addr(owner);
const encodeAllowance = (owner: string, spender: string): string =>
  "0xdd62ed3e" + addr(owner) + addr(spender);

// --- Reads via public RPC ---
async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const j = (await res.json()) as { result?: T; error?: { message: string } };
  if (j.error) throw new Error(j.error.message);
  return j.result as T;
}

export async function readErc20Balance(token: string, owner: string): Promise<bigint> {
  return BigInt(await rpc<string>("eth_call", [{ to: token, data: encodeBalanceOf(owner) }, "latest"]));
}
export async function readAllowance(token: string, owner: string, spender: string): Promise<bigint> {
  return BigInt(await rpc<string>("eth_call", [{ to: token, data: encodeAllowance(owner, spender) }, "latest"]));
}
export async function readNativeBalance(owner: string): Promise<bigint> {
  return BigInt(await rpc<string>("eth_getBalance", [owner, "latest"]));
}

// --- Wallet actions ---
export async function ensureChain(p: Eip1193): Promise<void> {
  const current = (await p.request({ method: "eth_chainId" })) as string;
  if (Number.parseInt(current, 16) === CHAIN_ID) return;
  try {
    await p.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN_HEX }] });
  } catch (e) {
    const err = e as { code?: number; message?: string };
    if (err?.code === 4902 || String(err?.message ?? "").includes("Unrecognized")) {
      await p.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: CHAIN_HEX,
            chainName: "X Layer testnet",
            nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 },
            rpcUrls: [RPC_URL, "https://xlayertestrpc.okx.com/terigon"],
            blockExplorerUrls: [EXPLORER],
          },
        ],
      });
    } else {
      throw e;
    }
  }
}

export async function sendTx(
  p: Eip1193,
  tx: { from: string; to: string; data: string; value?: bigint },
): Promise<string> {
  const params: Record<string, string> = { from: tx.from, to: tx.to, data: tx.data };
  if (tx.value && tx.value > 0n) params["value"] = "0x" + tx.value.toString(16);
  return (await p.request({ method: "eth_sendTransaction", params: [params] })) as string;
}

/** Poll the public RPC until the tx is mined; returns true on success, throws on revert/timeout. */
export async function waitForTx(txHash: string, timeoutMs = 180_000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const receipt = await rpc<{ status: string } | null>("eth_getTransactionReceipt", [txHash]);
    if (receipt) {
      if (receipt.status === "0x1") return true;
      throw new Error("Transaction reverted on-chain");
    }
    await new Promise((r) => setTimeout(r, 2500));
  }
  throw new Error("Timed out waiting for transaction confirmation");
}
