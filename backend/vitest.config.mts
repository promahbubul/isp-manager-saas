import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    setupFiles: ["src/tests/setup.ts"],
    testTimeout: 30_000,
    hookTimeout: 180_000, // first run downloads the MongoDB binary
    fileParallelism: false,
  },
});
