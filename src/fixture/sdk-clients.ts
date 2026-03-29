import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { DopplerSDK } from "@whetstone-research/doppler-sdk/evm";
import type { AnvilFixture } from "./anvil-fixture.js";

export interface SdkClients {
  publicClient: PublicClient;
  walletClient: WalletClient;
  sdk: DopplerSDK;
}

/**
 * Wires up viem clients and a DopplerSDK instance all pointed at the given
 * Anvil fixture's local RPC endpoint.
 *
 * The transport is the Anvil HTTP URL so every call goes directly to the
 * forked chain without touching an external RPC.
 */
export function createSdkClients(
  anvilFixture: AnvilFixture,
  account: { address: Address; privateKey: Hex },
  chainId: number
): SdkClients {
  const transport = http(anvilFixture.rpcUrl);

  const publicClient = createPublicClient({ transport }) as PublicClient;

  // Doppler SDK often calls waitForTransactionReceipt({ confirmations: 2 }).
  // On Anvil with automine, each tx gets exactly one block; the chain head is
  // still the block that included the tx, so viem's "2 confirmations" check
  // (needs one more block on top) is never satisfied.  It polls until the
  // default 180s timeout — not a "slow RPC" problem.
  //
  // For local forks, one mined block is sufficient; mainnet-style reorg safety
  // does not apply here.
  const innerWait = publicClient.waitForTransactionReceipt.bind(publicClient);
  publicClient.waitForTransactionReceipt = async (args) =>
    innerWait({ ...args, confirmations: 1 });

  const walletAccount = privateKeyToAccount(account.privateKey);
  const walletClient = createWalletClient({
    account: walletAccount,
    transport,
  }) as WalletClient;

  const sdk = new DopplerSDK({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    publicClient: publicClient as any,
    walletClient,
    chainId,
  });

  return { publicClient, walletClient, sdk };
}
