import type { DopplerSDK } from "@whetstone-research/doppler-sdk/evm";
import type { PublicClient, WalletClient } from "viem";
import {
  AnvilFixture,
  createAnvilFixture,
  type AnvilFixtureOptions,
} from "./fixture/anvil-fixture.js";
import { ANVIL_ACCOUNTS, getAccount } from "./fixture/funded-accounts.js";
import { createSdkClients } from "./fixture/sdk-clients.js";
import { getChainConfig, type ChainContracts } from "./fixture/chain-config.js";

export interface CreateFixtureOptions {
  /** Target chain (default: Base Sepolia = 84532). */
  chainId?: number;
  /** Optional block pin for deterministic state. */
  forkBlockNumber?: bigint;
  /** Which funded Anvil account to use as the primary signer (default: 0). */
  accountIndex?: number;
}

export interface Fixture {
  fixture: AnvilFixture;
  sdk: DopplerSDK;
  publicClient: PublicClient;
  walletClient: WalletClient;
  /** All 10 pre-funded Anvil accounts. */
  accounts: typeof ANVIL_ACCOUNTS;
  /** Deployed contract addresses for the active chain. */
  contracts: ChainContracts;
  /**
   * Reverts to the snapshot taken at fixture creation, then takes a fresh
   * snapshot.  Call this in `beforeEach` for test isolation.
   */
  reset: () => Promise<void>;
  /** Gracefully stops the Anvil process.  Call this in `afterAll`. */
  teardown: () => Promise<void>;
}

/**
 * High-level factory that starts an Anvil fork, wires up the Doppler SDK, and
 * returns a test handle with snapshot-based isolation helpers.
 *
 * ```ts
 * const { sdk, accounts, reset, teardown } = await createFixture()
 *
 * afterAll(teardown)
 * beforeEach(reset)
 * ```
 */
export async function createFixture(
  options: CreateFixtureOptions = {}
): Promise<Fixture> {
  const chainId = options.chainId ?? 84532;
  const accountIndex = options.accountIndex ?? 0;

  const anvilOptions: AnvilFixtureOptions = {
    forkBlockNumber: options.forkBlockNumber,
  };

  const fixture = await createAnvilFixture(chainId, anvilOptions);

  // Snapshot taken immediately after startup — this is the clean baseline.
  let baseSnapshot = await fixture.snapshot();

  const account = getAccount(accountIndex);
  const { publicClient, walletClient, sdk } = createSdkClients(
    fixture,
    account,
    chainId
  );

  const chainConfig = getChainConfig(chainId);

  async function reset(): Promise<void> {
    await fixture.revert(baseSnapshot);
    // After reverting, the old snapshot ID is consumed — take a new one so
    // subsequent resets have a valid ID to revert to.
    baseSnapshot = await fixture.snapshot();
  }

  async function teardown(): Promise<void> {
    await fixture.stop();
  }

  return {
    fixture,
    sdk,
    publicClient,
    walletClient,
    accounts: ANVIL_ACCOUNTS,
    contracts: chainConfig.contracts,
    reset,
    teardown,
  };
}

// ── Lower-level re-exports for consumers who need fine-grained control ────────
export {
  AnvilFixture,
  createAnvilFixture,
  ANVIL_ACCOUNTS,
  getAccount,
  getChainConfig,
  createSdkClients,
};
export type { AnvilFixtureOptions, ChainContracts };
export { DEPLOYER, INTEGRATOR, TRADER_A, TRADER_B } from "./fixture/funded-accounts.js";
export type { ChainConfig } from "./fixture/chain-config.js";
