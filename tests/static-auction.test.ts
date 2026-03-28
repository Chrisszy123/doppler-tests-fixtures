/**
 * Static Auction tests (Uniswap V3 style).
 *
 * Each test gets a clean fork state via reset().  The Anvil process is shared
 * across the whole file and torn down in afterAll.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { parseEther, isAddress, zeroAddress } from "viem";
import { createFixture, type Fixture } from "../src/index.js";

// ── Standard ERC20 ABI fragments used for contract reads ──────────────────────
const erc20Abi = [
  { name: "name",        type: "function", inputs: [], outputs: [{ type: "string" }], stateMutability: "view" },
  { name: "symbol",      type: "function", inputs: [], outputs: [{ type: "string" }], stateMutability: "view" },
  { name: "totalSupply", type: "function", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
] as const;

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

// ── Helper: build static auction params ──────────────────────────────────────
function buildStaticParams(symbol = "TEST") {
  return f.sdk
    .buildStaticAuction()
    .tokenConfig({
      name: "TestToken",
      symbol,
      tokenURI: "https://example.com/metadata.json",
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
    .withGovernance({ type: "noOp" })
    .withMigration({ type: "noOp" })
    .withUserAddress(f.accounts[0]!.address)
    .build();
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("StaticAuction", () => {
  it("deploys a token and returns a valid address", async () => {
    const params = buildStaticParams();
    const { poolAddress, tokenAddress } =
      await f.sdk.factory.createStaticAuction(params);

    expect(
      isAddress(poolAddress) && poolAddress !== zeroAddress,
      "poolAddress should be a valid non-zero Ethereum address"
    ).toBe(true);

    expect(
      isAddress(tokenAddress) && tokenAddress !== zeroAddress,
      "tokenAddress should be a valid non-zero Ethereum address"
    ).toBe(true);
  });

  it("pool is initialized with the correct token name and symbol", async () => {
    const params = buildStaticParams("TEST");
    const { tokenAddress } = await f.sdk.factory.createStaticAuction(params);

    const name = await f.publicClient.readContract({
      address: tokenAddress,
      abi: erc20Abi,
      functionName: "name",
    });
    const symbol = await f.publicClient.readContract({
      address: tokenAddress,
      abi: erc20Abi,
      functionName: "symbol",
    });

    expect(name, "Token name should match the configured name").toBe(
      "TestToken"
    );
    expect(symbol, "Token symbol should match the configured symbol").toBe(
      "TEST"
    );
  });

  it("token total supply matches initialSupply", async () => {
    const params = buildStaticParams();
    const { tokenAddress } = await f.sdk.factory.createStaticAuction(params);

    const totalSupply = await f.publicClient.readContract({
      address: tokenAddress,
      abi: erc20Abi,
      functionName: "totalSupply",
    });

    expect(totalSupply, "totalSupply should equal the configured initialSupply").toBe(
      parseEther("1000000000")
    );
  });

  it("fails gracefully when numeraire address is zero", async () => {
    const badParams = f.sdk
      .buildStaticAuction()
      .tokenConfig({
        name: "BadToken",
        symbol: "BAD",
        tokenURI: "https://example.com/bad.json",
      })
      .saleConfig({
        initialSupply: parseEther("1000000000"),
        numTokensToSell: parseEther("800000000"),
        numeraire: zeroAddress,
      })
      .withMarketCapRange({
        marketCap: { start: 100_000, end: 5_000_000 },
        numerairePrice: 3000,
      })
      .withGovernance({ type: "noOp" })
      .withMigration({ type: "noOp" })
      .withUserAddress(f.accounts[0]!.address)
      .build();

    await expect(
      f.sdk.factory.createStaticAuction(badParams),
      "Creating a pool with zero numeraire address should throw"
    ).rejects.toThrow();
  });
});
