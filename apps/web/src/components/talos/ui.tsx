import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";
import { useTrackedOperations } from "@/lib/talos/hooks";
import { ASSET_SYMBOL, formatUnits, truncateMiddle } from "@/lib/talos/format";
import type { NotePublic, OperationAck } from "@/lib/talos/types";
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

export function NoteSelect({
  notes,
  value,
  onChange,
  placeholder = "Select a note",
}: {
  notes: NotePublic[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(inputClass, "appearance-none")}
    >
      <option value="">{placeholder}</option>
      {notes.map((n) => (
        <option key={n.id} value={n.id}>
          {noteLabel(n)}
        </option>
      ))}
    </select>
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
