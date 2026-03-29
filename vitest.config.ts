import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  // Load .env (and .env.local, .env.{mode}, etc.) from the project root.
  // loadEnv merges into process.env so chain-config.ts picks them up
  // automatically via process.env["BASE_SEPOLIA_RPC_URL"] etc.
  const env = loadEnv(mode ?? "test", process.cwd(), "");
  Object.assign(process.env, env);

  return {
    test: {
      include: ["tests/**/*.test.ts"],
      // Migration tests run mineTokenOrder (cold RPC) and long swap flows.
      testTimeout: 120_000,
      hookTimeout: 120_000,
      pool: "forks",
      // Run one test file at a time so only a single Anvil fork hits the RPC.
      // Without this, 6 simultaneous Anvil instances overwhelm the Alchemy
      // rate limit (HTTP 429) and cause cascading timeouts.
      fileParallelism: false,
      reporters: ["verbose"],
      globals: false,
    },
  };
});
