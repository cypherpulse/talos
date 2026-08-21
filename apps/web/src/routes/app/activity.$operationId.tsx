import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import { useOperation } from "@/lib/talos/hooks";
import { formatTime, statusLabel } from "@/lib/talos/format";
import { ErrorState, HashChip, SectionLabel, StatusPill } from "@/components/talos/primitives";
import { OperationTracker } from "@/components/talos/operation-tracker";
import { GlassCard, PageHeader } from "@/components/talos/ui";

export const Route = createFileRoute("/app/activity/$operationId")({
  component: OperationDetail,
});

function titleCase(t: string): string {
  return t.charAt(0) + t.slice(1).toLowerCase();
}

function OperationDetail() {
  const { operationId } = Route.useParams();
  const { data, isError, error, refetch } = useOperation(operationId);

  return (
    <div className="space-y-6">
      <div>
        <Link
          to="/app/activity"
          className="mb-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary"
        >
          <ArrowLeft className="size-3.5" /> Activity
        </Link>
        <PageHeader
          title={data ? `${titleCase(data.type)} operation` : "Operation"}
          description="Public execution details. Private note secrets are never shown."
        />
      </div>

      {isError ? (
        <ErrorState message={String(error)} onRetry={() => void refetch()} />
      ) : (
        <>
          <OperationTracker operationId={operationId} title={data ? titleCase(data.type) : "Operation"} />

          {data ? (
            <GlassCard>
              <SectionLabel>Details</SectionLabel>
              <dl className="mt-4 grid gap-x-8 gap-y-3 sm:grid-cols-2">
                <Row label="Operation id" mono>{data.operationId}</Row>
                <Row label="Type">{titleCase(data.type)}</Row>
                <Row label="Status"><StatusPill status={data.status} /></Row>
                <Row label="Protocol action">{statusLabel(data.status)}</Row>
                <Row label="Created">{formatTime(data.createdAt)}</Row>
                <Row label="Updated">{formatTime(data.updatedAt)}</Row>
                {data.txHash ? (
                  <Row label="Transaction"><HashChip value={data.txHash} kind="tx" /></Row>
                ) : null}
                {data.errorCode ? <Row label="Error">{data.errorCode}</Row> : null}
              </dl>

              {data.result && Object.keys(data.result).length > 0 ? (
                <div className="mt-5 rounded-xl border border-border bg-background/40 p-4">
                  <p className="mono mb-2 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                    Result
                  </p>
                  <pre className="mono overflow-x-auto text-[11px] leading-relaxed text-muted-foreground">
                    {JSON.stringify(data.result, null, 2)}
                  </pre>
                </div>
              ) : null}
            </GlassCard>
          ) : null}
        </>
      )}
    </div>
  );
}

function Row({ label, children, mono }: { label: string; children: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={mono ? "mono text-sm break-all text-foreground" : "text-sm text-foreground"}>{children}</dd>
    </div>
  );
}
