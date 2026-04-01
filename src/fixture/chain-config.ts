import type { Address } from "viem";

export interface ChainContracts {
  airlock: Address;
  tokenFactory: Address;
  governanceFactory: Address;
  noOpGovernanceFactory: Address;
  noOpMigrator: Address;
  uniswapV2Migrator: Address;
  uniswapV3Initializer: Address;
  uniswapV4Initializer: Address;
  uniswapV4Migrator: Address;
  streamableFeesLocker: Address;
  weth: Address;
}

export interface ChainConfig {
  chainId: number;
  name: string;
  rpcUrl: string;
  contracts: ChainContracts;
}

// ── Base Sepolia (84532) ──────────────────────────────────────────────────────
// Primary reference chain — most complete testnet deployment.
// WETH is the canonical OP-stack address (0x4200…0006).
const BASE_SEPOLIA: ChainConfig = {
  chainId: 84532,
  name: "Base Sepolia",
  rpcUrl:
    "https://base-sepolia.g.alchemy.com/v2/i_dly2NyYSFwbTsSU419OkBDn5Iq1Xiq",
  contracts: {
    airlock: "0x3411306ce66c9469bff1535ba955503c4bde1c6e",
    tokenFactory: "0x9d8fd79b2a59c5d91ccbd79c3aeb4de56451bb02",
    governanceFactory: "0x9dbfaadc8c0cb2c34ba698dd9426555336992e20",
    noOpGovernanceFactory: "0x7bd798fafc99a3b17e261f8308a8c11b56935ea1",
    noOpMigrator: "0xf11066abbd329ac4bba39455340539322c222eb0",
    uniswapV2Migrator: "0x04a898f3722c38f9def707bd17dc78920efa977c",
    uniswapV3Initializer: "0x4c3062b9ccfdbcb10353f57c1b59a29d4c5cfa47",
    uniswapV4Initializer: "0x53b4c21a6cb61d64f636abbfa6e8e90e6558e8ad",
    uniswapV4Migrator: "0xeee0eccb54398ce371caacbcef076d3ed597ddb3",
    streamableFeesLocker: "0x3345e557c5c0b474be1eb4693264008b8562aa9c",
    // Canonical OP-stack WETH — same address on every OP-chain.
    weth: "0x4200000000000000000000000000000000000006",
  },
};

// ── Unichain Sepolia (1301) ───────────────────────────────────────────────────
const UNICHAIN_SEPOLIA: ChainConfig = {
  chainId: 1301,
  name: "Unichain Sepolia",
  rpcUrl:
    process.env["UNICHAIN_SEPOLIA_RPC_URL"] ??
    "https://sepolia.unichain.org",
  contracts: {
    airlock: "0x0d2f38d807bfad5c18e430516e10ab560d300caf",
    tokenFactory: "0x82ac010c67f70bacf7655cd8948a4ad92a173cac",
    governanceFactory: "0x4225c632b62622bd7b0a3ec9745c0a866ff94f6f",
    noOpGovernanceFactory: "0x7e5d336a6e9e453c9f02e5102cc039e015fd8fb8",
    noOpMigrator: "0x193f48a45b6025dded10bc4baeef65c833696387",
    uniswapV2Migrator: "0x620e3fec244e913d73f2163623b62d02db69638b",
    uniswapV3Initializer: "0xe0dc4012ac9c868f09c6e4b20d66ed46d6f258d0",
    uniswapV4Initializer: "0x70d20cd48791e527036491dc464c8dc58351dd93",
    uniswapV4Migrator: "0xb6d69eaa98e657beeff7ca4452768e6f707aa6b1",
    streamableFeesLocker: "0x1728e8b3282502f275949109331e070b819b38ea",
    // Canonical OP-stack WETH — Unichain is OP-based.
    weth: "0x4200000000000000000000000000000000000006",
  },
};

// ── Monad Testnet (10143) ─────────────────────────────────────────────────────
const MONAD_TESTNET: ChainConfig = {
  chainId: 10143,
  name: "Monad Testnet",
  rpcUrl:
    process.env["MONAD_TESTNET_RPC_URL"] ??
    "https://testnet-rpc.monad.xyz",
  contracts: {
    airlock: "0xde3599a2ec440b296373a983c85c365da55d9dfa",
    tokenFactory: "0x8af018e28c273826e6b2d5a99e81c8fb63729b07",
    governanceFactory: "0x014e1c0bd34f3b10546e554cb33b3293fecdd056",
    noOpGovernanceFactory: "0x094d926a969b3024ca46d2186bf13fd5cdba9ce2",
    noOpMigrator: "0x5cadb034267751a364ddd4d321c99e07a307f915",
    uniswapV2Migrator: "0x43d0d97ec9241a8f05a264f94b82a1d2e600f2b3",
    uniswapV3Initializer: "0x9f4e56be80f08ba1a2445645efa6d231e27b43ec",
    uniswapV4Initializer: "0x53b4c21a6cb61d64f636abbfa6e8e90e6558e8ad",
    uniswapV4Migrator: "0x4b0ec16eb40318ca5a4346f20f04a2285c19675b",
    streamableFeesLocker: "0x0d2f38d807bfad5c18e430516e10ab560d300caf",
    // Monad's WETH as listed in the Doppler docs.
    weth: "0x660eaaedebc968f8f3694354fa8ec0b4c5ba8d12",
  },
};

export const CHAIN_CONFIGS: Record<number, ChainConfig> = {
  [BASE_SEPOLIA.chainId]: BASE_SEPOLIA,
  [UNICHAIN_SEPOLIA.chainId]: UNICHAIN_SEPOLIA,
  [MONAD_TESTNET.chainId]: MONAD_TESTNET,
};

export function getChainConfig(chainId: number): ChainConfig {
  const config = CHAIN_CONFIGS[chainId];
  if (!config) {
    const supported = Object.keys(CHAIN_CONFIGS).join(", ");
    throw new Error(
      `Unsupported chainId: ${chainId}. Supported chains: ${supported}`
    );
  }
  return config;
}

