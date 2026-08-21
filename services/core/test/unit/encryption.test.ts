import { describe, expect, it } from "vitest";
import { NoteEncryptionService } from "../../src/notes/encryption.js";

const KEY = "0x" + "ab".repeat(32);

describe("NoteEncryptionService (AES-256-GCM)", () => {
  it("round-trips plaintext", () => {
    const enc = new NoteEncryptionService(KEY);
    const ct = enc.encrypt("super secret note material");
    expect(ct).not.toContain("secret");
    expect(enc.decrypt(ct)).toBe("super secret note material");
  });

  it("round-trips JSON", () => {
    const enc = new NoteEncryptionService(KEY);
    const obj = { secret: "123", nonce: "456" };
    expect(enc.decryptJson(enc.encryptJson(obj))).toEqual(obj);
  });

  it("produces unique ciphertexts (random IV)", () => {
    const enc = new NoteEncryptionService(KEY);
    expect(enc.encrypt("x")).not.toBe(enc.encrypt("x"));
  });

  it("rejects tampered ciphertext (auth tag)", () => {
    const enc = new NoteEncryptionService(KEY);
    const ct = Buffer.from(enc.encrypt("hello"), "base64");
    ct[ct.length - 1] ^= 0x01;
    expect(() => enc.decrypt(ct.toString("base64"))).toThrow();
  });

  it("fails to decrypt with the wrong key", () => {
    const ct = new NoteEncryptionService(KEY).encrypt("hello");
    const other = new NoteEncryptionService("0x" + "cd".repeat(32));
    expect(() => other.decrypt(ct)).toThrow();
  });

  it("rejects a key of the wrong length", () => {
    expect(() => new NoteEncryptionService("0x1234")).toThrow();
  });
});
