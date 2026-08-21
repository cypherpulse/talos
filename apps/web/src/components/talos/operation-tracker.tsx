import { Link } from "@tanstack/react-router";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";

import { HashChip, Panel, StatusPill } from "@/components/talos/primitives";
import { useOperation } from "@/lib/talos/hooks";
import { statusLabel } from "@/lib/talos/format";
import { errorMessage } from "@/lib/talos/api";
import { TERMINAL_FAILURE, isTerminal } from "@/lib/talos/types";

const STAGES = [
  { key: "VALIDATING", label: "Validating" },
  { key: "PROVING", label: "Generating proof" },
  { key: "SUBMITTING", label: "Submitting" },
  { key: "CONFIRMING", label: "Confirming" },
  { key: "FINALIZED", label: "Finalized" },
] as const;

const ORDER: Record<string, number> = {
  CREATED: 0,
  VALIDATING: 0,
  PROVING: 1,
  PROOF_READY: 1,
  READY_TO_SUBMIT: 2,
  SUBMITTING: 2,
  SUBMITTED: 2,
  CONFIRMING: 3,
  CONFIRMED: 4,
  FINALIZED: 4,
};

export function OperationTracker({
  operationId,
  title = "Operation",
}: {
  operationId: string;
  title?: string;
}) {
  const { data, isLoading, isError, error } = useOperation(operationId);
  const status = data?.status;
  const failed = status ? TERMINAL_FAILURE.includes(status) : false;
  const done = status === "FINALIZED";
  const stageIndex = status ? (ORDER[status] ?? 0) : 0;

  return (
    <Panel className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-foreground">{title}</p>
          <p className="mono mt-1 text-xs text-muted-foreground">{operationId}</p>
        </div>
        {status ? <StatusPill status={status} /> : null}
      </div>

      {isLoading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading operation…
        </p>
      ) : null}

      {isError ? (
        <p className="mono text-xs text-destructive">{errorMessage(error)}</p>
      ) : null}

      {data ? (
        <>
          <ol className="grid gap-2 sm:grid-cols-5">
            {STAGES.map((stage, i) => {
              const reached = !failed && stageIndex >= i;
              const active = !failed && stageIndex === i && !done;
              return (
                <li
                  key={stage.key}
                  className={[
                    "rounded-xl border px-3 py-2 text-center",
                    failed && i > stageIndex
                      ? "border-border bg-surface-2 text-muted-foreground"
                      : reached
                        ? "border-primary/35 bg-primary-soft text-primary"
                        : "border-border bg-surface-2 text-muted-foreground",
                  ].join(" ")}
                >
                  <p className="mono text-[10px] uppercase tracking-[0.12em]">{stage.label}</p>
                  {active ? (
                    <Loader2 className="mx-auto mt-1 size-3 animate-spin" aria-hidden />
                  ) : null}
                </li>
              );
            })}
          </ol>

          <p className="text-sm text-muted-foreground">{statusLabel(data.status)}</p>

          {data.txHash ? (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Transaction</span>
              <HashChip value={data.txHash} kind="tx" />
            </div>
          ) : null}

          {done ? (
            <p className="flex items-center gap-2 text-sm font-medium text-primary">
              <CheckCircle2 className="size-4" /> Private operation finalized ✓
            </p>
          ) : null}

          {failed ? (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3">
              <p className="flex items-center gap-2 text-sm font-medium text-destructive">
                <XCircle className="size-4" /> {statusLabel(data.status)}
              </p>
              {data.errorMessage ? (
                <p className="mono mt-1 text-xs text-muted-foreground">
                  {data.errorCode ? `${data.errorCode}: ` : ""}
                  {data.errorMessage}
                </p>
              ) : null}
            </div>
          ) : null}

          {isTerminal(data.status) ? (
            <Link
              to="/app/activity/$operationId"
              params={{ operationId }}
              className="inline-block text-xs text-muted-foreground underline-offset-4 hover:text-primary hover:underline"
            >
              View operation details →
            </Link>
          ) : null}
        </>
      ) : null}
    </Panel>
  );
}
