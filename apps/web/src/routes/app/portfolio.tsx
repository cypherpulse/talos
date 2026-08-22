import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PieChart, Target, TrendingUp } from "lucide-react";
import { useState } from "react";

import { talosApi, errorMessage } from "@/lib/talos/api";
import { useWallet } from "@/lib/talos/wallet";
import { useAssets } from "@/lib/talos/assets";
import { formatTime } from "@/lib/talos/format";
import { AssetLogo } from "@/components/talos/asset-logo";
import { EmptyState, ErrorState, SectionLabel } from "@/components/talos/primitives";
import { GlassCard, PageHeader } from "@/components/talos/ui";

export const Route = createFileRoute("/app/portfolio")({ component: PortfolioPage });

const usd = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function PortfolioPage() {
  const { address } = useWallet();
  const { assets } = useAssets();
  const queryClient = useQueryClient();

  const portfolio = useQuery({
    queryKey: ["talos", "portfolio", address],
    queryFn: () => talosApi.portfolio(address!),
    enabled: Boolean(address),
    refetchInterval: 10_000,
  });
  const history = useQuery({
    queryKey: ["talos", "portfolio-history", address],
    queryFn: () => talosApi.portfolioHistory(address!),
    enabled: Boolean(address),
  });

  const [stable, setStable] = useState(70);
  const okb = 100 - stable;
  const saveTarget = useMutation({
    mutationFn: () => talosApi.setTarget({ owner: address!, allocations: { USDC: stable / 100, OKB: okb / 100 } }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["talos", "portfolio", address] }),
  });

  if (!address) {
    return (
      <div className="space-y-6">
        <PageHeader title="Portfolio" description="Your private, shielded portfolio on X Layer." />
        <GlassCard>
          <EmptyState title="Connect your wallet" description="Connect to view your private portfolio." />
        </GlassCard>
      </div>
    );
  }

  const snap = portfolio.data;

  return (
    <div className="space-y-6">
      <PageHeader title="Portfolio" description="Your private, shielded portfolio — valued live, allocation managed by the Portfolio Agent." />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Total + allocation */}
        <GlassCard glow className="lg:col-span-2">
          {portfolio.isError ? (
            <ErrorState message={String(portfolio.error)} onRetry={() => void portfolio.refetch()} />
          ) : (
            <>
              <SectionLabel>Total private value</SectionLabel>
              <p className="mt-2 text-4xl font-semibold tracking-tight text-foreground">
                {snap ? usd(snap.totalValueUsd) : "—"}
              </p>

              {snap && snap.positions.length > 0 ? (
                <>
                  <div className="mt-5 flex h-2.5 gap-0.5 overflow-hidden rounded-full">
                    {snap.positions.map((p) => (
                      <span
                        key={p.assetId}
                        title={`${p.symbol} ${(p.weight * 100).toFixed(1)}%`}
                        className="h-full"
                        style={{ width: `${Math.max(2, p.weight * 100)}%`, background: colorFor(p.symbol) }}
                      />
                    ))}
                  </div>
                  <div className="mt-5 space-y-2">
                    {snap.positions.map((p) => {
                      const info = assets.find((a) => a.assetId === p.assetId);
                      return (
                        <div key={p.assetId} className="glass-2 flex items-center justify-between rounded-xl px-3.5 py-3">
                          <div className="flex items-center gap-3">
                            {info ? <AssetLogo asset={info} size={30} /> : null}
                            <div>
                              <p className="text-sm font-semibold text-foreground">{p.symbol}</p>
                              <p className="text-[11px] text-muted-foreground">{(p.weight * 100).toFixed(1)}% of portfolio</p>
                            </div>
                          </div>
                          <span className="text-sm font-semibold text-foreground">{usd(p.valueUsd)}</span>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <p className="mt-4 text-sm text-muted-foreground">No shielded positions yet. Shield or trade to build your portfolio.</p>
              )}
            </>
          )}
        </GlassCard>

        {/* Target allocation */}
        <GlassCard className="h-fit">
          <SectionLabel>
            <span className="inline-flex items-center gap-1.5">
              <Target className="size-3.5" /> Target allocation
            </span>
          </SectionLabel>
          <p className="mt-3 text-sm text-muted-foreground">
            Set a target the Portfolio Agent rebalances toward (via "rebalance" in AI Trading).
          </p>
          <div className="mt-4 space-y-3">
            <label className="block">
              <span className="text-xs text-muted-foreground">Stablecoins (USDC)</span>
              <div className="mt-1 flex items-center gap-3">
                <input type="range" min={0} max={100} step={5} value={stable} onChange={(e) => setStable(Number(e.target.value))} className="flex-1 accent-[var(--primary)]" />
                <span className="mono w-10 text-right text-sm text-foreground">{stable}%</span>
              </div>
            </label>
            <div className="flex items-center justify-between rounded-xl border border-border bg-surface/50 px-3.5 py-2.5 text-sm">
              <span className="text-muted-foreground">OKB</span>
              <span className="mono text-foreground">{okb}%</span>
            </div>
            <button
              type="button"
              onClick={() => saveTarget.mutate()}
              disabled={saveTarget.isPending}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-strong disabled:opacity-50"
            >
              <TrendingUp className="size-4" /> {saveTarget.isPending ? "Saving…" : "Save target"}
            </button>
            {saveTarget.isError ? <p className="mono text-xs text-destructive">{errorMessage(saveTarget.error)}</p> : null}
            {saveTarget.isSuccess ? <p className="text-xs text-primary">Target saved.</p> : null}
          </div>
        </GlassCard>
      </div>

      {/* History */}
      <GlassCard>
        <SectionLabel>
          <span className="inline-flex items-center gap-1.5">
            <PieChart className="size-3.5" /> Snapshots
          </span>
        </SectionLabel>
        <div className="mt-4">
          {(history.data?.snapshots ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No snapshots yet.</p>
          ) : (
            <div className="space-y-1.5">
              {(history.data?.snapshots ?? []).slice(0, 12).map((s, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg border border-border bg-surface/40 px-3.5 py-2 text-sm">
                  <span className="text-foreground">{usd(Number(s.totalValueUsd))}</span>
                  <span className="mono text-[11px] text-muted-foreground">{formatTime(s.takenAt)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </GlassCard>
    </div>
  );
}

function colorFor(symbol: string): string {
  const map: Record<string, string> = { USDC: "#2775CA", USDT: "#26A17B", USDG: "#C9A227", OKB: "var(--primary)" };
  return map[symbol.toUpperCase()] ?? "var(--primary)";
}
