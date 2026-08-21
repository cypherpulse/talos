import { privateKeyToAccount } from "viem/accounts";
import type { Account, Address, Hex } from "viem";

/**
 * SignerProvider abstraction (Phase 4 §30). The rest of the app depends on this
 * interface, never on a raw private key, so a future HSM/KMS/multisig signer is a
 * drop-in replacement. The key is never logged or returned through APIs.
 */
export interface SignerProvider {
  readonly address: Address;
  readonly account: Account;
}

/** Environment-backed development signer. Testnet/dev keys only. */
export function createEnvSigner(privateKey: string): SignerProvider {
  const account = privateKeyToAccount(privateKey as Hex);
  return { address: account.address, account };
}
