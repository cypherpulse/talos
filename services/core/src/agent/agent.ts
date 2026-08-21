import type { Logger } from "../observability/logger.js";
import type { LLMMessage, LLMProvider } from "./llm.js";
import { TOOL_HANDLERS, TOOL_SCHEMAS, type ToolContext } from "./tools.js";

/** Strict agent system instruction (Phase 5 §16). */
export const TALOS_SYSTEM_PROMPT = `You are a Talos privacy-preserving asset management agent.
You may only perform blockchain actions through Talos tools.
You do not have direct blockchain or private-key access.
Never invent transaction results. Never claim an operation succeeded until Talos reports confirmation.
Respect Talos Guard decisions. If an operation is rejected, do not attempt to bypass the policy.
If approval is required, stop and request approval.
Use the available Talos tools rather than inventing unsupported operations.
Never reveal note secrets, nonces, nullifier secrets, or witness data.`;

export interface AgentStep {
  tool: string;
  arguments: Record<string, unknown>;
  result: unknown;
}

export interface AgentResult {
  reply: string;
  steps: AgentStep[];
}

/**
 * TalosAgent (Phase 5 §4, §17): a simple, reliable tool-calling loop. The LLM proposes
 * tool calls; the agent executes them (mutations flow through the Guard inside the
 * tools) and feeds results back until the LLM returns a final answer. There is no
 * planning graph and no path to arbitrary blockchain execution.
 */
export class TalosAgent {
  constructor(
    private readonly llm: LLMProvider,
    private readonly ctx: ToolContext,
    private readonly logger: Logger,
    private readonly maxSteps = 6,
  ) {}

  async handle(userMessage: string): Promise<AgentResult> {
    const messages: LLMMessage[] = [{ role: "user", content: userMessage }];
    const steps: AgentStep[] = [];

    for (let i = 0; i < this.maxSteps; i++) {
      const resp = await this.llm.generate(TALOS_SYSTEM_PROMPT, messages, TOOL_SCHEMAS);

      if (!resp.toolCall) return { reply: resp.text ?? "", steps };

      const { name, arguments: args } = resp.toolCall;
      const handler = TOOL_HANDLERS[name];
      // Only known Talos tools exist — there is no arbitrary-RPC handler (§7).
      const result = handler ? await handler(args, this.ctx) : { error: `unknown tool: ${name}` };

      this.logger.info("agent tool call", { tool: name, hasResult: result != null });
      messages.push({ role: "assistant", content: `Calling ${name}`, toolName: name });
      messages.push({ role: "tool", content: JSON.stringify(result), toolName: name });
      steps.push({ tool: name, arguments: args, result });
    }

    return { reply: "I reached the maximum number of reasoning steps without completing the request.", steps };
  }
}
