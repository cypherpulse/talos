import { randomUUID } from "node:crypto";

import type { NotesRepository, PortfolioRepository } from "../../database/repositories.js";
import type { Logger } from "../../observability/logger.js";
import type { PriceProvider } from "../prices/index.js";
import type { PortfolioSnapshot, PortfolioPosition, RebalanceAction, PortfolioTarget } from "../types/index.js";
import { assetById, assetBySymbol, toBase, toHuman } from "../shared/assets.js";

/**
 * PortfolioAgent (Phase 6 §4). Reads the owner's PRIVATE (shielded) notes, values them
 * with the price provider, and decides whether a rebalance toward a target allocation is
 * required. It never executes — it only produces a {RebalanceAction} for the Trader Agent.
 */
export class PortfolioAgent {
  constructor(
    private readonly notes: NotesRepository,
    private readonly portfolio: PortfolioRepository,
    private readonly prices: PriceProvider,
    private readonly logger: Logger,
  ) {}

  /** Value the owner's available notes per asset and persist a snapshot. */
  async snapshot(owner: string): Promise<PortfolioSnapshot> {
    const notes = (await this.notes.list(1000, owner.toLowerCase())).filter((n) => n.state === "AVAILABLE");
    const byAsset = new Map<number, bigint>();
    for (const n of notes) {
      const id = Number(n.assetId);
      byAsset.set(id, (byAsset.get(id) ?? 0n) + BigInt(n.value));
    }

    const positions: PortfolioPosition[] = [];
    let totalValueUsd = 0;
    for (const [assetId, total] of byAsset) {
      const info = assetById(assetId);
      if (!info) continue;
      const human = toHuman(total, info.decimals);
      const price = await this.prices.getPriceUsd(info.symbol);
      const valueUsd = human * price;
      totalValueUsd += valueUsd;
      positions.push({ symbol: info.symbol, assetId, amount: total.toString(), valueUsd, weight: 0 });
    }
    for (const p of positions) p.weight = totalValueUsd > 0 ? p.valueUsd / totalValueUsd : 0;
    positions.sort((a, b) => b.valueUsd - a.valueUsd);

    const snapshot: PortfolioSnapshot = { totalValueUsd, positions, takenAt: new Date().toISOString() };
    await this.portfolio.saveSnapshot({
      id: `snap_${randomUUID()}`,
      owner: owner.toLowerCase(),
      totalValueUsd: totalValueUsd.toString(),
      positions: positions as unknown[],
      takenAt: snapshot.takenAt,
    });
    return snapshot;
  }

  async setTarget(owner: string, target: PortfolioTarget): Promise<void> {
    await this.portfolio.setTarget(owner.toLowerCase(), target.allocations);
  }

  async getTarget(owner: string): Promise<PortfolioTarget | null> {
    const allocations = await this.portfolio.getTarget(owner.toLowerCase());
    return allocations ? { allocations } : null;
  }

  /**
   * Compute the single most-impactful rebalance action toward `target` (MVP: one hop from
   * the most over-weight asset into the most under-weight asset, above a 5% band).
   */
  async decideRebalance(owner: string, target: PortfolioTarget, bandPct = 0.05): Promise<RebalanceAction[]> {
    const snap = await this.snapshot(owner);
    if (snap.totalValueUsd <= 0) return [];

    const currentUsd = new Map<string, number>();
    for (const p of snap.positions) currentUsd.set(p.symbol.toUpperCase(), p.valueUsd);

    let over: { symbol: string; deltaUsd: number } | null = null; // deltaUsd>0 = excess to sell
    let under: { symbol: string; deltaUsd: number } | null = null; // deltaUsd>0 = shortfall to buy
    for (const [symbol, weight] of Object.entries(target.allocations)) {
      const sym = symbol.toUpperCase();
      const desiredUsd = weight * snap.totalValueUsd;
      const haveUsd = currentUsd.get(sym) ?? 0;
      const excess = haveUsd - desiredUsd;
      if (excess > 0 && (!over || excess > over.deltaUsd)) over = { symbol: sym, deltaUsd: excess };
      if (excess < 0 && (!under || -excess > under.deltaUsd)) under = { symbol: sym, deltaUsd: -excess };
    }

    if (!over || !under) return [];
    const tradeUsd = Math.min(over.deltaUsd, under.deltaUsd);
    if (tradeUsd < bandPct * snap.totalValueUsd) return [];

    const inInfo = assetBySymbol(over.symbol);
    if (!inInfo) return [];
    const priceIn = await this.prices.getPriceUsd(over.symbol);
    if (priceIn <= 0) return [];
    const amount = toBase(tradeUsd / priceIn, inInfo.decimals);

    this.logger.info("portfolio rebalance proposed", { owner, from: over.symbol, to: under.symbol, tradeUsd });
    return [
      {
        assetIn: over.symbol,
        assetOut: under.symbol,
        amount,
        reason: `rebalance ${over.symbol}→${under.symbol} (~$${tradeUsd.toFixed(2)}) toward target`,
      },
    ];
  }
}
