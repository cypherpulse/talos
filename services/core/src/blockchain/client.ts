import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  type Abi,
  type Address,
  type Hash,
  type Hex,
  type PublicClient,
  type TransactionReceipt,
  type WalletClient,
} from "viem";
import type { TalosConfig } from "../config/index.js";
import type { SignerProvider } from "./signer.js";
import { BlockchainUnavailable } from "../errors/index.js";

/**
 * X Layer blockchain client (Phase 4 §5) built on viem. Wraps the read primitives
 * and transaction submission behind typed methods; RPC failures surface as a typed
 * BlockchainUnavailable error. No RPC URL is hardcoded — it comes from config.
 */
export class ChainClient {
  readonly publicClient: PublicClient;
  readonly walletClient: WalletClient;
  readonly chain;
  private readonly confirmations: number;
  private readonly pollingIntervalMs: number;

  constructor(cfg: TalosConfig["chain"], private readonly signer: SignerProvider) {
    this.chain = defineChain({
      id: cfg.chainId,
      name: "xlayer",
      nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 },
      rpcUrls: { default: { http: [cfg.rpcUrl] } },
      ...(cfg.explorerUrl ? { blockExplorers: { default: { name: "explorer", url: cfg.explorerUrl } } } : {}),
    });
    this.confirmations = cfg.confirmationsRequired;
    this.pollingIntervalMs = cfg.pollingIntervalMs;
    this.publicClient = createPublicClient({ chain: this.chain, transport: http(cfg.rpcUrl) }) as PublicClient;
    this.walletClient = createWalletClient({ chain: this.chain, transport: http(cfg.rpcUrl), account: signer.account });
  }

  get signerAddress(): Address {
    return this.signer.address;
  }

  get requiredConfirmations(): number {
    return this.confirmations;
  }

  private async guard<T>(what: string, fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      throw BlockchainUnavailable(`RPC call failed: ${what}`, { cause: String(e) });
    }
  }

  getBlockNumber(): Promise<bigint> {
    return this.guard("getBlockNumber", () => this.publicClient.getBlockNumber());
  }

  getBalance(address: Address): Promise<bigint> {
    return this.guard("getBalance", () => this.publicClient.getBalance({ address }));
  }

  getGasPrice(): Promise<bigint> {
    return this.guard("getGasPrice", () => this.publicClient.getGasPrice());
  }

  getTransactionReceipt(hash: Hash): Promise<TransactionReceipt> {
    return this.guard("getTransactionReceipt", () => this.publicClient.getTransactionReceipt({ hash }));
  }

  async getConfirmations(hash: Hash): Promise<bigint> {
    return this.guard("getTransactionConfirmations", () =>
      this.publicClient.getTransactionConfirmations({ hash }),
    );
  }

  readContract<T>(address: Address, abi: Abi, functionName: string, args: readonly unknown[] = []): Promise<T> {
    return this.guard(`readContract:${functionName}`, () =>
      this.publicClient.readContract({ address, abi, functionName, args }) as Promise<T>,
    );
  }

  async estimateContractGas(
    address: Address,
    abi: Abi,
    functionName: string,
    args: readonly unknown[],
  ): Promise<bigint> {
    return this.guard(`estimateContractGas:${functionName}`, () =>
      this.publicClient.estimateContractGas({
        address,
        abi,
        functionName,
        args,
        account: this.signer.account,
      }),
    );
  }

  async writeContract(
    address: Address,
    abi: Abi,
    functionName: string,
    args: readonly unknown[],
  ): Promise<Hash> {
    return this.guard(`writeContract:${functionName}`, async () => {
      const { request } = await this.publicClient.simulateContract({
        address,
        abi,
        functionName,
        args,
        account: this.signer.account,
      });
      return this.walletClient.writeContract(request);
    });
  }

  /** Wait for a receipt at the configured confirmation depth. */
  waitForReceipt(hash: Hash, confirmations = this.confirmations): Promise<TransactionReceipt> {
    return this.guard("waitForTransactionReceipt", () =>
      this.publicClient.waitForTransactionReceipt({ hash, confirmations, pollingInterval: this.pollingIntervalMs }),
    );
  }

  async isHealthy(): Promise<boolean> {
    try {
      await this.publicClient.getBlockNumber();
      return true;
    } catch {
      return false;
    }
  }
}

export type { Address, Hash, Hex };
