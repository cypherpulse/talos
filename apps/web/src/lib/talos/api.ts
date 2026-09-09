import type {
  Agent,
  AgentMemory,
  AgentMessageResponse,
  AgentRole,
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
  OrchestrationResult,
  PortfolioPosition,
  PortfolioSnapshot,
  Quote,
  ReceiveIdentity,
  ResearchResult,
  TradeExecution,
  TradeResult,
  TransactionRecord,
} from "./types";

export const API_BASE_URL: string = (
  (import.meta.env["VITE_TALOS_API_BASE_URL"] as string | undefined) ??
  "https://talos-c4wi.onrender.com"
).replace(/\/+$/, "");

export const EXPLORER_URL: string = (
  (import.meta.env["VITE_XLAYER_EXPLORER_URL"] as string | undefined) ??
  "https://www.okx.com/web3/explorer/xlayer-test"
).replace(/\/+$/, "");

// X Layer testnet chain id is 1952 (the /terigon RPC reports 1952).
export const CHAIN_ID = Number(import.meta.env["VITE_CHAIN_ID"] ?? 1952);

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
  generateKey: () =>
    request<{ spendingKey: string; ownerPublicKey: string }>("/api/v1/keys/generate", { method: "POST" }),

  deposit: (body: { amount: string; assetId?: number }, key?: string) =>
    request<OperationAck>("/api/v1/deposits", { method: "POST", body, idempotencyKey: key }),
  depositPrepare: (
    body: { assetId: number; amount: string; owner?: string; commitment?: string; ownerPublicKey?: string },
    key?: string,
  ) => request<DepositPrepareResponse>("/api/v1/deposits/prepare", { method: "POST", body, idempotencyKey: key }),
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
  // B4 client-side spend proving.
  notePath: (id: string) =>
    request<{ root: string; pathElements: string[]; pathIndices: number[]; leafIndex: number | null }>(
      `/api/v1/notes/${id}/path`,
    ),
  withdrawSubmit: (
    body: { noteId: string; recipient: string; root: string; nullifier: string; proof: string[] },
    key?: string,
  ) => request<OperationView>("/api/v1/withdrawals/submit", { method: "POST", body, idempotencyKey: key }),
  spendSubmit: (
    op: "splits" | "transfers" | "merges",
    body: {
      inputNoteIds: string[];
      root: string;
      nullifiers: string[];
      outCommitments: string[];
      outputs: { commitment: string; assetId: string; value: string; ownerPubKey: string; mine: boolean }[];
      owner?: string;
      proof: string[];
    },
    key?: string,
  ) => request<OperationView>(`/api/v1/${op}/submit`, { method: "POST", body, idempotencyKey: key }),

  guardIdentity: () => request<GuardIdentity>("/guard/identity"),
  guardDecisions: () => request<{ decisions: GuardDecisionRecord[] }>("/guard/decisions"),
  guardEvaluate: (body: { operation: OperationType; params: Record<string, unknown> }) =>
    request<{ decision: string; reason: string }>("/guard/evaluate", { method: "POST", body }),
  guardExecute: (body: { operation: OperationType; params: Record<string, unknown> }, key?: string) =>
    request<GuardResult>("/guard/execute", { method: "POST", body, idempotencyKey: key }),
  guardApprove: (id: string) =>
    request<GuardResult>(`/guard/operations/${id}/approve`, { method: "POST" }),
  guardOperation: (id: string) => request<OperationView>(`/guard/operations/${id}`),

  agentMessage: (body: { message: string; owner?: string }) =>
    request<AgentMessageResponse>("/agent/message", { method: "POST", body }),

  // ---- Phase 6: multi-agent trading ----
  agents: (owner: string) => request<{ agents: Agent[] }>(`/api/v1/agents?owner=${owner}`),
  createAgentWallet: (body: { owner: string; role: AgentRole; name?: string }) =>
    request<Agent>("/api/v1/agents", { method: "POST", body }),
  agent: (id: string) => request<Agent>(`/api/v1/agents/${id}`),
  receiveIdentity: (id: string) => request<ReceiveIdentity>(`/api/v1/agents/${id}/receive-identity`),
  agentTransfer: (
    id: string,
    body: { owner: string; toAgentId?: string; toPublicKey?: string; assetId: number; amount: string },
  ) => request<{ operationId: string; status: string }>(`/api/v1/agents/${id}/transfer`, { method: "POST", body }),

  portfolio: (owner: string) => request<PortfolioSnapshot>(`/api/v1/portfolio?owner=${owner}`),
  portfolioHistory: (owner: string) =>
    request<{ snapshots: Array<{ totalValueUsd: string; positions: PortfolioPosition[]; takenAt: string }> }>(
      `/api/v1/portfolio/history?owner=${owner}`,
    ),
  setTarget: (body: { owner: string; allocations: Record<string, number> }) =>
    request<{ ok: boolean; allocations: Record<string, number> }>("/api/v1/portfolio/target", { method: "POST", body }),

  research: (asset: string) => request<ResearchResult>("/api/v1/research", { method: "POST", body: { asset } }),

  tradeQuote: (body: { assetIn: string; assetOut: string; amount: string; slippageBps?: number }) =>
    request<Quote>("/api/v1/trades/quote", { method: "POST", body }),
  createTrade: (body: { owner: string; assetIn: string; assetOut: string; amount: string; maxSlippageBps?: number }) =>
    request<TradeResult>("/api/v1/trades", { method: "POST", body }),
  trades: (owner: string) => request<{ trades: TradeExecution[] }>(`/api/v1/trades?owner=${owner}`),
  trade: (id: string) => request<TradeExecution>(`/api/v1/trades/${id}`),
  approveTrade: (id: string) => request<TradeResult>(`/api/v1/trades/${id}/approve`, { method: "POST" }),

  orchestrate: (body: { owner: string; message: string }) =>
    request<OrchestrationResult>("/api/v1/orchestrate", { method: "POST", body }),

  agentMemory: (owner: string) =>
    request<{ count: number; memories: AgentMemory[] }>(`/api/v1/agents/memory?owner=${owner}`),
  forgetMemory: (id: string) => request<{ ok: boolean }>(`/api/v1/agents/memory/${id}`, { method: "DELETE" }),
  clearMemory: (owner: string) =>
    request<{ ok: boolean }>("/api/v1/agents/memory/clear", { method: "POST", body: { owner } }),
};

export function errorMessage(error: unknown): string {
  if (error instanceof TalosApiError) return `${error.code}: ${error.message}`;
  if (error instanceof Error) return error.message;
  return "Unexpected error";
}
