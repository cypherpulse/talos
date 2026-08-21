import type {
  AgentMessageResponse,
  AssetsResponse,
  ChainStatus,
  DepositPrepareResponse,
  GuardDecisionRecord,
  GuardIdentity,
  GuardResult,
  NotePublic,
  OperationAck,
  OperationType,
  OperationView,
  TransactionRecord,
} from "./types";

export const API_BASE_URL: string = (
  (import.meta.env["VITE_TALOS_API_BASE_URL"] as string | undefined) ?? "http://localhost:3000"
).replace(/\/+$/, "");

export const EXPLORER_URL: string = (
  (import.meta.env["VITE_XLAYER_EXPLORER_URL"] as string | undefined) ??
  "https://www.oklink.com/xlayer"
).replace(/\/+$/, "");

export const CHAIN_ID = Number(import.meta.env["VITE_CHAIN_ID"] ?? 195);

export function explorerTxUrl(txHash: string): string {
  return `${EXPLORER_URL}/tx/${txHash}`;
}

export function explorerAddressUrl(address: string): string {
  return `${EXPLORER_URL}/address/${address}`;
}

export class TalosApiError extends Error {
  code: string;
  status: number;
  details?: Record<string, unknown> | undefined;

  constructor(code: string, message: string, status: number, details?: Record<string, unknown>) {
    super(message);
    this.name = "TalosApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

type RequestOptions = {
  method?: string;
  body?: unknown;
  idempotencyKey?: string | undefined;
  signal?: AbortSignal | undefined;
};

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, idempotencyKey, signal } = options;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;

  const init: RequestInit = { method, headers };
  if (signal) init.signal = signal;
  if (body !== undefined) init.body = JSON.stringify(body);

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, init);
  } catch {
    throw new TalosApiError(
      "NETWORK_ERROR",
      "Cannot reach the Talos API. Check that the service is running and reachable.",
      0,
    );
  }

  const text = await res.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!res.ok) {
    const err = (payload as { error?: { code?: string; message?: string; details?: Record<string, unknown> } })
      ?.error;
    throw new TalosApiError(
      err?.code ?? `HTTP_${res.status}`,
      err?.message ?? `Request failed with status ${res.status}`,
      res.status,
      err?.details,
    );
  }

  return payload as T;
}

export function newIdempotencyKey(): string {
  return `talos-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export const talosApi = {
  health: () => request<{ status: string }>("/health"),
  ready: () =>
    request<{ ready: boolean; checks: { chain: boolean; artifacts: boolean; pool: boolean } }>(
      "/ready",
    ),
  status: () => request<ChainStatus>("/api/v1/status"),
  merkleRoot: () => request<{ root: string }>("/api/v1/merkle/root"),

  notes: (owner?: string) =>
    request<{ notes: NotePublic[] }>(`/api/v1/notes${owner ? `?owner=${owner}` : ""}`),
  note: (id: string) => request<NotePublic>(`/api/v1/notes/${id}`),
  operation: (id: string) => request<OperationView>(`/api/v1/operations/${id}`),
  transaction: (id: string) => request<TransactionRecord>(`/api/v1/transactions/${id}`),

  assets: () => request<AssetsResponse>("/api/v1/assets"),

  deposit: (body: { amount: string; assetId?: number }, key?: string) =>
    request<OperationAck>("/api/v1/deposits", { method: "POST", body, idempotencyKey: key }),
  depositPrepare: (body: { assetId: number; amount: string; owner?: string }, key?: string) =>
    request<DepositPrepareResponse>("/api/v1/deposits/prepare", { method: "POST", body, idempotencyKey: key }),
  depositConfirm: (operationId: string, txHash: string) =>
    request<OperationView>(`/api/v1/deposits/${operationId}/confirm`, { method: "POST", body: { txHash } }),
  split: (body: { noteId: string; amount1: string; amount2: string }, key?: string) =>
    request<OperationAck>("/api/v1/splits", { method: "POST", body, idempotencyKey: key }),
  merge: (body: { noteId1: string; noteId2: string }, key?: string) =>
    request<OperationAck>("/api/v1/merges", { method: "POST", body, idempotencyKey: key }),
  transfer: (
    body: { noteId: string; amount1: string; amount2: string; recipientOwnerPubKey: string },
    key?: string,
  ) => request<OperationAck>("/api/v1/transfers", { method: "POST", body, idempotencyKey: key }),
  withdraw: (body: { noteId: string; recipient: string }, key?: string) =>
    request<OperationAck>("/api/v1/withdrawals", { method: "POST", body, idempotencyKey: key }),

  guardIdentity: () => request<GuardIdentity>("/guard/identity"),
  guardDecisions: () => request<{ decisions: GuardDecisionRecord[] }>("/guard/decisions"),
  guardEvaluate: (body: { operation: OperationType; params: Record<string, unknown> }) =>
    request<{ decision: string; reason: string }>("/guard/evaluate", { method: "POST", body }),
  guardExecute: (body: { operation: OperationType; params: Record<string, unknown> }, key?: string) =>
    request<GuardResult>("/guard/execute", { method: "POST", body, idempotencyKey: key }),
  guardApprove: (id: string) =>
    request<GuardResult>(`/guard/operations/${id}/approve`, { method: "POST" }),
  guardOperation: (id: string) => request<OperationView>(`/guard/operations/${id}`),

  agentMessage: (body: { message: string }) =>
    request<AgentMessageResponse>("/agent/message", { method: "POST", body }),
};

export function errorMessage(error: unknown): string {
  if (error instanceof TalosApiError) return `${error.code}: ${error.message}`;
  if (error instanceof Error) return error.message;
  return "Unexpected error";
}
