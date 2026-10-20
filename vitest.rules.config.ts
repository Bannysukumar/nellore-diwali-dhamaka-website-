import { defineConfig } from "vitest/config";

/** Security-rules tests. Run through `npm run test:rules` (starts the emulators). */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/rules/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
