import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { CHAIN_ID } from "./api";

type Eip1193Provider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
};

interface WalletState {
  address: string | null;
  chainId: number | null;
  available: boolean;
  connecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
}

const WalletContext = createContext<WalletState | null>(null);

function getProvider(): Eip1193Provider | null {
  if (typeof window === "undefined") return null;
  const injected = (window as unknown as { ethereum?: Eip1193Provider }).ethereum;
  return injected ?? null;
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [available, setAvailable] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const provider = getProvider();
    setAvailable(Boolean(provider));
    if (!provider) return;

    void (async () => {
      try {
        const accounts = (await provider.request({ method: "eth_accounts" })) as string[];
        if (accounts?.[0]) setAddress(accounts[0]);
        const cid = (await provider.request({ method: "eth_chainId" })) as string;
        if (cid) setChainId(Number.parseInt(cid, 16));
      } catch {
        /* identity only — ignore */
      }
    })();

    const onAccounts = (...args: unknown[]) => {
      const accounts = args[0] as string[] | undefined;
      setAddress(accounts?.[0] ?? null);
    };
    const onChain = (...args: unknown[]) => {
      const cid = args[0] as string | undefined;
      setChainId(cid ? Number.parseInt(cid, 16) : null);
    };
    provider.on?.("accountsChanged", onAccounts);
    provider.on?.("chainChanged", onChain);
    return () => {
      provider.removeListener?.("accountsChanged", onAccounts);
      provider.removeListener?.("chainChanged", onChain);
    };
  }, []);

  const connect = useCallback(async () => {
    const provider = getProvider();
    if (!provider) {
      setError("No browser wallet detected. Talos uses your wallet for identity only.");
      return;
    }
    setConnecting(true);
    setError(null);
    try {
      const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
      setAddress(accounts?.[0] ?? null);
      const cid = (await provider.request({ method: "eth_chainId" })) as string;
      setChainId(cid ? Number.parseInt(cid, 16) : null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connection request was dismissed.");
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => setAddress(null), []);

  const value = useMemo(
    () => ({ address, chainId, available, connecting, error, connect, disconnect }),
    [address, chainId, available, connecting, error, connect, disconnect],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

const DISCONNECTED: WalletState = {
  address: null,
  chainId: null,
  available: false,
  connecting: false,
  error: null,
  connect: async () => {},
  disconnect: () => {},
};

export function useWallet(): WalletState {
  const ctx = useContext(WalletContext);
  // Degrade gracefully (disconnected) instead of throwing if rendered outside the
  // provider (e.g. an error-boundary fallback or SSR shell) — never crash the shell.
  return ctx ?? DISCONNECTED;
}

export const EXPECTED_CHAIN_ID = CHAIN_ID;
