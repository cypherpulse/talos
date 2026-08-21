import { Link, createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Ban,
  BrainCircuit,
  Check,
  ChevronRight,
  Cpu,
  Eye,
  Fingerprint,
  KeyRound,
  Layers,
  Lock,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";
import type { ComponentType, ReactNode } from "react";

import { FlowStrip } from "@/components/talos/flow";
import { Panel, SectionLabel, XLayerBadge } from "@/components/talos/primitives";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Talos — Private AI Execution on X Layer" },
      {
        name: "description",
        content:
          "Shield your assets on X Layer and let AI manage them within rules you control. Real zero-knowledge proofs, real on-chain execution, a policy Guard the model can never override.",
      },
      { property: "og:title", content: "Talos — Private AI Execution on X Layer" },
      {
        property: "og:description",
        content:
          "Shield your assets on X Layer and let AI manage them within rules you control.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const EASE = [0.22, 1, 0.36, 1] as const;

function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.6, delay, ease: EASE }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function Pill({
  children,
  tone = "muted",
}: {
  children: ReactNode;
  tone?: "muted" | "primary" | "danger";
}) {
  const tones = {
    muted: "border-border bg-surface-2 text-muted-foreground",
    primary: "border-primary/30 bg-primary-soft text-primary",
    danger: "border-destructive/30 bg-destructive/10 text-destructive",
  } as const;
  return (
    <span
      className={`mono inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

function Section({
  id,
  eyebrow,
  title,
  lead,
  children,
  className,
}: {
  id?: string;
  eyebrow?: string;
  title?: ReactNode;
  lead?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={`relative border-t border-border py-24 ${className ?? ""}`}>
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal>
          {eyebrow ? <SectionLabel>{eyebrow}</SectionLabel> : null}
          {title ? (
            <h2 className="mt-4 max-w-3xl text-balance text-3xl font-semibold tracking-tight text-foreground sm:text-[2.6rem] sm:leading-[1.08]">
              {title}
            </h2>
          ) : null}
          {lead ? (
            <p className="mt-4 max-w-2xl text-pretty text-base leading-relaxed text-muted-foreground">
              {lead}
            </p>
          ) : null}
        </Reveal>
        <div className="mt-12">{children}</div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Header                                                             */
/* ------------------------------------------------------------------ */

function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <span className="grid size-7 place-items-center rounded-md bg-primary/15 ring-1 ring-primary/30">
            <ShieldCheck className="size-4 text-primary" />
          </span>
          <span className="mono text-sm font-semibold tracking-[0.3em]">TALOS</span>
          <XLayerBadge className="ml-1 hidden sm:inline-flex" />
        </div>
        <nav className="flex items-center gap-6 text-sm text-muted-foreground">
          <a href="#protocol" className="hidden transition-colors hover:text-foreground md:inline">
            Protocol
          </a>
          <a href="#agent" className="hidden transition-colors hover:text-foreground md:inline">
            AI Agent
          </a>
          <a href="#guard" className="hidden transition-colors hover:text-foreground md:inline">
            Guard
          </a>
          <a href="#zk" className="hidden transition-colors hover:text-foreground md:inline">
            Zero-Knowledge
          </a>
          <Link
            to="/app"
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground transition-all hover:bg-primary-strong hover:shadow-[0_0_0_1px_rgba(164,249,29,0.3),0_10px_30px_-12px_rgba(164,249,29,0.6)]"
          >
            Launch <ArrowRight className="size-3.5" />
          </Link>
        </nav>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* Hero                                                               */
/* ------------------------------------------------------------------ */

function PlusMark({ className }: { className?: string }) {
  return (
    <span aria-hidden className={`pointer-events-none absolute hidden text-primary/40 lg:block ${className ?? ""}`}>
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <path d="M6 0v12M0 6h12" stroke="currentColor" strokeWidth="1" />
      </svg>
    </span>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-border">
      {/* atmospherics + decorative shapes */}
      <div aria-hidden className="pointer-events-none absolute inset-0 grid-noise mask-fade-y" />
      <div aria-hidden className="aurora aurora-a left-[6%] top-[-14%] h-[520px] w-[520px]" />
      <div aria-hidden className="aurora aurora-b right-[2%] top-[-6%] h-[440px] w-[440px]" />
      <div aria-hidden className="pointer-events-none absolute right-[-7rem] top-[-8rem] hidden size-[38rem] lg:block">
        <div className="ring-deco absolute inset-0 opacity-40" />
        <div className="ring-deco absolute inset-[13%] opacity-30" />
        <div className="ring-deco absolute inset-[27%] opacity-20" />
      </div>
      <div aria-hidden className="dot-grid-fade pointer-events-none absolute right-[10%] top-[14%] hidden size-36 lg:block" />
      <PlusMark className="left-[4%] top-[24%]" />
      <PlusMark className="left-[47%] top-[12%]" />
      <PlusMark className="left-[40%] bottom-[16%]" />

      <div className="relative mx-auto grid max-w-6xl items-center gap-16 px-4 py-24 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:py-28">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: EASE }}
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/70 px-3 py-1 text-[11px]">
            <span className="relative flex size-1.5">
              <span className="dot-pulse absolute inline-flex size-1.5 rounded-full bg-primary" />
              <span className="relative inline-flex size-1.5 rounded-full bg-primary" />
            </span>
            <span className="mono uppercase tracking-[0.18em] text-muted-foreground">
              Private AI execution on X Layer
            </span>
          </div>

          <h1 className="mt-6 text-5xl font-semibold leading-[1.02] tracking-tight text-foreground sm:text-6xl lg:text-[4.25rem]">
            Private assets.
            <br />
            <span className="text-primary">Intelligent execution.</span>
          </h1>

          <p className="mt-6 max-w-xl text-pretty text-lg leading-relaxed text-muted-foreground">
            Talos lets AI agents manage shielded assets on X Layer — proving every action with
            zero-knowledge, and never exposing balances, strategies, or private state.
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Link
              to="/app"
              className="group inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3.5 text-sm font-semibold text-primary-foreground glow-primary transition-all hover:bg-primary-strong"
            >
              Launch Talos
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <a
              href="#protocol"
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface/60 px-6 py-3.5 text-sm font-medium text-foreground transition-colors hover:border-primary/40 hover:text-primary"
            >
              Explore the Protocol
            </a>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-2.5">
            <XLayerBadge />
            <Pill tone="primary">
              <Lock className="size-3" /> Zero-knowledge proofs
            </Pill>
            <Pill>
              <ShieldCheck className="size-3" /> Guard-enforced
            </Pill>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.7, delay: 0.12, ease: EASE }}
          className="relative"
        >
          <div aria-hidden className="absolute -inset-6 rounded-[2rem] bg-primary/10 blur-3xl" />
          <div aria-hidden className="conic-ring pointer-events-none absolute -right-24 -top-24 hidden size-64 opacity-40 lg:block" />
          <div className="brackets relative float-slow">
            <HeroShowcase />
          </div>
        </motion.div>
      </div>

      <TrustStrip />
    </section>
  );
}

const SHOWCASE_STEPS: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  detail: string;
  pill: string;
  tone: "muted" | "primary";
}[] = [
  { icon: BrainCircuit, title: "Talos AI", detail: "Intent understood · SPLIT 100 → 60 + 40", pill: "parsed", tone: "muted" },
  { icon: ShieldCheck, title: "Talos Guard", detail: "Permissions · limits · recipient", pill: "approved", tone: "primary" },
  { icon: Fingerprint, title: "Groth16 proof", detail: "Private witness never leaves the prover", pill: "generated", tone: "muted" },
  { icon: Zap, title: "X Layer", detail: "0x9f2c…a71b · block 4,182,905", pill: "confirmed", tone: "primary" },
];

function HeroShowcase() {
  return (
    <div className="card-hi relative overflow-hidden rounded-2xl border border-border bg-surface/80 p-5 shadow-panel backdrop-blur-xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BrainCircuit className="size-4 text-primary" />
          <span className="mono text-xs font-semibold tracking-[0.2em] text-foreground">
            TALOS AGENT
          </span>
        </div>
        <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="size-1.5 rounded-full bg-primary dot-pulse" /> Guard active
        </span>
      </div>

      {/* user prompt */}
      <div className="mt-4 rounded-xl border border-border bg-background/60 px-4 py-3">
        <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">You</p>
        <p className="mt-1 text-sm text-foreground">
          “Split my 100 USDC into 60 and 40.”
        </p>
      </div>

      {/* pipeline */}
      <div className="relative mt-4 pl-6">
        <div className="beam-v absolute bottom-4 left-[11px] top-4 w-px bg-border" />
        <div className="space-y-2.5">
          {SHOWCASE_STEPS.map((s, i) => (
            <motion.div
              key={s.title}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.45, delay: 0.5 + i * 0.28, ease: EASE }}
              className="relative flex items-center gap-3 rounded-xl border border-border bg-background/40 px-3 py-2.5"
            >
              <span
                className={`absolute -left-6 grid size-[22px] place-items-center rounded-full border ${
                  s.tone === "primary"
                    ? "border-primary/40 bg-primary/15 text-primary"
                    : "border-border bg-surface-2 text-muted-foreground"
                }`}
              >
                <s.icon className="size-3" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">{s.title}</p>
                <p className="mono truncate text-[11px] text-muted-foreground">{s.detail}</p>
              </div>
              <Pill tone={s.tone === "primary" ? "primary" : "muted"}>{s.pill}</Pill>
            </motion.div>
          ))}
        </div>
      </div>

      {/* result */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.7, duration: 0.5 }}
        className="mt-4 flex items-center justify-between rounded-xl border border-primary/25 bg-primary-soft px-4 py-3"
      >
        <span className="text-xs text-muted-foreground">Private balance</span>
        <span className="flex items-center gap-2">
          <span className="mono rounded-md border border-border bg-background/60 px-2 py-1 text-xs text-foreground">60 USDC</span>
          <span className="text-muted-foreground">+</span>
          <span className="mono rounded-md border border-border bg-background/60 px-2 py-1 text-xs text-foreground">40 USDC</span>
        </span>
      </motion.div>
    </div>
  );
}

const TRUST_ITEMS = [
  "Groth16",
  "Poseidon",
  "BN254",
  "Merkle commitments",
  "Nullifiers",
  "Shielded notes",
  "X Layer",
  "EVM",
];

function TrustStrip() {
  return (
    <div className="relative border-t border-border py-5">
      <div
        className="mx-auto max-w-6xl overflow-hidden px-4 sm:px-6"
        style={{
          maskImage: "linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent)",
          WebkitMaskImage: "linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent)",
        }}
      >
        <div className="marquee-track flex w-max items-center gap-10">
          {[...TRUST_ITEMS, ...TRUST_ITEMS].map((item, i) => (
            <span
              key={i}
              className="mono flex items-center gap-2 whitespace-nowrap text-xs uppercase tracking-[0.18em] text-muted-foreground"
            >
              <span className="size-1 rounded-full bg-primary/60" />
              {item}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sections                                                           */
/* ------------------------------------------------------------------ */

function ProblemSection() {
  const items = [
    "Balances",
    "Strategies",
    "Counterparties",
    "Transaction patterns",
    "Execution history",
  ];
  return (
    <Section
      eyebrow="The problem"
      title="AI agents are becoming financial operators — on chains that expose everything."
    >
      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr] lg:items-center">
        <Reveal>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {items.map((item) => (
              <div
                key={item}
                className="flex items-center gap-3 rounded-xl border border-border bg-surface/60 px-4 py-3"
              >
                <Eye className="size-4 shrink-0 text-destructive" aria-hidden />
                <span className="text-sm text-foreground">{item}</span>
                <span className="mono ml-auto text-[10px] uppercase tracking-[0.14em] text-destructive/80">
                  public
                </span>
              </div>
            ))}
          </div>
        </Reveal>
        <Reveal delay={0.1}>
          <div className="card-hi rounded-2xl border border-border bg-gradient-to-b from-surface to-background p-8">
            <p className="text-sm leading-relaxed text-muted-foreground">
              When an autonomous agent trades on a transparent chain, anyone can watch its every
              move — front-run its strategy, map its counterparties, and reconstruct its intent.
            </p>
            <p className="mt-6 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Talos changes the <span className="text-primary">execution model.</span>
            </p>
          </div>
        </Reveal>
      </div>
    </Section>
  );
}

function StepsSection() {
  const steps = [
    { n: "01", icon: Lock, t: "Shield", d: "Assets enter the private pool as shielded notes — commitments, not balances." },
    { n: "02", icon: Fingerprint, t: "Prove", d: "Groth16 proves the action is valid without revealing the private witness." },
    { n: "03", icon: Zap, t: "Execute", d: "The verified proof settles on X Layer — EVM-compatible, low-cost execution." },
    { n: "04", icon: ShieldCheck, t: "Protect", d: "Talos Guard blocks any agent action outside your permissions and limits." },
  ];
  return (
    <Section id="protocol" eyebrow="How Talos works" title="Four steps, end to end.">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {steps.map((s, i) => (
          <Reveal key={s.n} delay={i * 0.08}>
            <div className="card-hi group relative h-full overflow-hidden rounded-2xl border border-border bg-surface/70 p-6 transition-all hover:-translate-y-1 hover:border-primary/30">
              <div className="flex items-center justify-between">
                <span className="grid size-10 place-items-center rounded-xl border border-primary/25 bg-primary-soft text-primary">
                  <s.icon className="size-4" />
                </span>
                <span className="mono text-xs text-muted-foreground">{s.n}</span>
              </div>
              <p className="mt-5 text-lg font-semibold text-foreground">{s.t}</p>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.d}</p>
              {i < steps.length - 1 ? (
                <ChevronRight className="absolute -right-2 top-1/2 hidden size-5 -translate-y-1/2 text-border lg:block" />
              ) : null}
            </div>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}

function OperationsSection() {
  const rows = [
    { label: "Shield", flow: ["100 USDC", "Private pool", "Note · 100"] },
    { label: "Split", flow: ["Note · 100", "ZK proof", "Note · 60 + Note · 40"] },
    { label: "Merge", flow: ["Note · 60 + Note · 40", "ZK proof", "Note · 100"] },
    { label: "Transfer", flow: ["Private note", "ZK proof", "Recipient note"] },
    { label: "Withdraw", flow: ["Private note", "ZK proof", "Public X Layer address"] },
  ];
  return (
    <Section
      eyebrow="Private operations"
      title="One private balance. Five composable operations."
      lead="Every operation is a real zero-knowledge state transition — connected as one story, not five disconnected features."
    >
      <div className="space-y-3">
        {rows.map((row, i) => (
          <Reveal key={row.label} delay={i * 0.06}>
            <div className="card-hi flex flex-col gap-4 rounded-2xl border border-border bg-surface/70 p-5 transition-colors hover:border-primary/25 sm:flex-row sm:items-center">
              <div className="flex w-32 shrink-0 items-center gap-3">
                <span className="mono text-[11px] text-muted-foreground">0{i + 1}</span>
                <p className="mono text-sm font-semibold uppercase tracking-[0.14em] text-primary">
                  {row.label}
                </p>
              </div>
              <FlowStrip
                className="flex-1"
                animate={false}
                nodes={row.flow.map((label, j) => ({
                  label,
                  tone: j === row.flow.length - 1 ? "primary" : "default",
                }))}
              />
            </div>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}

function AiSection() {
  return (
    <Section
      id="agent"
      eyebrow="AI + privacy"
      title="AI that can act without acting unchecked."
    >
      <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr] lg:items-stretch">
        <Reveal>
          <div className="card-hi flex h-full flex-col justify-between rounded-2xl border border-border bg-gradient-to-b from-surface to-background p-8">
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-[11px] text-muted-foreground">
              <BrainCircuit className="size-3.5 text-primary" /> The model proposes
            </div>
            <p className="mt-6 text-2xl font-semibold leading-tight tracking-tight text-foreground">
              The LLM never holds authorization.
              <br />
              <span className="text-primary">The Guard decides.</span>
            </p>
            <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
              Every agent mutation is evaluated against your policy — permissions, limits,
              recipients, approvals — before a proof is ever generated. No prompt, jailbreak, or
              “act as administrator” can widen what the agent is allowed to do.
            </p>
          </div>
        </Reveal>
        <Reveal delay={0.1}>
          <Panel className="card-hi h-full space-y-6 bg-surface/70">
            <div className="rounded-xl border border-border bg-background/60 px-4 py-3">
              <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">User</p>
              <p className="mt-1 text-sm text-foreground">“Split my 100 USDC into 60 and 40.”</p>
            </div>
            <FlowStrip
              nodes={[
                { label: "Talos AI", sub: "intent" },
                { label: "Talos Guard", sub: "permissions · limits · recipient" },
                { label: "Groth16", sub: "proof" },
                { label: "X Layer", sub: "executes", tone: "primary" },
              ]}
            />
            <div className="flex items-center gap-2 text-sm text-primary">
              <Check className="size-4" /> Approved, proven, confirmed — with private state intact.
            </div>
          </Panel>
        </Reveal>
      </div>
    </Section>
  );
}

function GuardSection() {
  return (
    <Section
      id="guard"
      eyebrow="Talos Guard"
      title="The boundary between intent and execution."
      lead="A typed policy engine that sits outside the model. It runs before any proof or transaction — and its rejection is the most important thing it does."
    >
      <div className="grid gap-4 lg:grid-cols-[1fr_1fr] lg:items-stretch">
        <Reveal>
          <Panel className="card-hi h-full space-y-5 bg-surface/70">
            <div className="flex items-center gap-2 text-sm font-medium text-primary">
              <ShieldCheck className="size-4" /> Approved path
            </div>
            <FlowStrip
              nodes={[
                { label: "Agent" },
                { label: "Guard", sub: "permissions · limits · assets · recipients · approvals" },
                { label: "Approved", tone: "primary" },
                { label: "Core", tone: "primary" },
              ]}
            />
            <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
              {["Permissions", "Limits", "Assets", "Recipients", "Approvals", "Audit trail"].map(
                (c) => (
                  <span key={c} className="flex items-center gap-1.5">
                    <Check className="size-3 text-primary" /> {c}
                  </span>
                ),
              )}
            </div>
          </Panel>
        </Reveal>

        <Reveal delay={0.1}>
          <div className="card-hi relative flex h-full flex-col overflow-hidden rounded-2xl border border-destructive/30 bg-surface/70 p-6">
            <div
              aria-hidden
              className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full bg-destructive/15 blur-3xl"
            />
            <div className="flex items-center gap-2 text-sm font-medium text-destructive">
              <Ban className="size-4" /> Rejection beat
            </div>
            <p className="mono mt-4 text-sm text-foreground">
              “Withdraw 100 USDC to an unauthorized address.”
            </p>

            <div className="my-6 flex items-center justify-center">
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                whileInView={{ scale: 1, opacity: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, ease: EASE }}
                className="grid place-items-center rounded-2xl border-2 border-destructive/60 px-8 py-4"
                style={{ rotate: "-6deg" }}
              >
                <span className="mono text-2xl font-bold uppercase tracking-[0.2em] text-destructive">
                  Rejected
                </span>
              </motion.div>
            </div>

            <div className="mt-auto grid grid-cols-3 gap-2 text-center">
              {["No proof", "No transaction", "No funds moved"].map((t) => (
                <span
                  key={t}
                  className="mono rounded-lg border border-destructive/20 bg-destructive/5 px-2 py-2 text-[11px] uppercase tracking-[0.1em] text-destructive"
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
        </Reveal>
      </div>
    </Section>
  );
}

function ZkSection() {
  const primitives: [ComponentType<{ className?: string }>, string, string][] = [
    [Fingerprint, "Groth16", "Succinct proofs, cheap on-chain verification"],
    [KeyRound, "Poseidon", "ZK-friendly hashing for commitments"],
    [Layers, "Merkle commitments", "Membership without disclosure"],
    [ShieldCheck, "Nullifiers", "Double-spend protection, unlinkable"],
  ];
  return (
    <Section id="zk" eyebrow="Zero-knowledge" title="Prove the action. Hide the strategy.">
      <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
        <Reveal>
          <Panel className="card-hi h-full space-y-6 bg-surface/70">
            <FlowStrip
              nodes={[
                { label: "Private witness", sub: "never leaves the prover" },
                { label: "Groth16" },
                { label: "Proof" },
                { label: "X Layer verifier", tone: "primary" },
              ]}
            />
            <p className="text-sm leading-relaxed text-muted-foreground">
              Talos never displays, transmits, or logs witness values. Only the proof and its
              public inputs ever reach the chain — the strategy stays yours.
            </p>
          </Panel>
        </Reveal>
        <div className="grid gap-3 sm:grid-cols-2">
          {primitives.map(([Icon, t, d], i) => (
            <Reveal key={t} delay={i * 0.06}>
              <div className="card-hi h-full rounded-2xl border border-border bg-surface/70 p-5 transition-colors hover:border-primary/25">
                <Icon className="size-4 text-primary" />
                <p className="mono mt-3 text-sm text-primary">{t}</p>
                <p className="mt-1.5 text-sm text-muted-foreground">{d}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </Section>
  );
}

function XLayerSection() {
  const items: [ComponentType<{ className?: string }>, string, string][] = [
    [Cpu, "EVM-compatible", "Standard Solidity verifier and tooling."],
    [Sparkles, "Low-cost execution", "Proof verification stays economical at scale."],
    [Lock, "OKB gas", "Transactions on X Layer are paid in OKB."],
  ];
  return (
    <Section eyebrow="Built for X Layer" title="EVM-compatible. Low-cost. OKB gas.">
      <div className="grid gap-4 sm:grid-cols-3">
        {items.map(([Icon, t, d], i) => (
          <Reveal key={t} delay={i * 0.06}>
            <div className="card-hi h-full rounded-2xl border border-border bg-surface/70 p-6">
              <Icon className="size-4 text-primary" />
              <p className="mt-3 text-sm font-medium text-foreground">{t}</p>
              <p className="mt-1.5 text-sm text-muted-foreground">{d}</p>
            </div>
          </Reveal>
        ))}
      </div>
      <Reveal delay={0.1}>
        <div className="mt-8 flex flex-wrap items-center gap-4">
          <XLayerBadge />
          <a
            href="https://web3.okx.com/xlayer/docs"
            target="_blank"
            rel="noreferrer noopener"
            className="text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-primary hover:underline"
          >
            X Layer documentation →
          </a>
        </div>
      </Reveal>
    </Section>
  );
}

function FinalCta() {
  return (
    <section className="relative overflow-hidden border-t border-border py-28">
      <div aria-hidden className="aurora aurora-a left-1/2 top-0 h-[420px] w-[620px] -translate-x-1/2" />
      <div className="relative mx-auto max-w-3xl px-4 text-center sm:px-6">
        <Reveal>
          <SectionLabel>Live protocol</SectionLabel>
          <h2 className="mt-5 text-balance text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            Try the private execution layer.
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-pretty text-muted-foreground">
            Shield an asset, run a real private operation, watch a real Groth16 proof settle on
            X Layer — and watch the Guard reject what it shouldn’t allow.
          </p>
          <Link
            to="/app"
            className="group mt-9 inline-flex items-center gap-2 rounded-xl bg-primary px-7 py-3.5 text-sm font-semibold text-primary-foreground glow-primary transition-all hover:bg-primary-strong"
          >
            Launch Talos
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </Reveal>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border py-10">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 sm:flex-row sm:px-6">
        <div className="flex items-center gap-2">
          <span className="grid size-6 place-items-center rounded-md bg-primary/15 ring-1 ring-primary/25">
            <ShieldCheck className="size-3.5 text-primary" />
          </span>
          <span className="mono text-xs tracking-[0.28em] text-foreground">TALOS</span>
        </div>
        <XLayerBadge />
        <span className="text-xs text-muted-foreground">
          Not affiliated with or endorsed by OKX / X Layer.
        </span>
      </div>
    </footer>
  );
}

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <Hero />
      <ProblemSection />
      <StepsSection />
      <OperationsSection />
      <AiSection />
      <GuardSection />
      <ZkSection />
      <XLayerSection />
      <FinalCta />
      <Footer />
    </div>
  );
}
