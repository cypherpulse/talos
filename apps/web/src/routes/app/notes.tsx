import { createFileRoute, Link } from "@tanstack/react-router";
import { Boxes, Coins } from "lucide-react";

import { useNotes } from "@/lib/talos/hooks";
import { useWallet } from "@/lib/talos/wallet";
import { assetById, formatAssetAmount, shieldedBalances, useAssets } from "@/lib/talos/assets";
import { formatTime } from "@/lib/talos/format";
import { AssetLogo } from "@/components/talos/asset-logo";
import { EmptyState, ErrorState, HashChip, SectionLabel, StatusPill } from "@/components/talos/primitives";
import { GlassCard, PageHeader } from "@/components/talos/ui";

export const Route = createFileRoute("/app/notes")({
  component: NotesPage,
});

function NotesPage() {
  const { address } = useWallet();
  const query = useNotes();
  const { assets } = useAssets();
  const notes = query.data ?? [];
  const available = notes.filter((n) => n.state === "AVAILABLE");
  const balances = shieldedBalances(available, assets);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Private notes"
        description="Your shielded notes on X Layer — each is a private commitment, not a public balance."
        actions={
          <Link
            to="/app/shield"
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-strong"
          >
            <Coins className="size-4" /> Shield
          </Link>
        }
      />

      {!address ? (
        <GlassCard>
          <EmptyState
            title="Connect your wallet"
            description="Connect a wallet (top-right) to view the private notes scoped to your address."
          />
        </GlassCard>
      ) : query.isError ? (
        <GlassCard>
          <ErrorState message={String(query.error)} onRetry={() => void query.refetch()} />
        </GlassCard>
      ) : (
        <>
          {/* Per-asset shielded balance */}
          {balances.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {balances.map(({ asset, total, count }) => (
                <GlassCard key={asset.assetId} className="flex items-center gap-3">
                  <AssetLogo asset={asset} size={38} />
                  <div className="min-w-0">
                    <p className="text-lg font-semibold text-foreground">{formatAssetAmount(total, asset)}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {asset.symbol} · {count} {count === 1 ? "note" : "notes"}
                    </p>
                  </div>
                </GlassCard>
              ))}
            </div>
          ) : null}

          {/* All notes */}
          <GlassCard>
            <SectionLabel>All notes ({notes.length})</SectionLabel>
            <div className="mt-4">
              {query.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading notes…</p>
              ) : notes.length === 0 ? (
                <EmptyState title="No private notes yet" description="Shield an asset to create your first private note." />
              ) : (
                <div className="grid gap-2.5 sm:grid-cols-2">
                  {notes.map((n) => {
                    const asset = assetById(assets, n.assetId);
                    return (
                      <div key={n.id} className="glass-2 rounded-xl px-3.5 py-3">
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-2 text-base font-semibold text-foreground">
                            <AssetLogo asset={asset} size={20} />
                            {formatAssetAmount(n.value, asset)}
                            <span className="mono text-[11px] text-muted-foreground">{asset.symbol}</span>
                          </span>
                          <StatusPill status={n.state} label={n.state.toLowerCase()} />
                        </div>
                        <div className="mt-2 flex items-center justify-between">
                          <span className="mono text-[11px] text-muted-foreground">
                            {n.leafIndex !== null ? `leaf #${n.leafIndex}` : "pending"} · {formatTime(n.createdAt)}
                          </span>
                          <HashChip value={n.commitment} head={6} tail={4} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </GlassCard>
        </>
      )}
    </div>
  );
}
