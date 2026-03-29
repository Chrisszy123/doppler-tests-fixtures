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
      testTimeout: 60_000,
      hookTimeout: 60_000,
      pool: "forks",
      reporters: ["verbose"],
      globals: false,
    },
  };
});
