import type { OperationStatus } from "./types";

export const ASSET_DECIMALS = 6;
export const ASSET_SYMBOL = "TEST_USDC";
export const MAX_VALUE = (1n << 128n) - 1n;

/** Format an integer base-unit string into human units. */
export function formatUnits(base: string | bigint, decimals = ASSET_DECIMALS): string {
  let v: bigint;
  try {
    v = typeof base === "bigint" ? base : BigInt(base || "0");
  } catch {
    return "0";
  }
  const neg = v < 0n;
  if (neg) v = -v;
  const d = 10n ** BigInt(decimals);
  const whole = v / d;
  const frac = (v % d).toString().padStart(decimals, "0").replace(/0+$/, "");
  const wholeStr = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${neg ? "-" : ""}${wholeStr}${frac ? `.${frac}` : ""}`;
}

/** Parse human units into an integer base-unit string. Returns null when invalid. */
export function parseUnits(input: string, decimals = ASSET_DECIMALS): string | null {
  const trimmed = input.trim();
  if (!/^\d*(\.\d*)?$/.test(trimmed) || trimmed === "" || trimmed === ".") return null;
  const [whole, frac = ""] = trimmed.split(".");
  if (frac.length > decimals) return null;
  const base = BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt(frac.padEnd(decimals, "0") || "0");
  return base.toString();
}

export function isValidValue(base: string): boolean {
  try {
    const v = BigInt(base);
    return v > 0n && v < 1n << 128n;
  } catch {
    return false;
  }
}

export function truncateMiddle(value: string, head = 6, tail = 4): string {
  if (!value) return "";
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

export function isAddress(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(value.trim());
}

export const STATUS_LABELS: Record<OperationStatus, string> = {
  CREATED: "Created",
  VALIDATING: "Validating",
  PROVING: "Generating zero-knowledge proof…",
  PROOF_READY: "Proof ready",
  READY_TO_SUBMIT: "Ready to submit",
  SUBMITTING: "Submitting to X Layer",
  SUBMITTED: "Submitting to X Layer",
  CONFIRMING: "Confirming on X Layer",
  CONFIRMED: "Finalized",
  FINALIZED: "Finalized",
  REJECTED: "Rejected by Talos Guard",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
  EXPIRED: "Expired",
};

export function statusLabel(status: OperationStatus | string): string {
  return STATUS_LABELS[status as OperationStatus] ?? String(status);
}

export function formatTime(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
