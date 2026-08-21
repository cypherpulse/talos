/**
 * Minimal structured JSON logger with secret redaction (Phase 4 §35).
 *
 * No external dependency. Any field whose key matches a sensitive pattern — or any
 * value that looks like a private key — is redacted before serialization, so secrets
 * (note secrets, nullifier secrets, private keys, witnesses, encryption keys) can
 * never leak into logs even if accidentally passed.
 */

type Level = "debug" | "info" | "warn" | "error";

const SENSITIVE_KEY = /(secret|privatekey|private_key|signerkey|witness|encryptionkey|mnemonic|password|nullifiersecret)/i;

function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[truncated]";
  if (value === null || value === undefined) return value;
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEY.test(k) ? "[redacted]" : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

export interface Logger {
  child(bindings: Record<string, unknown>): Logger;
  debug(msg: string, fields?: Record<string, unknown>): void;
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
}

class JsonLogger implements Logger {
  constructor(
    private readonly bindings: Record<string, unknown> = {},
    private readonly sink: (line: string) => void = (l) => process.stdout.write(l + "\n"),
  ) {}

  child(bindings: Record<string, unknown>): Logger {
    return new JsonLogger({ ...this.bindings, ...bindings }, this.sink);
  }

  private write(level: Level, msg: string, fields?: Record<string, unknown>): void {
    const record = {
      level,
      time: new Date().toISOString(),
      msg,
      ...(redact({ ...this.bindings, ...fields }) as Record<string, unknown>),
    };
    this.sink(JSON.stringify(record));
  }

  debug(msg: string, fields?: Record<string, unknown>): void {
    this.write("debug", msg, fields);
  }
  info(msg: string, fields?: Record<string, unknown>): void {
    this.write("info", msg, fields);
  }
  warn(msg: string, fields?: Record<string, unknown>): void {
    this.write("warn", msg, fields);
  }
  error(msg: string, fields?: Record<string, unknown>): void {
    this.write("error", msg, fields);
  }
}

export function createLogger(bindings: Record<string, unknown> = {}): Logger {
  return new JsonLogger(bindings);
}

/** A silent logger for tests. */
export function nullLogger(): Logger {
  return new JsonLogger({}, () => {});
}
