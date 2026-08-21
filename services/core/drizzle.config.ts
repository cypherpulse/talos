import { defineConfig } from "drizzle-kit";

/** `pnpm db:generate` emits versioned SQL migrations from src/database/schema.ts. */
export default defineConfig({
  schema: "./src/database/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://talos:talos@localhost:5432/talos",
  },
});
