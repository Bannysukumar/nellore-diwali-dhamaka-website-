import { defineConfig } from "vitest/config";

/**
 * Cloud Functions integration tests. They call the real callables running in
 * the Functions emulator, so they only run through `npm run test:functions`
 * (`firebase emulators:exec --project demo-ndd ...`).
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
