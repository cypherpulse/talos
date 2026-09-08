import { defineConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Standard TanStack Start + Vite configuration.
// `src/server.ts` is our SSR error-wrapper entry; `src/start.ts` registers request
// middleware (CSRF + error handling). Path alias `@/*` -> `src/*` comes from
// tsconfig.json via vite-tsconfig-paths.
//
// Browser ZK proving avoids Node-built-in-heavy libs: Poseidon uses `poseidon-lite`
// (pure JS, no polyfills) and snarkjs gets a minimal `Buffer` global set in
// lib/talos/client-prove.ts — so no node-polyfills plugin is needed (it conflicts with
// TanStack Start's unenv/Nitro layer on Vite 8).
export default defineConfig({
  plugins: [
    tsConfigPaths(),
    tailwindcss(),
    tanstackStart({
      // Use our custom server entry (SSR error wrapper) instead of the default.
      server: { entry: "./src/server.ts" },
      // SPA mode: prerender a static shell (index.html) so the app can be hosted on
      // any static host (Netlify) and deep links resolve via the client router.
      spa: { enabled: true },
    }),
    viteReact(),
  ],
});
