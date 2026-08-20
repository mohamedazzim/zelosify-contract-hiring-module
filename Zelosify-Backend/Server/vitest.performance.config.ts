import { defineConfig } from "vitest/config";
import path from "path";

// Performance benchmark config — intentionally separate from the unit suite.
// Run: npx vitest run --config vitest.performance.config.ts tests/performance/recommendationLatency.benchmark.test.ts
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/performance/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/build/**"],
    setupFiles: [],
    testTimeout: 120000,
    hookTimeout: 120000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
