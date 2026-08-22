import { loadAssets, type AssetInfo } from "../../domain/assets.js";

/** Symbol/assetId helpers shared across the trading agents. */

export function assetBySymbol(symbol: string, env?: NodeJS.ProcessEnv): AssetInfo | undefined {
  const s = symbol.toUpperCase();
  return loadAssets(env).find((a) => a.symbol.toUpperCase() === s);
}

export function assetById(assetId: number, env?: NodeJS.ProcessEnv): AssetInfo | undefined {
  return loadAssets(env).find((a) => a.assetId === assetId);
}

export function toHuman(base: string | bigint, decimals: number): number {
  return Number(BigInt(base)) / 10 ** decimals;
}

export function toBase(human: number, decimals: number): string {
  return BigInt(Math.max(0, Math.floor(human * 10 ** decimals))).toString();
}
