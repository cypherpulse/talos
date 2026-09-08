import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { formatDistanceToNowStrict } from "date-fns";

import { cn } from "@/lib/utils";
import { useTrackedOperations } from "@/lib/talos/hooks";
import { ASSET_SYMBOL, formatUnits, truncateMiddle } from "@/lib/talos/format";
import { assetById, formatAssetAmount, useAssets } from "@/lib/talos/assets";
import { AssetLogo } from "@/components/talos/asset-logo";
import type { NotePublic, NoteState, OperationAck } from "@/lib/talos/types";
import { errorMessage } from "@/lib/talos/api";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
        {description ? (
          <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions}
    </div>
  );
}

export function GlassCard({
  className,
  glow,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { glow?: boolean }) {
  return (
    <div
      className={cn(
        "glass card-hi rounded-2xl p-5",
        glow && "shadow-glow",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</span>
      {children}
      {hint ? <span className="mono mt-1.5 block text-[11px] text-muted-foreground">{hint}</span> : null}
    </label>
  );
}

const inputClass =
  "w-full rounded-xl border border-border bg-background/60 px-3.5 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-primary/20";

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(inputClass, props.className)} />;
}

export function AmountInput({
  value,
  onChange,
  placeholder = "0.00",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative">
      <input
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(inputClass, "pr-24")}
      />
      <span className="mono pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
        {ASSET_SYMBOL}
      </span>
    </div>
  );
}

export function noteLabel(n: NotePublic): string {
  return `${formatUnits(n.value)} ${ASSET_SYMBOL} · ${truncateMiddle(n.commitment, 6, 4)}${
    n.leafIndex !== null ? ` · #${n.leafIndex}` : ""
  }`;
}

const NOTE_STATE_STYLE: Record<NoteState, { label: string; cls: string }> = {
  AVAILABLE: { label: "Available", cls: "bg-primary/15 text-primary" },
  CREATED: { label: "Pending", cls: "bg-amber-500/15 text-amber-500" },
  PENDING_SPEND: { label: "Spending", cls: "bg-amber-500/15 text-amber-500" },
  LOCKED: { label: "Locked", cls: "bg-amber-500/15 text-amber-500" },
  SPENT: { label: "Spent", cls: "bg-muted text-muted-foreground" },
  INVALID: { label: "Invalid", cls: "bg-destructive/15 text-destructive" },
};

function relativeTime(iso: string): string {
  try {
    return `${formatDistanceToNowStrict(new Date(iso))} ago`;
  } catch {
    return "";
  }
}

/**
 * Rich, asset-aware note picker: a scrollable radio-list of note cards showing the value,
 * asset, commitment, tree index, state, and age — instead of a flat <select>. API-compatible
 * with the old component (notes / value / onChange). `disabledIds` greys out notes already
 * chosen elsewhere (e.g. the other input in a merge).
 */
export function NoteSelect({
  notes,
  value,
  onChange,
  placeholder = "No notes to select",
  disabledIds = [],
}: {
  notes: NotePublic[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  disabledIds?: string[];
}) {
  const { assets } = useAssets();

  if (notes.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-background/40 px-3.5 py-6 text-center text-xs text-muted-foreground">
        {placeholder}
      </div>
    );
  }

  return (
    <div
      role="radiogroup"
      className="max-h-72 space-y-2 overflow-y-auto rounded-xl border border-border bg-background/40 p-2"
    >
      {notes.map((n) => {
        const asset = assetById(assets, n.assetId);
        const selected = n.id === value;
        const disabled = disabledIds.includes(n.id) && !selected;
        const st = NOTE_STATE_STYLE[n.state] ?? NOTE_STATE_STYLE.AVAILABLE;
        return (
          <button
            key={n.id}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(n.id)}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
              selected
                ? "border-primary bg-primary/10 shadow-glow"
                : "border-border bg-surface/50 hover:border-primary/40 hover:bg-surface",
              disabled && "pointer-events-none opacity-40",
            )}
          >
            <AssetLogo asset={asset} size={30} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-1.5">
                <span className="truncate text-sm font-semibold text-foreground">
                  {formatAssetAmount(n.value, asset)}
                </span>
                <span className="text-xs text-muted-foreground">{asset.symbol}</span>
              </div>
              <div className="mono mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                <span className="truncate">{truncateMiddle(n.commitment, 6, 4)}</span>
                {n.leafIndex !== null ? <span className="shrink-0">#{n.leafIndex}</span> : null}
                <span className="shrink-0">· {relativeTime(n.createdAt)}</span>
              </div>
            </div>
            <span className={cn("shrink-0 rounded-md px-2 py-0.5 text-[10px] font-medium", st.cls)}>
              {st.label}
            </span>
            <span
              className={cn(
                "flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors",
                selected ? "border-primary bg-primary text-primary-foreground" : "border-border",
              )}
            >
              {selected ? <Check className="size-3.5" /> : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function SubmitButton({
  children,
  pending,
  disabled,
  onClick,
  type = "button",
}: {
  children: ReactNode;
  pending?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || pending}
      className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-all hover:bg-primary-strong disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : null}
      {children}
    </button>
  );
}

/**
 * Submit a mutating operation, track its id, and refresh notes. Returns the created
 * operation id so a caller can render an <OperationTracker />.
 */
export function useOperationSubmit() {
  const { track } = useTrackedOperations();
  const queryClient = useQueryClient();
  const [operationId, setOperationId] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (fn: () => Promise<OperationAck>) => fn(),
    onSuccess: (ack) => {
      setOperationId(ack.operationId);
      track(ack.operationId);
      void queryClient.invalidateQueries({ queryKey: ["talos", "notes"] });
    },
  });

  return {
    operationId,
    submit: (fn: () => Promise<OperationAck>) => mutation.mutate(fn),
    pending: mutation.isPending,
    error: mutation.error ? errorMessage(mutation.error) : null,
    reset: () => {
      setOperationId(null);
      mutation.reset();
    },
  };
}
