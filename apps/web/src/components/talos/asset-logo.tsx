import type { Asset } from "@/lib/talos/types";
import { cn } from "@/lib/utils";

/**
 * Renders a token's logo. The server ships a self-contained SVG data-URI per asset;
 * if it's ever missing we fall back to a brand-coloured badge with the symbol, so a
 * logo always appears.
 */
export function AssetLogo({
  asset,
  size = 28,
  className,
}: {
  asset: Asset;
  size?: number;
  className?: string;
}) {
  const dim = { width: size, height: size } as const;
  if (asset.logo) {
    return (
      <img
        src={asset.logo}
        alt={asset.symbol}
        style={dim}
        className={cn("shrink-0 rounded-full", className)}
      />
    );
  }
  return (
    <span
      style={{ ...dim, backgroundColor: asset.color }}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white",
        className,
      )}
    >
      {asset.symbol.slice(0, 3)}
    </span>
  );
}
