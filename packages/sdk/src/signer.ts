/**
 * A `TalosSigner` produces the wallet signature that seeds the key tree (see keys.ts). Only
 * `signMessage` (EIP-191 personal_sign) is needed for non-custodial spends — the spending
 * key is derived from it locally and never leaves the process.
 *
 *   - Node / agents:  `signerFromPrivateKey(pk)`  (viem local account)
 *   - Browser:        `signerFromInjected(provider)` (MetaMask/OKX etc.)
 *
 * On-chain deposit transactions need a full wallet client (value transfer + calldata); that
 * is a separate capability from this message signer.
 */
import { privateKeyToAccount } from "viem/accounts";

export interface TalosSigner {
  getAddress(): Promise<string>;
  /** EIP-191 personal_sign over `message`; returns a 0x-hex signature. */
  signMessage(message: string): Promise<string>;
}

/** A signer backed by a raw private key (Node, CLI, autonomous agents). */
export function signerFromPrivateKey(privateKey: `0x${string}`): TalosSigner {
  const account = privateKeyToAccount(privateKey);
  return {
    getAddress: async () => account.address,
    signMessage: (message) => account.signMessage({ message }),
  };
}

/** Minimal EIP-1193 provider shape (browser wallet). */
export interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}

/** A signer backed by an injected browser wallet (personal_sign). */
export function signerFromInjected(provider: Eip1193Provider, address?: string): TalosSigner {
  const resolve = async (): Promise<string> => {
    if (address) return address;
    const accounts = (await provider.request({ method: "eth_accounts" })) as string[];
    const a = accounts?.[0];
    if (!a) throw new Error("no wallet account available");
    return a;
  };
  return {
    getAddress: resolve,
    signMessage: async (message) => {
      const from = await resolve();
      return (await provider.request({ method: "personal_sign", params: [message, from] })) as string;
    },
  };
}
