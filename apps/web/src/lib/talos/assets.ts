import { useQuery } from "@tanstack/react-query";

import { talosApi } from "./api";
import { formatUnits } from "./format";
import type { Asset, NotePublic } from "./types";

/**
 * Asset registry for the UI. Every note is bound to an assetId; formatting and symbols
 * must come from that asset (decimals differ — USDC is 6, native OKB is 18), never a
 * single hard-coded token. The list is fetched from the Core Server, with a static
 * fallback so amounts still render correctly before the request resolves.
 */
export const FALLBACK_ASSETS: Asset[] = [
  { assetId: 1, symbol: "USDC", name: "USD Coin", address: "0x0", decimals: 6, isNative: false, color: "#2775CA", logo: "" },
  { assetId: 2, symbol: "USDT", name: "Tether USD", address: "0x0", decimals: 6, isNative: false, color: "#26A17B", logo: "" },
  { assetId: 3, symbol: "USDG", name: "Global Dollar", address: "0x0", decimals: 6, isNative: false, color: "#C9A227", logo: "" },
  { assetId: 4, symbol: "OKB", name: "OKB (native)", address: "0x0000000000000000000000000000000000000000", decimals: 18, isNative: true, color: "#0B0B0F", logo: "" },
];

export function useAssets() {
  const query = useQuery({
    queryKey: ["assets"],
    queryFn: () => talosApi.assets(),
    staleTime: 60_000,
  });
  return {
    assets: query.data?.assets ?? FALLBACK_ASSETS,
    poolAddress: query.data?.poolAddress ?? null,
    chainId: query.data?.chainId ?? null,
    isLoading: query.isLoading,
  };
}

export function assetById(assets: Asset[], id: number | string): Asset {
  const n = typeof id === "string" ? Number(id) : id;
  return (
    assets.find((a) => a.assetId === n) ??
    FALLBACK_ASSETS.find((a) => a.assetId === n) ??
    FALLBACK_ASSETS[0]!
  );
}

/** USD-pegged stablecoins are shown with a `$` prefix; other assets (e.g. OKB) are not. */
export function isUsdStable(asset: Asset): boolean {
  return asset.symbol === "USDC" || asset.symbol === "USDT" || asset.symbol === "USDG";
}

/** Format a base-unit amount using a specific asset's decimals, `$`-prefixed for USD stables. */
export function formatAssetAmount(base: string | bigint, asset: Asset): string {
  const value = formatUnits(base, asset.decimals);
  return isUsdStable(asset) ? `$${value}` : value;
}

/** Format `<amount> <SYMBOL>` for a note using its own asset. */
export function formatNote(note: Pick<NotePublic, "value" | "assetId">, assets: Asset[]): string {
  const asset = assetById(assets, note.assetId);
  return `${formatAssetAmount(note.value, asset)} ${asset.symbol}`;
}

/** Sum AVAILABLE note values per asset → shielded balance the connected user holds. */
export interface ShieldedBalance {
  asset: Asset;
  total: bigint;
  count: number;
}

export function shieldedBalances(notes: NotePublic[], assets: Asset[]): ShieldedBalance[] {
  const byAsset = new Map<number, ShieldedBalance>();
  for (const n of notes) {
    if (n.state !== "AVAILABLE") continue;
    const asset = assetById(assets, n.assetId);
    const entry = byAsset.get(asset.assetId) ?? { asset, total: 0n, count: 0 };
    try {
      entry.total += BigInt(n.value);
    } catch {
      /* skip malformed value */
    }
    entry.count += 1;
    byAsset.set(asset.assetId, entry);
  }
  return [...byAsset.values()].sort((a, b) => a.asset.assetId - b.asset.assetId);
}
