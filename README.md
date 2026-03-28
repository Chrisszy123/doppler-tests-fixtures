# doppler-test-fixtures

Faucet-free integration testing for the Doppler SDK using Anvil local forks.

---

## The problem

Integrating and testing the Doppler SDK against real on-chain state is harder than it looks.  The standard approach — point your tests at a public testnet — introduces at least four failure modes before you write a single assertion.

**Faucet rate limits and fragility.**  Base Sepolia, Unichain Sepolia, and Monad Testnet each have their own faucet with their own daily limits and rate-limiting logic.  CI pipelines fail unpredictably when a faucet is down, saturated, or blocking by IP.  Developers working on multiple branches simultaneously contend for the same tiny balance pool.

**Nondeterministic chain state.**  Public testnets are shared infrastructure.  Block times vary, other deployers interact with the same contracts, and the exact sqrtPrice of a pool you created three seconds ago might look nothing like it did when you seeded your test fixtures.  Flaky tests that pass locally and fail in CI — or vice versa — are the inevitable result.

**Slow feedback cycles.**  A static auction creation on a real testnet requires waiting for transaction confirmation, which can mean anywhere from 2 to 30 seconds per test depending on congestion.  A full test suite that covers all governance × migrator combinations across three chains can easily take 10–15 minutes on a slow testnet.  That's too slow for a fast iteration loop.

**CI secret sprawl.**  Every RPC URL is a secret that must be added to GitHub Actions, rotated when it expires, and provisioned in every fork's environment.  Doppler supports Base, Unichain, Monad, Ink, and more — each with their own testnet.  Managing a grid of faucet wallets and RPC secrets across that many chains doesn't scale.

---

## The solution

`doppler-test-fixtures` forks a real testnet at a pinned block number using [Anvil](https://book.getfoundry.sh/anvil/), the local Ethereum node shipped with Foundry.  All the state — deployed contracts, pool liquidity, Doppler configuration — is exactly as it exists on the real chain.  But everything runs locally, in memory, in milliseconds.

**Pre-funded accounts.**  Anvil seeds 10 deterministic accounts with 10 000 ETH each on every startup.  No faucet required.  Tests that simulate multiple traders simply pull from `ANVIL_ACCOUNTS`.

**Instant mining.**  Blocks are mined on demand, not on a timer.  Time-sensitive tests (Dutch auction epoch decay, vesting cliffs) call `fixture.increaseTime(seconds)` and `fixture.mine(1)` to checkpoint the new timestamp.  No `sleep()` required.

**Snapshot/revert isolation.**  At the start of each test file, the fixture takes a snapshot of the forked state.  `beforeEach` reverts to that snapshot so every test starts from an identical baseline.  State from one test cannot pollute another.

**One optional secret.**  If you supply `BASE_SEPOLIA_RPC_URL` as a GitHub Actions secret the fork is sourced from a private node with a pinned block.  Without it, a public RPC fallback is used.  Either way, CI runs without provisioning any faucet wallet.

---

## Quick start

```bash
npm install

# Install Foundry (required for Anvil)
curl -L https://foundry.paradigm.xyz | bash
foundryup

npm test
```

RPC URLs are read from environment variables and fall back to public endpoints:

| Variable | Default |
|---|---|
| `BASE_SEPOLIA_RPC_URL` | `https://sepolia.base.org` |
| `UNICHAIN_SEPOLIA_RPC_URL` | `https://sepolia.unichain.org` |
| `MONAD_TESTNET_RPC_URL` | `https://testnet-rpc.monad.xyz` |

---

## Architecture

The project is organised into four layers:

### 1. Fixture layer (`src/fixture/`)

| File | Responsibility |
|---|---|
| `chain-config.ts` | Typed `ChainConfig` records with deployed contract addresses for each supported chain. `getChainConfig(chainId)` throws with a descriptive error for unsupported chains. |
| `anvil-fixture.ts` | Manages a single Anvil process.  Exposes helpers for mining, time travel, snapshot/revert, impersonation, and balance overrides.  Each instance binds to a random port so multiple fixtures can run in parallel across Vitest worker processes. |
| `funded-accounts.ts` | Exports the 10 deterministic Anvil accounts (`ANVIL_ACCOUNTS`, `DEPLOYER`, `TRADER_A`, etc.) with typed `Address` and `Hex` private keys. |
| `sdk-clients.ts` | `createSdkClients()` wires a viem `PublicClient`, `WalletClient`, and `DopplerSDK` instance all pointed at the Anvil HTTP endpoint. |

### 2. Test scenarios (`tests/`)

| File | What it tests |
|---|---|
| `static-auction.test.ts` | Token deployment, name/symbol reads, total supply, zero-address rejection |
| `dynamic-auction.test.ts` | Hook creation, Dutch auction price decay over time, minProceeds floor |
| `multicurve.test.ts` | Multi-segment bonding curves, share validation, pool state reads |
| `swap.test.ts` | Quote accuracy, buy/sell balance changes, 1% quote-execution drift guard |
| `migration.test.ts` | Full lifecycle: large buys → graduation → V2 pool creation → LP lock |
| `config-matrix.test.ts` | Every governance × migrator combination as parameterised tests |

### 3. CI pipeline (`.github/workflows/test.yml`)

- Node.js 20, `npm ci`, Foundry toolchain
- Type-checks before running tests
- Uses `BASE_SEPOLIA_RPC_URL` from GitHub Actions secrets (optional — falls back to public RPC)

### 4. Multichain config matrix

`chain-config.ts` maps each supported chain ID to its full set of deployed contract addresses sourced directly from the [Doppler docs](https://docs.doppler.lol/reference/contract-addresses).  Adding a new chain is a single object in `CHAIN_CONFIGS`.

---

## Writing your own tests

```ts
import { createFixture } from "../src/index.js"
import { parseEther } from "viem"

const { sdk, accounts, contracts, reset, teardown } = await createFixture()

afterAll(teardown)
beforeEach(reset)

it("creates a token", async () => {
  const params = sdk
    .buildStaticAuction()
    .tokenConfig({ name: "My Token", symbol: "MTK", tokenURI: "https://..." })
    .saleConfig({
      initialSupply: parseEther("1000000000"),
      numTokensToSell: parseEther("800000000"),
      numeraire: contracts.weth,
    })
    .withMarketCapRange({ marketCap: { start: 100_000, end: 5_000_000 }, numerairePrice: 3000 })
    .withGovernance({ type: "noOp" })
    .withMigration({ type: "noOp" })
    .withUserAddress(accounts[0].address)
    .build()

  const result = await sdk.factory.createStaticAuction(params)
  expect(result.tokenAddress).toBeDefined()
})
```

`createFixture` accepts optional overrides:

```ts
const f = await createFixture({
  chainId: 1301,          // Unichain Sepolia
  forkBlockNumber: 5000n, // pin to a specific block
  accountIndex: 2,        // use ANVIL_ACCOUNTS[2] as primary signer
})
```

For lower-level access, all fixture primitives are individually exported:

```ts
import {
  createAnvilFixture,   // raw Anvil process manager
  ANVIL_ACCOUNTS,       // typed funded accounts
  createSdkClients,     // viem + DopplerSDK wiring
  getChainConfig,       // chain address lookup
} from "../src/index.js"
```

---

## Supported chains

| Chain | Chain ID | Airlock | V3 Initializer | V4 Initializer | V2 Migrator |
|---|---|---|---|---|---|
| Base Sepolia | 84532 | ✓ | ✓ | ✓ | ✓ |
| Unichain Sepolia | 1301 | ✓ | ✓ | ✓ | ✓ |
| Monad Testnet | 10143 | ✓ | ✓ | ✓ | ✓ |

All addresses are sourced from the [official Doppler deployment registry](https://docs.doppler.lol/reference/contract-addresses).  Adding mainnet chains (Base, Unichain, Monad Mainnet) requires only adding entries to `CHAIN_CONFIGS` in `src/fixture/chain-config.ts`.

---

## Why this matters for multichain deployments

`config-matrix.test.ts` runs a static auction creation for every combination of governance type (`noOp`, `default`) and migration target (`noOp`, `uniswapV2`, `uniswapV4`).  This is a direct analogue of the real operational challenge: Doppler integrators choose their own governance and migration configuration at launch time, producing a combinatorial space of possible deployments.

A regression in any governance factory or migrator contract is caught immediately, before it ships, without manually testing each combination on a live testnet.  Extend the `CONFIGS` array in `config-matrix.test.ts` to cover any new factory or migrator variant — the test infrastructure handles the rest.
