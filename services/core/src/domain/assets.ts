/**
 * Server-side asset registry (mirrors the on-chain {TalosAssetRegistry}).
 *
 * The pool binds each note to an assetId; these entries map that id to the ERC-20
 * token (or native OKB) the frontend must approve/deposit. Addresses come from the
 * environment so the server and the deployed registry stay in lock-step. Each entry
 * also carries display metadata (brand colour + a self-contained SVG logo) so the UI
 * renders a real token badge without depending on any external image host.
 */
export interface AssetInfo {
  assetId: number;
  symbol: string;
  name: string;
  /** ERC-20 token address, or the zero address for the native gas token. */
  address: string;
  decimals: number;
  isNative: boolean;
  /** Brand colour (hex) for UI accents. */
  color: string;
  /** Inline SVG data-URI logo — always renders, no external request. */
  logo: string;
}

const ZERO = "0x0000000000000000000000000000000000000000";

/** Build a self-contained circular token badge as an SVG data URI. */
function badge(symbol: string, color: string): string {
  const label = symbol.slice(0, 4);
  const fontSize = label.length >= 4 ? 26 : label.length === 3 ? 30 : 34;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80">` +
    `<circle cx="40" cy="40" r="40" fill="${color}"/>` +
    `<text x="40" y="40" dy="0.36em" text-anchor="middle" fill="#ffffff" ` +
    `font-family="Inter,Arial,sans-serif" font-weight="700" font-size="${fontSize}">${label}</text>` +
    `</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

interface AssetMeta {
  symbol: string;
  name: string;
  decimals: number;
  color: string;
}

// Registered assets keyed by on-chain assetId. Token addresses come from the env.
const META: Record<number, AssetMeta & { env?: string; isNative?: boolean }> = {
  1: { symbol: "USDC", name: "USD Coin", decimals: 6, color: "#2775CA", env: "TEST_USDC_ADDRESS" },
  2: { symbol: "USDT", name: "Tether USD", decimals: 6, color: "#26A17B", env: "TEST_USDT_ADDRESS" },
  3: { symbol: "USDG", name: "Global Dollar", decimals: 6, color: "#C9A227", env: "TEST_USDG_ADDRESS" },
  4: { symbol: "OKB", name: "OKB (native)", decimals: 18, color: "#0B0B0F", isNative: true },
};

/** Load the registered assets from the environment (USDC=1, USDT=2, USDG=3, native OKB=4). */
export function loadAssets(env: NodeJS.ProcessEnv = process.env): AssetInfo[] {
  const assets: AssetInfo[] = [];
  for (const [id, m] of Object.entries(META)) {
    const assetId = Number(id);
    let address = ZERO;
    if (!m.isNative) {
      const a = m.env ? env[m.env] : undefined;
      if (!a || !/^0x[0-9a-fA-F]{40}$/.test(a)) continue; // token not configured — skip
      address = a;
    }
    assets.push({
      assetId,
      symbol: m.symbol,
      name: m.name,
      address,
      decimals: m.decimals,
      isNative: Boolean(m.isNative),
      color: m.color,
      logo: badge(m.symbol, m.color),
    });
  }
  return assets.sort((a, b) => a.assetId - b.assetId);
}

export function getAsset(assetId: number, env: NodeJS.ProcessEnv = process.env): AssetInfo | undefined {
  return loadAssets(env).find((a) => a.assetId === assetId);
}
