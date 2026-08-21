import { Check, Copy, ExternalLink } from "lucide-react";
import { useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";
import { explorerAddressUrl, explorerTxUrl } from "@/lib/talos/api";
import { statusLabel, truncateMiddle } from "@/lib/talos/format";
import type { GuardDecision, OperationStatus } from "@/lib/talos/types";

export function Panel({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-surface p-5 shadow-[0_18px_40px_-24px_rgba(0,0,0,0.9)]",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{children}</p>
  );
}

function statusTone(status: OperationStatus | string) {
  switch (status) {
    case "FINALIZED":
    case "CONFIRMED":
    case "APPROVED":
      return "border-primary/35 bg-primary-soft text-primary";
    case "REJECTED":
    case "FAILED":
    case "CANCELLED":
    case "EXPIRED":
      return "border-destructive/35 bg-destructive/10 text-destructive";
    case "APPROVAL_REQUIRED":
      return "border-approval/35 bg-approval/10 text-approval";
    default:
      return "border-border bg-surface-2 text-muted-foreground";
  }
}

export function StatusPill({
  status,
  label,
  className,
}: {
  status: OperationStatus | GuardDecision | string;
  label?: string;
  className?: string;
}) {
  const inProgress = !["FINALIZED", "CONFIRMED", "REJECTED", "FAILED", "CANCELLED", "EXPIRED", "APPROVED", "APPROVAL_REQUIRED"].includes(
    status,
  );
  return (
    <span
      className={cn(
        "mono inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] uppercase tracking-wider",
        statusTone(status),
        className,
      )}
    >
      <span
        className={cn(
          "size-1.5 rounded-full bg-current",
          inProgress && "motion-safe:animate-pulse",
        )}
        aria-hidden
      />
      {label ?? statusLabel(status)}
    </span>
  );
}

export function CopyButton({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1400);
        });
      }}
      aria-label={label ?? "Copy value"}
      className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
    >
      {copied ? <Check className="size-3.5 text-primary" /> : <Copy className="size-3.5" />}
    </button>
  );
}

export function HashChip({
  value,
  kind = "hash",
  head = 8,
  tail = 6,
  className,
}: {
  value: string;
  kind?: "tx" | "address" | "hash";
  head?: number;
  tail?: number;
  className?: string;
}) {
  if (!value) return <span className="mono text-sm text-muted-foreground">—</span>;
  const href =
    kind === "tx" ? explorerTxUrl(value) : kind === "address" ? explorerAddressUrl(value) : null;
  return (
    <span
      className={cn(
        "mono inline-flex max-w-full items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2 py-1 text-xs text-foreground",
        className,
      )}
    >
      <span className="truncate">{truncateMiddle(value, head, tail)}</span>
      <CopyButton value={value} label="Copy" />
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer noopener"
          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-surface hover:text-primary"
          aria-label="View on X Layer Explorer"
        >
          <ExternalLink className="size-3.5" />
        </a>
      ) : null}
    </span>
  );
}

export function XLayerBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "mono inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-[11px] uppercase tracking-[0.14em] text-muted-foreground",
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-primary" aria-hidden />
      Built on X Layer
    </span>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-elevated px-6 py-12 text-center">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-2xl border border-destructive/30 bg-destructive/5 px-5 py-4">
      <p className="text-sm font-medium text-destructive">Something went wrong</p>
      <p className="mono mt-1 text-xs break-words text-muted-foreground">{message}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 rounded-lg border border-border px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-surface-2"
        >
          Try again
        </button>
      ) : null}
    </div>
  );
}
