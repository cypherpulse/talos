/**
 * LLM provider abstraction (Phase 5 §5). `generate` returns either a tool call or a
 * final text. Two implementations: a deterministic rule-based provider (default; used
 * for the demo and tests, no network) and a real Anthropic provider (used when
 * configured). The provider is never hardcoded — it is chosen by config.
 */

export interface ToolSchema {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface LLMMessage {
  role: "user" | "assistant" | "tool";
  content: string;
  toolName?: string;
}

export interface LLMResponse {
  toolCall?: ToolCall;
  text?: string;
}

export interface LLMProvider {
  readonly name: string;
  generate(system: string, messages: LLMMessage[], tools: ToolSchema[]): Promise<LLMResponse>;
}

const num = (s: string): string[] => (s.match(/\d[\d,]*/g) ?? []).map((x) => x.replace(/,/g, ""));
const addr = (s: string): string | null => s.match(/0x[0-9a-fA-F]{40}/)?.[0] ?? null;
const field = (s: string): string | null => s.match(/pubkey[:\s]+(\d{5,})/i)?.[1] ?? null;

/**
 * Deterministic, network-free provider. Maps a natural-language request to a single
 * Talos tool call, then summarizes the tool result for the user. It can ONLY produce
 * calls to the known Talos tools — it cannot invent RPC or bypass the Guard.
 */
export class RuleBasedProvider implements LLMProvider {
  readonly name = "rule-based";

  async generate(_system: string, messages: LLMMessage[], _tools: ToolSchema[]): Promise<LLMResponse> {
    const last = messages[messages.length - 1]!;
    if (last.role === "tool") return { text: this.summarize(last.toolName ?? "operation", last.content) };

    const text = last.content.toLowerCase();
    const numbers = num(text);

    if (/\bsplit\b/.test(text) && numbers.length >= 2) {
      // Use the LAST two numbers — the split amounts (e.g. "...into 60 and 40").
      return { toolCall: { name: "split", arguments: { amount1: numbers[numbers.length - 2], amount2: numbers[numbers.length - 1] } } };
    }
    if (/\bmerge\b/.test(text)) return { toolCall: { name: "merge", arguments: {} } };
    if (/\bwithdraw\b/.test(text)) {
      const args: Record<string, unknown> = {};
      const r = addr(text);
      if (r) args.recipient = r;
      if (numbers[0]) args.amount = numbers[0];
      return { toolCall: { name: "withdraw", arguments: args } };
    }
    if (/\b(transfer|send)\b/.test(text) && numbers.length >= 1) {
      const args: Record<string, unknown> = { amount: numbers[0] };
      const p = field(text);
      if (p) args.recipientOwnerPubKey = p;
      return { toolCall: { name: "transfer", arguments: args } };
    }
    if (/\bdeposit\b/.test(text) && numbers.length >= 1) {
      return { toolCall: { name: "deposit", arguments: { amount: numbers[0] } } };
    }
    if (/\b(balance|holdings|how much)\b/.test(text)) return { toolCall: { name: "getBalance", arguments: {} } };
    return { toolCall: { name: "getNotes", arguments: {} } };
  }

  private summarize(tool: string, content: string): string {
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(content);
    } catch {
      return content;
    }
    if (data.decision === "REJECTED") return `Talos Guard rejected the ${tool}: ${data.reason}. No transaction was created.`;
    if (data.decision === "APPROVAL_REQUIRED") return `The ${tool} requires human approval (approval id ${data.guardOperationId}); I have not executed it.`;
    if (typeof data.status === "string") {
      const tx = data.txHash ? `, tx ${data.txHash}` : "";
      return `The ${tool} is ${data.status}${tx}.`;
    }
    return `Result of ${tool}: ${content}`;
  }
}

/** Real Anthropic Messages API provider (used when LLM_PROVIDER=anthropic). */
export class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic";
  constructor(private readonly apiKey: string, private readonly model: string) {}

  async generate(system: string, messages: LLMMessage[], tools: ToolSchema[]): Promise<LLMResponse> {
    const body = {
      model: this.model,
      max_tokens: 1024,
      system,
      tools: tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters })),
      messages: messages
        .filter((m) => m.role !== "tool")
        .map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content })),
    };
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": this.apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as { content: Array<{ type: string; name?: string; input?: Record<string, unknown>; text?: string }> };
    const toolUse = data.content.find((c) => c.type === "tool_use");
    if (toolUse?.name) return { toolCall: { name: toolUse.name, arguments: toolUse.input ?? {} } };
    return { text: data.content.find((c) => c.type === "text")?.text ?? "" };
  }
}

export function createLLMProvider(env: NodeJS.ProcessEnv = process.env): LLMProvider {
  const provider = (env.LLM_PROVIDER ?? "rule-based").toLowerCase();
  if (provider === "anthropic" && env.LLM_API_KEY) {
    return new AnthropicProvider(env.LLM_API_KEY, env.LLM_MODEL ?? "claude-sonnet-5");
  }
  return new RuleBasedProvider();
}
