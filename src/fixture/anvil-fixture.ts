import { createServer } from "node:net";
import { createAnvil, type Anvil } from "@viem/anvil";
import {
  createTestClient,
  http,
  type Address,
} from "viem";
import { getChainConfig } from "./chain-config.js";

/** Resolves an available TCP port by briefly binding to port 0. */
async function getRandomPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (typeof addr === "object" && addr !== null) {
        const { port } = addr;
        server.close(() => resolve(port));
      } else {
        reject(new Error("Could not determine bound port"));
      }
    });
    server.on("error", reject);
  });
}

/** How long (ms) to wait for Anvil to become ready before giving up. */
const STARTUP_TIMEOUT_MS = 10_000;

// Use a loose type so the class doesn't fight viem's deeply-generic TestClient.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnvilTestClient = any;

export interface AnvilFixtureOptions {
  /** Pin to a specific block.  Defaults to latest. */
  forkBlockNumber?: bigint;
}

/**
 * Manages a single Anvil process and exposes helpers that map directly to
 * common test-harness operations (snapshot/revert, time travel, impersonation,
 * balance overrides, and manual mining).
 *
 * Each instance binds to its own random port so multiple fixtures can run in
 * parallel across Vitest worker processes.
 */
export class AnvilFixture {
  readonly #chainId: number;
  readonly #options: AnvilFixtureOptions;
  #anvil: Anvil | null = null;
  #port: number | null = null;
  #client: AnvilTestClient | null = null;

  constructor(chainId: number, options: AnvilFixtureOptions = {}) {
    this.#chainId = chainId;
    this.#options = options;
  }

  /** Start Anvil and wait for it to become ready. */
  async start(): Promise<void> {
    const chainConfig = getChainConfig(this.#chainId);
    this.#port = await getRandomPort();

    this.#anvil = createAnvil({
      forkUrl: chainConfig.rpcUrl,
      forkBlockNumber: this.#options.forkBlockNumber,
      port: this.#port,
      // Instant mining — blocks are mined only when `mine()` is called or
      // a transaction is submitted.  This gives tests full control over
      // chain progression.
      blockTime: undefined,
      chainId: this.#chainId,
    });

    const startPromise = this.#anvil.start();

    // Race the startup against a hard timeout so CI surfaces a clear error
    // rather than hanging indefinitely.
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(
              `Anvil failed to start within ${STARTUP_TIMEOUT_MS}ms on port ${this.#port}.\n` +
                "Make sure Foundry is installed:\n" +
                "  curl -L https://foundry.paradigm.xyz | bash && foundryup"
            )
          ),
        STARTUP_TIMEOUT_MS
      )
    );

    await Promise.race([startPromise, timeout]);

    // Build the viem test client against this Anvil instance.
    this.#client = createTestClient({
      transport: http(this.rpcUrl),
      mode: "anvil",
    });
  }

  /** The HTTP RPC URL of the running Anvil instance. */
  get rpcUrl(): string {
    if (this.#port === null) {
      throw new Error("AnvilFixture has not been started yet");
    }
    return `http://127.0.0.1:${this.#port}`;
  }

  /** The TCP port Anvil is listening on. */
  get port(): number {
    if (this.#port === null) {
      throw new Error("AnvilFixture has not been started yet");
    }
    return this.#port;
  }

  /** The underlying viem test client.  Use for low-level RPC calls. */
  getAnvilClient(): AnvilTestClient {
    return this.#assertClient();
  }

  // ── Chain time & block helpers ──────────────────────────────────────────────

  /** Mine `blocks` blocks (default: 1). */
  async mine(blocks = 1): Promise<void> {
    await this.#assertClient().mine({ blocks });
  }

  /** Set the timestamp that will be used for the *next* mined block. */
  async setNextBlockTimestamp(ts: bigint): Promise<void> {
    await this.#assertClient().setNextBlockTimestamp({ timestamp: ts });
  }

  /** Fast-forward the chain clock without mining a block. */
  async increaseTime(seconds: bigint): Promise<void> {
    await this.#assertClient().increaseTime({ seconds: Number(seconds) });
  }

  // ── Snapshot & revert ───────────────────────────────────────────────────────

  /** Save current chain state and return an opaque snapshot ID. */
  async snapshot(): Promise<string> {
    return this.#assertClient().snapshot();
  }

  /** Restore chain state to a previously saved snapshot. */
  async revert(snapshotId: string): Promise<void> {
    await this.#assertClient().revert({ id: snapshotId });
  }

  // ── Account helpers ─────────────────────────────────────────────────────────

  /** Allow transactions to be sent from `address` without a private key. */
  async impersonate(address: Address): Promise<void> {
    await this.#assertClient().impersonateAccount({ address });
  }

  /** Undo `impersonate()`. */
  async stopImpersonating(address: Address): Promise<void> {
    await this.#assertClient().stopImpersonatingAccount({ address });
  }

  /**
   * Override the ETH balance for `address`.
   * `value` is in wei (use `parseEther` from viem for human-readable amounts).
   */
  async setBalance(address: Address, value: bigint): Promise<void> {
    await this.#assertClient().setBalance({ address, value });
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  /** Gracefully shut down the Anvil process. */
  async stop(): Promise<void> {
    await this.#anvil?.stop();
    this.#anvil = null;
    this.#client = null;
    this.#port = null;
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  #assertClient(): AnvilTestClient {
    if (!this.#client) {
      throw new Error(
        "AnvilFixture has not been started.  Call `await fixture.start()` first."
      );
    }
    return this.#client;
  }
}

/**
 * Convenience factory: creates, starts, and returns an `AnvilFixture`.
 *
 * ```ts
 * const fixture = await createAnvilFixture(84532, { forkBlockNumber: 12345n })
 * ```
 */
export async function createAnvilFixture(
  chainId: number,
  options?: AnvilFixtureOptions
): Promise<AnvilFixture> {
  const fixture = new AnvilFixture(chainId, options);
  await fixture.start();
  return fixture;
}
