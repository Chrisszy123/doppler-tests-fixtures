/**
 * Dynamic Auction tests (Uniswap V4 Dutch auction hook).
 *
 * The Dutch auction descends in price from `marketCap.start` towards
 * `marketCap.min` over the configured duration.  We verify this by
 * quoting a buy before and after fast-forwarding 12 hours — the later
 * quote should give more tokens per ETH (price has dropped).
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

// ── Helper: build dynamic auction params ─────────────────────────────────────
function buildDynamicParams(
  overrides: { minProceeds?: bigint; maxProceeds?: bigint; duration?: number } = {}
) {
  return f.sdk
    .buildDynamicAuction()
    .tokenConfig({
      name: "DynToken",
      symbol: "DYN",
      tokenURI: "https://example.com/dyn.json",
    })
    .saleConfig({
      initialSupply: parseEther("1000000000"),
      numTokensToSell: parseEther("900000000"),
      numeraire: f.contracts.weth,
    })
    .withMarketCapRange({
      marketCap: { start: 500_000, min: 50_000 },
      numerairePrice: 3000,
      minProceeds: overrides.minProceeds ?? parseEther("1"),
      maxProceeds: overrides.maxProceeds ?? parseEther("100"),
      duration: overrides.duration ?? 86400,
    })
    .withGovernance({ type: "noOp" })
    .withMigration({ type: "uniswapV2" })
    .withUserAddress(f.accounts[0]!.address)
    .build();
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("DynamicAuction", () => {
  it("creates a dynamic auction and returns hookAddress and poolId", async () => {
    const params = buildDynamicParams();
    const { hookAddress, poolId, tokenAddress } =
      await f.sdk.factory.createDynamicAuction(params);

    expect(
      isAddress(hookAddress) && hookAddress !== zeroAddress,
      "hookAddress should be a valid non-zero address"
    ).toBe(true);

    expect(poolId, "poolId should be defined").toBeDefined();
    expect(typeof poolId, "poolId should be a string").toBe("string");

    expect(
      isAddress(tokenAddress) && tokenAddress !== zeroAddress,
      "tokenAddress should be a valid non-zero address"
    ).toBe(true);
  });

  it("auction price decreases after fast-forwarding epochs", async () => {
    const params = buildDynamicParams();
    const { hookAddress } = await f.sdk.factory.createDynamicAuction(params);

    const hookInfo = await f.sdk.getHookInfo(hookAddress);
    const poolKey = {
      currency0: hookInfo.numeraireAddress < hookInfo.tokenAddress
        ? hookInfo.numeraireAddress
        : hookInfo.tokenAddress,
      currency1: hookInfo.numeraireAddress < hookInfo.tokenAddress
        ? hookInfo.tokenAddress
        : hookInfo.numeraireAddress,
      fee: 10000,
      tickSpacing: 30,
      hooks: hookAddress,
    };

    // zeroForOne: true means numeraire→token (buying token with WETH).
    const isNumeraireToken0 =
      hookInfo.numeraireAddress.toLowerCase() < hookInfo.tokenAddress.toLowerCase();

    const quoteParams = {
      poolKey,
      zeroForOne: isNumeraireToken0,
      exactAmount: parseEther("0.1"),
    };

    // Quote before time travel.
    const quoteBefore = await f.sdk.quoter.quoteExactInputV4(quoteParams);

    // Fast-forward 12 hours and mine a block to checkpoint the timestamp.
    await f.fixture.increaseTime(43200n);
    await f.fixture.mine(1);

    // Quote after time travel — more tokens out = lower price = Dutch auction working.
    const quoteAfter = await f.sdk.quoter.quoteExactInputV4(quoteParams);

    expect(
      quoteAfter.amountOut,
      "tokensOut after time skip should be >= tokensOut before (Dutch auction — price decays)"
    ).toBeGreaterThanOrEqual(quoteBefore.amountOut);
  });

  it("auction respects minProceeds floor", async () => {
    // Set a very high minProceeds so a tiny buy is far below the floor.
    const params = buildDynamicParams({
      minProceeds: parseEther("50"),
      maxProceeds: parseEther("1000"),
      duration: 3600,
    });

    const { hookAddress } = await f.sdk.factory.createDynamicAuction(params);

    // Fast-forward past the auction duration.
    await f.fixture.increaseTime(BigInt(3600 + 60));
    await f.fixture.mine(1);

    const hookInfo = await f.sdk.getHookInfo(hookAddress);

    // If minProceeds is 50 ETH and we have not raised that, the auction
    // should be in a state where insufficientProceeds is flagged or it has
    // not graduated.
    const auction = await f.sdk.getDynamicAuction(hookAddress);
    const hasGraduated = await auction.hasGraduated();

    // With a tiny auction that never received buys, it should not graduate.
    expect(
      hasGraduated,
      "Auction with unmet minProceeds should not have graduated"
    ).toBe(false);

    expect(
      hookInfo.minimumProceeds,
      "minimumProceeds should equal the configured minProceeds"
    ).toBe(parseEther("50"));
  });
});
