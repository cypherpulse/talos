# Talos — Frontend MVP + Landing Page (Build Brief for an External Agent)

> **You are building the Talos web frontend against an existing, working backend.**
> Do **not** modify the protocol, ZK circuits, smart contracts, Core Server, Guard,
> database, or agent — they are complete (Phases 1–5). Your job is a
> **competition-quality Next.js frontend + landing page** that makes the real
> ZK + AI + X Layer infrastructure immediately understandable and impressive.
>
> This document is self-contained: the exact API contracts you must build to are in
> **§A (Ground Truth)**. Do not guess field names — use §A. If the repo is available,
> the TypeScript types in `services/core/src` are the source of truth and match §A.
>
> **The one rule that matters most:** build the smallest *polished* frontend that
> makes the existing Talos infrastructure look and feel like a real product, and lets
> a judge understand **AI + Privacy + ZK + Guard + X Layer** within the first minute.

---

# §A. GROUND TRUTH — READ BEFORE WRITING ANY CODE

## A.1 Execution model (this changes how you build everything)

Talos is **not** a sign-in-your-wallet dApp. The **Core Server holds the signer and
performs all on-chain actions.** The frontend is a **thin client** of two HTTP APIs
(the Core Server and the Guard). Concretely:

- **The frontend never signs or broadcasts a transaction and never touches a private
  key.** It calls the backend, which generates the Groth16 proof, signs, submits to
  X Layer, and confirms.
- **Wallet connection is for identity/display only** in this MVP: show "Connected
  0x71…92A", and let the user paste/confirm a **public recipient address** for
  withdrawals. Do **not** build a wallet-signing flow for shield/split/merge/transfer.
- **All mutating operations are asynchronous.** A `POST` returns **HTTP 202** with
  `{ operationId, status }`. You then **poll** `GET /api/v1/operations/:id` until the
  status is terminal (`FINALIZED` = success, or `FAILED`/`REJECTED`/`CANCELLED`/
  `EXPIRED`). Never claim success on the 202 response.
- **Agent mutations go through the Guard**, never straight to Core. Reads may hit
  Core directly.
- The frontend is **not** the security boundary. The backend + Guard + contracts are
  authoritative.

## A.2 Base URL & config

All endpoints below are served from a single origin. Configure it via env:

```text
NEXT_PUBLIC_API_BASE_URL=http://localhost:3000     # Core + Guard + Agent APIs
NEXT_PUBLIC_XLAYER_EXPLORER_URL=https://www.oklink.com/xlayer-test
NEXT_PUBLIC_CHAIN_ID=195
NEXT_PUBLIC_DEMO_MODE=false
```

CORS is already enabled on the backend.

## A.3 Value / amount conventions

- All amounts and note values are **non-negative integer strings in the asset's base
  units** (never numbers — they can exceed `Number.MAX_SAFE_INTEGER`; use `bigint`/
  string). Protocol constraint: `0 < value < 2^128`.
- The test asset (**TEST_USDC**) has **6 decimals**. Display human units
  (`value / 1e6`), send base-unit integer strings. Provide a formatting helper and use
  it everywhere; never do lossy float math on amounts.

## A.4 Core Server API (authoritative)

**Health / status**
```text
GET /health            -> 200 { "status": "ok" }
GET /ready             -> 200|503 { "ready": boolean,
                                    "checks": { "chain": bool, "artifacts": bool, "pool": bool } }
GET /api/v1/status     -> { "chainId": number, "blockNumber": number,
                            "root": string, "nextLeafIndex": number, "merkleDepth": number }
GET /api/v1/merkle/root-> { "root": string }
```

**Notes (public projection only — never any secret)**
```text
GET /api/v1/notes      -> { "notes": NotePublic[] }
GET /api/v1/notes/:id  -> NotePublic

NotePublic = {
  id: string,               // "note_<uuid>"
  assetId: string,          // "1" for TEST_USDC
  value: string,            // base-unit integer string
  commitment: string,       // decimal field element
  state: NoteState,
  leafIndex: number | null,
  createdAt: string         // ISO
}
NoteState = "CREATED" | "AVAILABLE" | "PENDING_SPEND" | "SPENT" | "LOCKED" | "INVALID"
```
Only `AVAILABLE` notes are spendable.

**Operations & transactions**
```text
GET /api/v1/operations/:id   -> OperationView
GET /api/v1/transactions/:id -> TransactionRecord

OperationView = {
  operationId: string,       // "talos_op_<uuid>"
  type: OperationType,
  status: OperationStatus,
  txHash: string | null,
  errorCode: string | null,
  errorMessage: string | null,
  result: object | null,     // op-specific, e.g. { noteId, commitment, leafIndex, txHash }
  createdAt: string, updatedAt: string
}
OperationType   = "DEPOSIT" | "TRANSFER" | "SPLIT" | "MERGE" | "WITHDRAW"
OperationStatus = "CREATED" | "VALIDATING" | "PROVING" | "PROOF_READY"
                | "READY_TO_SUBMIT" | "SUBMITTING" | "SUBMITTED" | "CONFIRMING"
                | "CONFIRMED" | "FINALIZED"                        // terminal success
                | "FAILED" | "CANCELLED" | "EXPIRED" | "REJECTED"  // terminal failure

TransactionRecord = {
  id, operationId, txHash: string|null, chainId: number,
  from: string, to: string, nonce: number|null, status: string,
  blockNumber: number|null, blockHash: string|null,
  gasUsed: string|null, effectiveGasPrice: string|null,
  confirmations: number, createdAt, updatedAt
}
```

**Mutations (async — return 202 `{ operationId, status }`)**
```text
POST /api/v1/deposits    { amount: string, assetId?: number }
POST /api/v1/splits      { noteId: string, amount1: string, amount2: string }   // amount1+amount2 == note.value
POST /api/v1/merges      { noteId1: string, noteId2: string }                    // same asset, distinct notes
POST /api/v1/transfers   { noteId: string, amount1: string, amount2: string,    // amount1+amount2 == note.value
                           recipientOwnerPubKey: string }                        // recipient Talos owner key (decimal field element)
POST /api/v1/withdrawals { noteId: string, recipient: string }                   // recipient = 0x… X Layer address
```
Optional header `Idempotency-Key: <string>` makes a submission idempotent (reuse it on
retries). `deposit` funds a note from the server-held test balance (no user signing).

**Error shape (any endpoint)**
```text
{ "error": { "code": string, "message": string, "details"?: object } }
```
Codes you should handle: `INVALID_REQUEST`, `NOTE_NOT_FOUND`, `NOTE_ALREADY_SPENT`,
`NOTE_NOT_AVAILABLE`, `NULLIFIER_ALREADY_SPENT`, `INVALID_MERKLE_ROOT`,
`PROOF_GENERATION_FAILED`, `PROOF_VALIDATION_FAILED`, `TRANSACTION_SUBMISSION_FAILED`,
`TRANSACTION_CONFIRMATION_FAILED`, `UNSUPPORTED_ASSET`, `INSUFFICIENT_BALANCE`,
`OPERATION_NOT_FOUND`, `BLOCKCHAIN_UNAVAILABLE`, `RATE_LIMITED`.

## A.5 Guard API (agent mutations flow through here)

```text
GET  /guard/identity              -> AgentIdentity { agentId, agentName, permissions, policyId, status }
GET  /guard/decisions             -> { decisions: GuardDecisionRecord[] }
POST /guard/evaluate  { operation: OperationType, params: object } -> { decision, reason }
POST /guard/execute   { operation: OperationType, params: object } -> GuardResult   // 202, or 403 if REJECTED
POST /guard/operations/:id/approve   -> GuardResult                                  // approve an APPROVAL_REQUIRED item
GET  /guard/operations/:id           -> OperationView                                // proxies Core operation status

GuardResult = {
  decision: "APPROVED" | "REJECTED" | "APPROVAL_REQUIRED",
  reason: string,
  operationId?: string,       // present when APPROVED (poll it like any operation)
  guardOperationId?: string,  // present when APPROVAL_REQUIRED (approve via the endpoint above)
  audit: GuardDecisionRecord
}
GuardDecisionRecord = { id, agentId, operationType, asset, amount, recipient, decision, reason, createdAt }
```
`params` for `/guard/execute` are **exactly** the Core POST bodies above (e.g. for a
split: `{ noteId, amount1, amount2 }`). On `APPROVED` you get an `operationId` to poll;
on `REJECTED` **no transaction is created** — surface the `reason` prominently.

## A.6 AI Agent endpoint (build to this contract)

The natural-language agent is a backend capability. Build the Agent UI to:

```text
POST /agent/message   { message: string }
  -> { reply: string,
       steps: { tool: string, arguments: object, result: object }[],
       decisions: GuardDecisionRecord[] }
```

Each `steps[].result` for a mutation contains a Guard decision and (if approved) the
polled operation result — i.e. `{ decision, operationId?, status?, txHash?, reason? }`.
Render the reply plus a visible **Agent → Guard → proof → X Layer** pipeline from
`steps`, and clearly show any `REJECTED` decision.

## A.7 Backend readiness notes (so your template targets the right shapes)

These are already implemented and covered by tests: all **Core** endpoints (§A.4) and
the **Guard** class + routes (§A.5). Two small wirings are finished during our
**finalize** pass (do not implement backend yourself — just build the client to the
contracts above): (1) mounting the Guard routes onto the running server's base URL,
and (2) exposing `POST /agent/message` (§A.6). Until they're live, keep the Agent and
Guard UIs behind the same typed client so they light up the moment the endpoints
respond. Everything else must work against the live Core API today.

## A.8 The 60-second demo your UI must enable (see §Demo)

`Connect → Shield 100 → Private balance → "Split into 60 + 40" via the Agent → Guard
APPROVED → Groth16 proof → X Layer → 60 + 40 → "Merge" → 100 → Withdraw → public
balance.` Then the security beat: **"Withdraw to an unauthorized address" → Guard
REJECTED → no proof, no transaction, no funds moved.**

---

# 1. What to build

A complete Talos web experience:

1. High-impact **landing page** (competition-quality).
2. **Application**: dashboard, shield, private balance/notes, split, merge, private
   transfer, withdraw.
3. **AI Agent** interface + **Guard/approval** visibility.
4. **Operation tracking** with live status, and **X Layer transaction** details.
5. Responsive desktop → tablet → mobile.

Everything uses the **real APIs in §A**. No fake blockchain data, balances, proofs,
agent responses, or mocked success states in demo/production mode.

---

# 2. Product positioning & vocabulary

> **A private execution layer for AI agents on X Layer.**
> **Private assets. Intelligent execution.**
> Shield your assets on X Layer and let AI manage them within rules you control.

Vocabulary (use consistently): **Shield** (move assets into private notes),
**Private Balance** (value held as shielded notes), **Split**, **Merge**, **Transfer**
(private, between Talos identities), **Withdraw** (back to a public X Layer address),
**Talos Agent** (AI acting through the Guard), **Talos Guard** (the policy/security
boundary controlling agent actions). Talos is **not** "another wallet."

---

# 3. Design direction

The design is a major part of the submission. It must feel like a **premium Web3
privacy + AI security product**, not a generic SaaS dashboard. Draw on the quality
level of institutional crypto products, premium security platforms, high-end AI
products, and sophisticated DeFi — but create **Talos's own identity**; don't clone
anyone.

**X Layer ecosystem branding:** build the system around X Layer's dark/black
foundation and green accent, white/near-white type, restrained neutral surfaces,
subtle green highlights, very limited secondary accent. Don't invent competing colors.
Include a **"Built on X Layer"** indicator on the landing page and in the app. Follow
current official X Layer/OKX brand guidance; **do not imply OKX/X Layer endorsement**
unless it actually exists.

**Talos personality:** private, intelligent, secure, technical, powerful, trustworthy,
minimal, futuristic, institutional. **Avoid:** cartoonish Web3 art, excessive
gradients/neon, generic crypto templates, clutter, meaningless glassmorphism, walls of
cards, or animation on everything.

---

# 4. Landing page

Purpose: a judge understands Talos in **10–15 seconds**. Build a clear narrative, not
a card dump.

**Hero.** Eyebrow `PRIVATE AI EXECUTION ON X LAYER`; headline **"Private assets.
Intelligent execution."**; sub: *"Talos gives AI agents a secure way to manage shielded
assets on X Layer — without exposing strategies, balances, or private state."* CTAs:
**Launch Talos** (primary) / **Explore the Protocol** (secondary). Badges: **Built on
X Layer**, **Powered by Zero-Knowledge Proofs**. The hero is **not** text + button —
include a subtle, purposeful **protocol visualization** animating the flow
`AI Agent → Talos Guard → ZK Proof → Private Pool → X Layer`. No distracting motion.

**Sections (in order):**
1. **Hero** — instant comprehension.
2. **The Problem** — AI agents are becoming financial operators, but public chains
   expose balances, strategies, counterparties, patterns, and history. → *"Talos
   changes the execution model."*
3. **How Talos Works** — an elegant 4-step flow: **01 Shield · 02 Prove · 03 Execute ·
   04 Protect** (assets → private notes; Groth16 proves without revealing the witness;
   Talos executes on X Layer; the Guard prevents unauthorized agent actions).
4. **Private Operations** — one connected visual story (not five cards): Shield
   (100 → private note), Split (100 → 60 + 40), Merge (60 + 40 → 100), Transfer
   (private → ZK → private), Withdraw (private → public X Layer address).
5. **AI + Privacy** (a strongest section) — `User: "Split my 100 USDC into 60 and 40."
   → Talos AI (intent) → Talos Guard (permissions/limits/recipient) → Groth16 (proof)
   → X Layer (executes)`. Headline: **"AI that can act without acting unchecked."**
6. **Talos Guard** — the boundary visualized (Agent → Guard[permissions/limits/assets/
   recipients/approvals] → APPROVED → Core Server), **plus a rejection**: *"Withdraw
   100 USDC to an unauthorized address" → Guard → REJECTED ✕ → No proof. No
   transaction. No funds moved.* This rejection is a powerful competition beat.
7. **Zero-Knowledge** — **"Prove the action. Hide the strategy."** Name the real
   primitives (Groth16, Poseidon, Merkle commitments, nullifiers, shielded notes) and
   a simple `Private witness → Groth16 → Proof → X Layer verifier` visual. Never show
   witness values.
8. **Built for X Layer** — EVM-compatible, low-cost execution, OKB gas (verified facts
   only), **Built on X Layer**, link to official X Layer docs.
9. **Launch** — transition into the app: **"Try the private execution layer" →
   Launch Talos →**.

---

# 5. Application

Same visual language as the landing page, distinctly "app." Keep the sidebar simple.

**Dashboard.** Header with `TALOS`, an `X Layer ●` network indicator, and wallet
status. Prominent **Private Balance** (sum of `AVAILABLE` note values, formatted) with
note count, a primary **Shield Assets** CTA, and a **Recent Activity** feed of real
operations. Avoid sidebar sprawl (Dashboard · Shield · Private Actions · AI Agent ·
Activity).

**Wallet.** Use a standard X Layer/EVM connect (e.g. wagmi + viem) for **identity/
display only** — never request or handle private keys, never sign protocol operations
(§A.1). Show `Connected 0x71…92A` and a **View on X Layer Explorer** link. The
connected address is also the default **withdrawal recipient**.

**Shield flow.** Polished multi-step: `Asset → Amount → Review → Shielding →
Generating proof → Confirming → Shielded`, driven by the **real** deposit API +
operation polling. Show meaningful progress derived from actual statuses
(`SUBMITTED → CONFIRMING → CONFIRMED → FINALIZED`) — e.g. "Transaction submitted →
Commitment created → Proof verified → X Layer confirmed → Note available". Never show
"complete" before the backend reaches a terminal success.

**Private Actions.** Unified interface with segmented control **Split | Merge |
Transfer | Withdraw**. Each: pick note(s) from `AVAILABLE` notes, validate input
(client-side, mirroring the constraints in §A.4), submit to the API, show the returned
`operationId`, **track status to terminal**, and show the final result + explorer link.
Split/Transfer must enforce `amount1 + amount2 == note.value`. Withdraw takes a `0x…`
recipient. Transfer takes a `recipientOwnerPubKey` (a Talos owner key, decimal string);
for the MVP, provide a clearly-labeled preset/paste field (this is an advanced path —
keep Shield/Split/Merge/Withdraw as the primary demo).

**AI Agent.** A dedicated experience: a prompt box ("What should Talos do?"), an
`● Guard active` indicator, and an **Execute** button that `POST /agent/message`
(§A.6). Render the reply and a visible pipeline built from `steps`: *Intent understood
→ operation → Guard evaluation → APPROVED/REJECTED → Groth16 proof → X Layer.* Make it
obvious that **the Guard — not the LLM — controls authorization**.

**Guard approval.** When a result is `APPROVAL_REQUIRED`, show a clear card (what the
agent wants to do, amount, recipient, "policy threshold exceeded") with **Reject /
Approve**; Approve calls `POST /guard/operations/:id/approve`. Never hide approval
requirements.

**Activity / operation tracking.** Show real operation status, human-friendly ("Generating
zero-knowledge proof…" for `PROVING`) with a details toggle for the raw status. Update
automatically via controlled polling of `GET /api/v1/operations/:id` (poll ~every
750ms–1.5s; stop on terminal). Use TanStack Query.

**Operation details (advanced).** Operation, status, tx hash, block, gas used, asset,
amount, protocol action, **X Layer explorer link**. **Never** display secret, nonce,
nullifier secret, private witness, encryption key, or private key.

**Privacy UX.** Public (safe to show): tx hash, block, contract, gas, public
withdrawal recipient. Private (never show, never log): note secrets, witnesses, keys,
nullifier secrets, private ownership data. Never leak private data to the console,
analytics, error tracking, URLs, query params, or unencrypted local storage. The API
already returns only public projections — keep it that way client-side.

---

# 6. Frontend architecture

Target `apps/web` in the existing **pnpm** monorepo. Stack: **TypeScript, Next.js
(App Router), React, Tailwind, TanStack Query, viem/wagmi, Zod**. No unnecessary
frameworks; no second backend.

```text
apps/web/
├── app/                     # routes (landing, /app dashboard, sub-routes)
├── components/              # shared UI primitives
├── features/               dashboard | shield | private-actions | agent | activity | wallet | guard
├── lib/
│   ├── api/                 # typed client for §A (Core + Guard + Agent), with Zod-validated responses
│   ├── wallet/              # connect/display only
│   ├── formatting/          # base-unit ↔ human amount, addresses, timestamps
│   └── validation/          # Zod schemas mirroring §A request bodies
└── types/                   # shared types matching §A (single source of truth)
```

Build **one typed API client** that owns the base URL, the async-202 + polling
pattern, error normalization (§A.4), and idempotency keys. Everything else consumes it.
Validate responses with Zod so shape drift is caught early.

---

# 7. Cross-cutting requirements

- **Real-time:** controlled polling of operation status (no second backend); statuses
  advance visibly `PROVING → PROOF_READY → SUBMITTING → CONFIRMING → FINALIZED`.
- **Responsive:** desktop is the demo environment, but tablet and mobile must work —
  collapse nav, preserve status, keep actions reachable, no horizontally overflowing
  tables.
- **Motion:** subtle and purposeful (proof progress, shield, note transitions, status
  changes, the agent pipeline, hover, page transitions). Premium, not flashy. Respect
  `prefers-reduced-motion`.
- **States:** every important operation has Loading ("Generating proof…"), Success
  ("Private operation finalized ✓"), Failure (explain what happened + next step, using
  the error `code`/`message`), and Empty ("No private notes yet. Shield your first
  asset." + CTA). No blank screens.
- **Security (frontend):** never handle keys, never expose secrets, never bypass the
  Guard, never call arbitrary contracts, validate input, handle API errors safely, no
  sensitive console/URL/storage logging, respect backend authorization. The frontend is
  not the security boundary.
- **Accessibility:** keyboard nav, visible focus, semantic HTML, labels, readable
  contrast, accessible dialogs/buttons, reduced-motion.
- **Performance (landing):** fast first load, optimized/lazy assets, minimal deps, no
  huge video backgrounds, good Lighthouse fundamentals.
- **SEO/metadata:** title `Talos — Private AI Execution on X Layer`; description
  *"Talos is a privacy-preserving execution layer for AI agents on X Layer. Shield
  assets, manage private notes, and execute on-chain actions within policies you
  control."*; Open Graph tags.
- **Demo mode:** `NEXT_PUBLIC_DEMO_MODE` defaults to `false`. Any visual-dev fixtures
  must be clearly isolated and never presented as real blockchain data.

---

# 8. Priority order (if time is limited, follow exactly)

- **P0 (mandatory):** landing page · wallet connect (display) · dashboard · shield ·
  split · merge · transfer · withdraw · operation tracking — **all against the real API.**
- **P1 (critical differentiator):** AI Agent UI · Guard status · approval flow · agent
  execution visualization.
- **P2 (polish):** animations · advanced operation details · protocol visualization ·
  responsive refinement · SEO · accessibility refinement.

Never sacrifice P0 functionality for visual polish.

---

# 9. Definition of Done

- [ ] `apps/web` builds; TypeScript passes; existing backend tests remain untouched and passing.
- [ ] Landing page is production-quality; X Layer branding is appropriately represented; desktop polished; mobile works.
- [ ] Wallet connects on X Layer (display/identity only; no key handling, no protocol signing).
- [ ] Shield, Split, Merge, Transfer, Withdraw each work against the **real** API with correct request bodies (§A.4).
- [ ] Operation status is polled and rendered correctly through to a terminal state; success only shown at `FINALIZED`.
- [ ] X Layer explorer links use real tx hashes.
- [ ] AI Agent UI calls `POST /agent/message` (§A.6); mutations visibly route through the Guard.
- [ ] An unauthorized/over-limit action **visibly fails through the Guard** with no transaction created.
- [ ] Approval-required actions can be approved via the Guard endpoint.
- [ ] No secret, nonce, nullifier secret, private witness, or key is ever exposed or logged.
- [ ] No mock blockchain data in demo/production mode. No Phase 1–5 functionality broken.

---

# 10. Final demo (the experience to deliver)

`Connect X Layer → Shield 100 USDC → Private balance 100 → "Split into 60 + 40"
(via the Agent) → Talos Guard APPROVED → Groth16 proof → X Layer → 60 + 40 → "Merge
them privately" → 100 → Withdraw → public balance`, with real statuses and explorer
links throughout. Then the security beat:

```text
AI: "Withdraw 100 USDC to an unauthorized address."
        → Talos Guard → REJECTED
        → NO PROOF · NO TRANSACTION · NO FUNDS MOVED
```

Judges should grasp **AI + Privacy + ZK + Guard + X Layer** within the first minute,
then watch a **real shield → real private operation → real Groth16 proof → real X Layer
transaction → real Guard rejection**.

---

# 11. Execution discipline

Frozen phase. Do **not** modify the protocol, circuits, contracts, or backend
architecture; do not invent endpoints (use §A); do not implement blockchain execution
in the frontend; do not build a second agent or Guard; do not add unnecessary
libraries; do not build features not required here. If the API seems to be missing
something, first check §A for an equivalent — request a backend change only if the
frontend genuinely cannot function without it, and flag it for the finalize pass rather
than implementing it yourself.

> **Build the smallest polished frontend that makes the real Talos infrastructure look
> and feel like a shipping product.**
