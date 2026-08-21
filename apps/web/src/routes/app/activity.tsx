import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import { useOperationList, useTrackedOperations } from "@/lib/talos/hooks";
import { formatTime } from "@/lib/talos/format";
import { EmptyState, HashChip, StatusPill } from "@/components/talos/primitives";
import { GlassCard, PageHeader } from "@/components/talos/ui";

export const Route = createFileRoute("/app/activity")({
  component: ActivityPage,
});

function titleCase(t: string): string {
  return t.charAt(0) + t.slice(1).toLowerCase();
}

function ActivityPage() {
  const { ids } = useTrackedOperations();
  const { data, isLoading } = useOperationList(ids);
  const ops = data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Activity"
        description="Live operation tracking — statuses update automatically until finalized."
      />

      <GlassCard className="p-0">
        {ids.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title="No operations yet"
              description="Shield, split, merge, transfer, or withdraw — your operations will appear here."
            />
          </div>
        ) : isLoading && ops.length === 0 ? (
          <p className="p-5 text-sm text-muted-foreground">Loading operations…</p>
        ) : (
          <ul className="divide-y divide-border">
            {ops.map((op) => (
              <li key={op.operationId}>
                <Link
                  to="/app/activity/$operationId"
                  params={{ operationId: op.operationId }}
                  className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-surface/50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">{titleCase(op.type)}</span>
                      <StatusPill status={op.status} />
                    </div>
                    <p className="mono mt-1 truncate text-[11px] text-muted-foreground">
                      {op.operationId} · {formatTime(op.updatedAt)}
                    </p>
                  </div>
                  {op.txHash ? <HashChip value={op.txHash} kind="tx" head={6} tail={4} /> : null}
                  <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </GlassCard>
    </div>
  );
}
