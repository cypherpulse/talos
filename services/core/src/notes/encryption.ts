import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * NoteEncryptionService — authenticated encryption for note secrets at rest (§11).
 *
 * Uses AES-256-GCM from Node's audited crypto module — NO custom cryptography. The
 * key is supplied from configuration (0x + 64 hex = 32 bytes) and never logged or
 * returned through APIs. Output format: base64(iv | ciphertext | authTag).
 */
export class NoteEncryptionService {
  private readonly key: Buffer;

  constructor(keyHex: string) {
    const clean = keyHex.startsWith("0x") ? keyHex.slice(2) : keyHex;
    const key = Buffer.from(clean, "hex");
    if (key.length !== 32) throw new Error("NOTE_ENCRYPTION_KEY must be 32 bytes (0x + 64 hex)");
    this.key = key;
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, ct, tag]).toString("base64");
  }

  decrypt(payload: string): string {
    const raw = Buffer.from(payload, "base64");
    if (raw.length < 12 + 16) throw new Error("ciphertext too short");
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(raw.length - 16);
    const ct = raw.subarray(12, raw.length - 16);
    const decipher = createDecipheriv("aes-256-gcm", this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
  }

  encryptJson(value: unknown): string {
    return this.encrypt(JSON.stringify(value));
  }

  decryptJson<T>(payload: string): T {
    return JSON.parse(this.decrypt(payload)) as T;
  }
}
