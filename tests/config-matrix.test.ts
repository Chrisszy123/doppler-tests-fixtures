/**
 * Config-matrix tests: parameterised across every governance × migrator
 * combination the SDK supports.
 *
 * This directly mirrors the operational challenge of supporting many integrator
 * configurations across many chains: if we ship a new governance factory or
 * migrator, adding it here ensures it works end-to-end before it ships.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { parseEther, isAddress, zeroAddress } from "viem";
import { createFixture, type Fixture } from "../src/index.js";
import type { MigrationConfig } from "@whetstone-research/doppler-sdk/evm";

// ── Config matrix ─────────────────────────────────────────────────────────────

interface TestConfig {
  label: string;
  governance: { type: "noOp" | "default" };
  migration: MigrationConfig;
}

// Excluded combinations and why:
//
// • noOp migration (any governance): the SDK requires .withBeneficiaries() when
//   noOp migration is used, which in turn requires the Airlock owner address to
//   be one of the beneficiaries (min 5% share).  The owner is a Whetstone deploy
//   key that isn't one of our test accounts, making these cases non-trivial to
//   set up without an on-chain read.  They are tested separately in isolation.
//
// • noOp governance + V4 migrator: the Airlock on the Base Sepolia fork returns
//   WrongModuleState for this combination — the noOp governance factory address
//   the SDK resolves for Base Sepolia is not whitelisted to work with the V4
//   migrator in the deployed contract state.
const CONFIGS: TestConfig[] = [
  {
    label: "noOp governance + V2 migrator",
    governance: { type: "noOp" },
    migration: { type: "uniswapV2" },
  },
  {
    label: "default governance + V2 migrator",
    governance: { type: "default" },
    migration: { type: "uniswapV2" },
  },
  {
    label: "default governance + V4 migrator",
    governance: { type: "default" },
    migration: {
      type: "uniswapV4",
      fee: 3000,
      tickSpacing: 60,
    },
  },
];

// ── Shared fixture ────────────────────────────────────────────────────────────

let f: Fixture;

beforeAll(async () => {
  f = await createFixture({ chainId: 84532 });
});

afterAll(async () => {
  await f.teardown();
});

beforeEach(async () => {
  await f.reset();
});

// ── Parameterised tests ───────────────────────────────────────────────────────

describe("Config matrix — governance × migration combinations", () => {
  for (const config of CONFIGS) {
    it(`creates static auction with: ${config.label}`, async () => {
      // Build params — the builder validates all parameters and will throw for
      // invalid combinations before any chain call is made.
      const params = f.sdk
        .buildStaticAuction()
        .tokenConfig({
          name: `MatrixToken-${config.label}`,
          symbol: `MTX`,
          tokenURI: "https://example.com/matrix.json",
        })
        .saleConfig({
          initialSupply: parseEther("1000000000"),
          numTokensToSell: parseEther("800000000"),
          numeraire: f.contracts.weth,
        })
        .withMarketCapRange({
          marketCap: { start: 100_000, end: 5_000_000 },
          numerairePrice: 3000,
        })
        .withGovernance(config.governance)
        .withMigration(config.migration)
        .withUserAddress(f.accounts[0]!.address)
        .build();

      const result = await f.sdk.factory.createStaticAuction(params);

      expect(
        result.tokenAddress,
        `[${config.label}] tokenAddress should be a valid checksummed address`
      ).toMatch(/^0x[0-9a-fA-F]{40}$/);

      expect(
        isAddress(result.tokenAddress) && result.tokenAddress !== zeroAddress,
        `[${config.label}] tokenAddress should be non-zero`
      ).toBe(true);

      expect(
        isAddress(result.poolAddress) && result.poolAddress !== zeroAddress,
        `[${config.label}] poolAddress should be non-zero`
      ).toBe(true);
    });
  }
});
