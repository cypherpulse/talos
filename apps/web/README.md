# Talos Web

Frontend for **Talos** — a privacy-preserving execution layer for AI agents on X Layer.
It is a thin client of the Talos Core Server + Guard HTTP APIs: it never signs
transactions or handles private keys; the backend generates the Groth16 proof, signs,
submits to X Layer, and confirms. All operations are asynchronous (submit → poll the
operation until a terminal status).

## Stack

TanStack Start (React 19 + Vite) · TypeScript · Tailwind CSS v4 · shadcn/ui ·
TanStack Query · framer-motion.

## Getting started

```bash
pnpm install
pnpm --filter tanstack_start_ts dev      # or run from this directory: pnpm dev
```

Configure the backend and chain via env (Vite `import.meta.env`):

```bash
VITE_TALOS_API_BASE_URL=http://localhost:3000   # Core + Guard + Agent APIs
VITE_XLAYER_EXPLORER_URL=https://www.oklink.com/xlayer-test
VITE_CHAIN_ID=195
```

## Scripts

```bash
pnpm dev         # dev server
pnpm build       # production build
pnpm preview     # preview the production build
pnpm lint        # eslint
pnpm format      # prettier
```

## Structure

```text
src/
├── routes/        # TanStack Router routes (__root, index, ...)
├── lib/           # api client, wallet, formatting, error handling
├── components/    # shared UI (shadcn/ui)
├── hooks/
├── router.tsx     # createRouter
├── server.ts      # SSR error-wrapper server entry
├── start.ts       # request middleware (CSRF + error handling)
└── styles.css
```

The backend API contract this UI targets lives in the repo root prompt docs and in
`services/core/src` (the authoritative TypeScript types).
