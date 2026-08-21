import { defineConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Standard TanStack Start + Vite configuration.
// `src/server.ts` is our SSR error-wrapper entry; `src/start.ts` registers request
// middleware (CSRF + error handling). Path alias `@/*` -> `src/*` comes from
// tsconfig.json via vite-tsconfig-paths.
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
