import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    coverage: {
      provider: "istanbul",
      reporter: ["text", "json", "html"],
      exclude: ["**/tests/**", "**/__tests__/**", "**/node_modules/**"],
    },
    include: ["**/tests/**/*.test.ts", "**/__tests__/**/*.test.ts"],
    exclude: ["**/dist/**", "**/build/**", "**/node_modules/**"],
    setupFiles: [],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
