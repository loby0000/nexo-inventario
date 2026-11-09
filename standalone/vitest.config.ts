import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["standalone/tests/**/*.test.ts"],
    testTimeout: 30000,
    hookTimeout: 60000,
    fileParallelism: false,
  },
  resolve: { conditions: ["node"] },
});
