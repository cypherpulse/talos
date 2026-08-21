import { motion, useReducedMotion } from "framer-motion";

import { cn } from "@/lib/utils";

export interface FlowNode {
  label: string;
  sub?: string;
  tone?: "default" | "primary" | "danger" | "approval";
}

const toneClass: Record<NonNullable<FlowNode["tone"]>, string> = {
  default: "border-border bg-surface text-foreground",
  primary: "border-primary/40 bg-primary-soft text-primary",
  danger: "border-destructive/40 bg-destructive/10 text-destructive",
  approval: "border-approval/40 bg-approval/10 text-approval",
};

export function FlowStrip({
  nodes,
  animate = true,
  className,
}: {
  nodes: FlowNode[];
  animate?: boolean;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const shouldAnimate = animate && !reduce;

  return (
    <div
      className={cn(
        "flex flex-col items-stretch gap-2 sm:flex-row sm:items-center",
        className,
      )}
    >
      {nodes.map((node, i) => (
        <div key={node.label + i} className="flex flex-1 items-center gap-2">
          <motion.div
            {...(shouldAnimate
              ? {
                  initial: { opacity: 0, y: 8 },
                  whileInView: { opacity: 1, y: 0 },
                  viewport: { once: true, margin: "-40px" },
                  transition: { duration: 0.4, delay: i * 0.08 },
                }
              : {})}
            className={cn(
              "flex-1 rounded-xl border px-3 py-2.5 text-center",
              toneClass[node.tone ?? "default"],
            )}
          >
            <p className="mono text-[11px] uppercase tracking-[0.12em]">{node.label}</p>
            {node.sub ? (
              <p className="mt-0.5 text-[11px] text-muted-foreground">{node.sub}</p>
            ) : null}
          </motion.div>
          {i < nodes.length - 1 ? <Connector animate={shouldAnimate} index={i} /> : null}
        </div>
      ))}
    </div>
  );
}

function Connector({ animate, index }: { animate: boolean; index: number }) {
  return (
    <div className="relative hidden h-px w-8 shrink-0 overflow-hidden bg-border sm:block" aria-hidden>
      {animate ? (
        <motion.span
          className="absolute inset-y-0 -left-4 w-4 bg-primary"
          animate={{ x: [0, 48] }}
          transition={{
            duration: 1.2,
            repeat: Infinity,
            repeatDelay: 1.4,
            delay: index * 0.25,
            ease: "easeInOut",
          }}
        />
      ) : null}
    </div>
  );
}

export function ProtocolFlow() {
  const nodes: FlowNode[] = [
    { label: "AI Agent", sub: "intent" },
    { label: "Talos Guard", sub: "policy" },
    { label: "ZK Proof", sub: "Groth16" },
    { label: "Private Pool", sub: "notes" },
    { label: "X Layer", sub: "settlement", tone: "primary" },
  ];
  return (
    <div className="rounded-2xl border border-border bg-elevated p-4 shadow-[0_0_60px_-30px_rgba(164,249,29,0.55)]">
      <FlowStrip nodes={nodes} />
    </div>
  );
}
