/**
 * Phase 6 configuration. All external integrations are optional: when a key is absent
 * the corresponding provider falls back to a safe mock, so the multi-agent flow always
 * runs (demo/CI) and upgrades to real data simply by setting env vars.
 */

export interface OkxConfig {
  apiKey: string;
  secretKey: string;
  passphrase: string;
  baseUrl?: string;
  aggregatorPath?: string;
}

export interface AgentsConfig {
  /** Chain the trading provider operates on (OKX DEX). Defaults to the configured X Layer chain. */
  tradingChainId: number;
  okx?: OkxConfig;
  grok?: { apiKey: string; model: string; baseUrl: string };
  price: {
    provider: "coinmarketcap" | "coinbase" | "okx" | "mock";
    coinmarketcapApiKey?: string;
  };
  /** OpenAI-compatible embeddings for pgvector semantic memory (reuses the OpenAI key). */
  embeddings?: { apiKey: string; model: string; baseUrl: string; dimensions: number };
}

const clean = (v: string | undefined): string | undefined => {
  const t = v?.trim();
  return t ? t : undefined;
};

export function loadAgentsConfig(env: NodeJS.ProcessEnv = process.env): AgentsConfig {
  const okxKey = clean(env.OKX_API_KEY);
  const okxSecret = clean(env.OKX_SECRET_KEY);
  const okxPass = clean(env.OKX_PASSPHRASE);
  const grokKey = clean(env.GROK_API_KEY);
  const cmcKey = clean(env.COINMARKETCAP_API_KEY);

  const config: AgentsConfig = {
    tradingChainId: Number(env.TRADING_CHAIN_ID ?? env.X_LAYER_CHAIN_ID ?? 196),
    price: {
      provider:
        (clean(env.PRICE_PROVIDER) as AgentsConfig["price"]["provider"]) ??
        (cmcKey ? "coinmarketcap" : "okx"),
      ...(cmcKey ? { coinmarketcapApiKey: cmcKey } : {}),
    },
  };

  if (okxKey && okxSecret && okxPass) {
    config.okx = {
      apiKey: okxKey,
      secretKey: okxSecret,
      passphrase: okxPass,
      ...(clean(env.OKX_API_BASE_URL) ? { baseUrl: clean(env.OKX_API_BASE_URL) } : {}),
      ...(clean(env.OKX_DEX_AGGREGATOR_PATH) ? { aggregatorPath: clean(env.OKX_DEX_AGGREGATOR_PATH) } : {}),
    };
  }

  if (grokKey) {
    config.grok = {
      apiKey: grokKey,
      model: clean(env.GROK_MODEL) ?? "grok-2-latest",
      baseUrl: clean(env.GROK_API_BASE_URL) ?? "https://api.x.ai/v1",
    };
  }

  const embKey = clean(env.OPENAI_API_KEY) ?? clean(env.LLM_API_KEY);
  if (embKey) {
    config.embeddings = {
      apiKey: embKey,
      model: clean(env.EMBEDDING_MODEL) ?? "text-embedding-3-small",
      baseUrl: clean(env.OPENAI_API_BASE_URL) ?? "https://api.openai.com/v1",
      dimensions: Number(env.EMBEDDING_DIMENSIONS ?? 1536),
    };
  }

  return config;
}
