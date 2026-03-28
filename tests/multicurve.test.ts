/**
 * MulticurveBuilder tests (Uniswap V4 with multiple bonding curves).
 *
 * Each curve covers a market cap range and has a fixed share of the tokens.
 * Shares must sum to exactly 1e18 (100%); the SDK validates this and throws
 * if they don't.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { parseEther, isAddress, zeroAddress } from "viem";
import { createFixture, type Fixture } from "../src/index.js";

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

// ── Helper ────────────────────────────────────────────────────────────────────
function buildMulticurveParams(
  curves?: Parameters<
    ReturnType<typeof f.sdk.buildMulticurveAuction>["withCurves"]
  >[0]["curves"]
) {
  const defaultCurves = [
    {
      marketCap: { start: 500_000, end: 1_500_000 as number | "max" },
      numPositions: 10,
      shares: parseEther("0.4"),
    },
    {
      marketCap: { start: 1_000_000, end: 5_000_000 as number | "max" },
      numPositions: 10,
      shares: parseEther("0.5"),
    },
    {
      marketCap: { start: 5_000_000, end: "max" as const },
      numPositions: 1,
      shares: parseEther("0.1"),
    },
  ];

  return f.sdk
    .buildMulticurveAuction()
    .tokenConfig({
      name: "CurveToken",
      symbol: "CRV",
      tokenURI: "https://example.com/curve.json",
    })
    .saleConfig({
      initialSupply: parseEther("1000000000"),
      numTokensToSell: parseEther("900000000"),
      numeraire: f.contracts.weth,
    })
    .withCurves({
      numerairePrice: 3000,
      curves: curves ?? defaultCurves,
    })
    .withGovernance({ type: "noOp" })
    .withMigration({ type: "noOp" })
    .withUserAddress(f.accounts[0]!.address)
    .build();
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("MulticurveAuction", () => {
  it("creates a multicurve pool with three curve segments", async () => {
    const params = buildMulticurveParams();
    const { poolId, tokenAddress } =
      await f.sdk.factory.createMulticurve(params);

    expect(poolId, "poolId should be defined").toBeDefined();
    expect(typeof poolId, "poolId should be a string").toBe("string");

    expect(
      isAddress(tokenAddress) && tokenAddress !== zeroAddress,
      "tokenAddress should be a valid non-zero address"
    ).toBe(true);
  });

  it("rejects curves whose shares do not sum to 1e18", async () => {
    // Shares only sum to 0.9e18 — the SDK should throw.
    const badCurves = [
      {
        marketCap: { start: 500_000, end: 1_500_000 as number | "max" },
        numPositions: 10,
        shares: parseEther("0.4"),
      },
      {
        marketCap: { start: 1_000_000, end: 5_000_000 as number | "max" },
        numPositions: 10,
        shares: parseEther("0.5"),
      },
      // Missing 0.1 share — total is only 90%.
    ];

    expect(
      () => buildMulticurveParams(badCurves),
      "Building with shares summing to 90% should throw"
    ).toThrow();
  });

  it("pool state is retrievable after creation", async () => {
    const params = buildMulticurveParams();
    const { tokenAddress } = await f.sdk.factory.createMulticurve(params);

    const pool = await f.sdk.getMulticurvePool(tokenAddress);
    const state = await pool.getState();

    expect(
      isAddress(state.asset) && state.asset !== zeroAddress,
      "Pool state should contain a valid asset (token) address"
    ).toBe(true);

    expect(
      isAddress(state.numeraire),
      "Pool state should contain a valid numeraire address"
    ).toBe(true);

    expect(
      state.numeraire.toLowerCase(),
      "Pool numeraire should match the configured WETH address"
    ).toBe(f.contracts.weth.toLowerCase());
  });
});
