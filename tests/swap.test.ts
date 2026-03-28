/**
 * Buy / sell flow tests using the SDK quoter and direct V3 router interaction.
 *
 * Static auctions use Uniswap V3, so swaps go through the V3 SwapRouter.
 * We use viem's writeContract with the Uniswap V3 SwapRouter ABI.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  parseEther,
  maxUint256,
  type Address,
} from "viem";
import { createFixture, type Fixture } from "../src/index.js";

// ── Minimal ABIs ──────────────────────────────────────────────────────────────
const erc20Abi = [
  {
    name: "balanceOf",
    type: "function",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    name: "approve",
    type: "function",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
  },
] as const;

// Uniswap V3 SwapRouter exactInputSingle
const swapRouterAbi = [
  {
    name: "exactInputSingle",
    type: "function",
    stateMutability: "payable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "fee", type: "uint24" },
          { name: "recipient", type: "address" },
          { name: "deadline", type: "uint256" },
          { name: "amountIn", type: "uint256" },
          { name: "amountOutMinimum", type: "uint256" },
          { name: "sqrtPriceLimitX96", type: "uint160" },
        ],
      },
    ],
    outputs: [{ name: "amountOut", type: "uint256" }],
  },
] as const;

// WETH9 deposit ABI — wrap native ETH into WETH for V3 swaps.
const weth9Abi = [
  {
    name: "deposit",
    type: "function",
    stateMutability: "payable",
    inputs: [],
    outputs: [],
  },
  {
    name: "approve",
    type: "function",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
  },
  {
    name: "balanceOf",
    type: "function",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
] as const;

// ── Constants ─────────────────────────────────────────────────────────────────
// Uniswap V3 SwapRouter02 on Base Sepolia.
const SWAP_ROUTER: Address = "0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4";
const POOL_FEE = 10000; // 1% — default for Doppler static auctions

// ── Shared fixture ────────────────────────────────────────────────────────────
let f: Fixture;
let poolAddress: Address;
let tokenAddress: Address;

beforeAll(async () => {
  f = await createFixture({ chainId: 84532 });

  // Create one pool that all swap tests share.
  const params = f.sdk
    .buildStaticAuction()
    .tokenConfig({
      name: "SwapToken",
      symbol: "SWAP",
      tokenURI: "https://example.com/swap.json",
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

  const result = await f.sdk.factory.createStaticAuction(params);
  poolAddress = result.poolAddress;
  tokenAddress = result.tokenAddress;
});

afterAll(async () => {
  await f.teardown();
});

beforeEach(async () => {
  await f.reset();
});

// ── Helper: wrap ETH → WETH and approve router ───────────────────────────────
async function wrapAndApprove(
  account: (typeof f.accounts)[number],
  amountEth: bigint
): Promise<void> {
  // Deposit ETH into WETH9.
  await f.walletClient.writeContract({
    address: f.contracts.weth,
    abi: weth9Abi,
    functionName: "deposit",
    value: amountEth,
    account: account.address,
    chain: null,
  });

  // Approve SwapRouter to spend WETH.
  await f.walletClient.writeContract({
    address: f.contracts.weth,
    abi: weth9Abi,
    functionName: "approve",
    args: [SWAP_ROUTER, maxUint256],
    account: account.address,
    chain: null,
  });
}

// ── Helper: execute a V3 exact-input buy ─────────────────────────────────────
async function buyTokens(
  account: (typeof f.accounts)[number],
  amountWeth: bigint
): Promise<bigint> {
  await wrapAndApprove(account, amountWeth);

  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

  const amountOut = await f.publicClient.simulateContract({
    address: SWAP_ROUTER,
    abi: swapRouterAbi,
    functionName: "exactInputSingle",
    args: [
      {
        tokenIn: f.contracts.weth,
        tokenOut: tokenAddress,
        fee: POOL_FEE,
        recipient: account.address,
        deadline,
        amountIn: amountWeth,
        amountOutMinimum: 0n,
        sqrtPriceLimitX96: 0n,
      },
    ],
    account: account.address,
  }).then((r) => r.result);

  await f.walletClient.writeContract({
    address: SWAP_ROUTER,
    abi: swapRouterAbi,
    functionName: "exactInputSingle",
    args: [
      {
        tokenIn: f.contracts.weth,
        tokenOut: tokenAddress,
        fee: POOL_FEE,
        recipient: account.address,
        deadline,
        amountIn: amountWeth,
        amountOutMinimum: 0n,
        sqrtPriceLimitX96: 0n,
      },
    ],
    account: account.address,
    chain: null,
  });

  await f.fixture.mine(1);
  return amountOut;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Swap flows", () => {
  it("can get a buy quote for a newly created pool", async () => {
    const { amountOut } = await f.sdk.quoter.quoteExactInputV3({
      tokenIn: f.contracts.weth,
      tokenOut: tokenAddress,
      amountIn: parseEther("0.1"),
      fee: POOL_FEE,
    });

    expect(amountOut, "Quote should return a positive amountOut").toBeGreaterThan(0n);
  });

  it("executes a buy and increases token balance", async () => {
    const buyer = f.accounts[2]!; // TRADER_A
    await f.fixture.setBalance(buyer.address, parseEther("100"));

    const balanceBefore = await f.publicClient.readContract({
      address: tokenAddress,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [buyer.address],
    });

    await buyTokens(buyer, parseEther("0.1"));

    const balanceAfter = await f.publicClient.readContract({
      address: tokenAddress,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [buyer.address],
    });

    expect(
      balanceAfter,
      "Token balance should increase after a buy"
    ).toBeGreaterThan(balanceBefore);
  });

  it("executes a sell and increases WETH balance", async () => {
    const seller = f.accounts[2]!; // TRADER_A
    await f.fixture.setBalance(seller.address, parseEther("100"));

    // Buy tokens first so we have something to sell.
    await buyTokens(seller, parseEther("0.5"));

    const tokensHeld = await f.publicClient.readContract({
      address: tokenAddress,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [seller.address],
    });

    expect(tokensHeld, "Seller must hold tokens to proceed").toBeGreaterThan(0n);

    // Approve router to spend tokens.
    await f.walletClient.writeContract({
      address: tokenAddress,
      abi: erc20Abi,
      functionName: "approve",
      args: [SWAP_ROUTER, maxUint256],
      account: seller.address,
      chain: null,
    });

    const wethBefore = await f.publicClient.readContract({
      address: f.contracts.weth,
      abi: weth9Abi,
      functionName: "balanceOf",
      args: [seller.address],
    });

    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
    const sellAmount = tokensHeld / 2n;

    await f.walletClient.writeContract({
      address: SWAP_ROUTER,
      abi: swapRouterAbi,
      functionName: "exactInputSingle",
      args: [
        {
          tokenIn: tokenAddress,
          tokenOut: f.contracts.weth,
          fee: POOL_FEE,
          recipient: seller.address,
          deadline,
          amountIn: sellAmount,
          amountOutMinimum: 0n,
          sqrtPriceLimitX96: 0n,
        },
      ],
      account: seller.address,
      chain: null,
    });

    await f.fixture.mine(1);

    const wethAfter = await f.publicClient.readContract({
      address: f.contracts.weth,
      abi: weth9Abi,
      functionName: "balanceOf",
      args: [seller.address],
    });

    expect(
      wethAfter,
      "WETH balance should increase after selling tokens"
    ).toBeGreaterThan(wethBefore);
  });

  it("quote and execution are within 1% of each other", async () => {
    const buyer = f.accounts[3]!; // TRADER_B
    await f.fixture.setBalance(buyer.address, parseEther("100"));

    const buyAmount = parseEther("1");

    // Get the quote.
    const { amountOut: quotedOut } = await f.sdk.quoter.quoteExactInputV3({
      tokenIn: f.contracts.weth,
      tokenOut: tokenAddress,
      amountIn: buyAmount,
      fee: POOL_FEE,
    });

    // Execute the same buy and get the actual amountOut from simulation.
    const actualOut = await buyTokens(buyer, buyAmount);

    const tolerance = quotedOut / 100n; // 1%
    const diff = actualOut > quotedOut
      ? actualOut - quotedOut
      : quotedOut - actualOut;

    expect(
      diff,
      `Execution (${actualOut}) should be within 1% of quote (${quotedOut})`
    ).toBeLessThanOrEqual(tolerance);
  });
});
