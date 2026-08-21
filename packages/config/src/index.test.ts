import { describe, it, expect } from "vitest";
import { TALOS_VERSION, XLAYER_TESTNET_CHAIN_ID } from "./index.js";

describe("@talos/config", () => {
  it("exposes the package version", () => {
    expect(TALOS_VERSION).toBe("0.1.0");
  });

  it("targets the X Layer testnet chain id", () => {
    expect(XLAYER_TESTNET_CHAIN_ID).toBe(195);
  });
});
