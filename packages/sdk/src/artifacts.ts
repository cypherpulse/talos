/**
 * Where the SDK loads a circuit's proving artifacts from. Two sources ship:
 *   - `httpArtifacts(baseUrl)` — browser/web: fetched from `${baseUrl}/circuits/<name>/…`.
 *   - `fileArtifacts(dir)`     — Node/CLI: read from disk under `${dir}/<name>/…`.
 * The `.wasm` and `.zkey` are handed to snarkjs as a URL (web) or a path (Node); the vkey is
 * loaded eagerly for the mandatory off-chain self-verify.
 */
export interface CircuitArtifacts {
  wasm: string;
  zkey: string;
  vkey: unknown;
}

export interface ArtifactSource {
  load(circuit: string): Promise<CircuitArtifacts>;
}

/** Web: artifacts served under `${baseUrl}/circuits/<name>/…` (as apps/web serves them). */
export function httpArtifacts(baseUrl: string, fetchImpl?: typeof fetch): ArtifactSource {
  const f = (fetchImpl ?? globalThis.fetch)?.bind(globalThis);
  if (!f) throw new Error("no `fetch` available for httpArtifacts");
  const b = baseUrl.replace(/\/+$/, "");
  return {
    async load(name) {
      const dir = `${b}/circuits/${name}`;
      const res = await f(`${dir}/verification_key.json`);
      if (!res.ok) throw new Error(`could not load ${name} verification key (${res.status})`);
      return { wasm: `${dir}/${name}_js/${name}.wasm`, zkey: `${dir}/${name}_final.zkey`, vkey: await res.json() };
    },
  };
}

/** Node: artifacts on disk under `${dir}/<name>/…` (e.g. a copy of `circuits/build`). */
export function fileArtifacts(dir: string): ArtifactSource {
  return {
    async load(name) {
      const { readFileSync } = await import("node:fs");
      const { join } = await import("node:path");
      const base = join(dir, name);
      const vkey = JSON.parse(readFileSync(join(base, "verification_key.json"), "utf8"));
      return { wasm: join(base, `${name}_js`, `${name}.wasm`), zkey: join(base, `${name}_final.zkey`), vkey };
    },
  };
}
