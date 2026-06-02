import { resolve } from "node:path";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@futelab/folio-core/browser": resolve(__dirname, "packages/core/src/browser.ts"),
      "@futelab/folio-core": resolve(__dirname, "packages/core/src/index.ts"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: [],
    include: ["packages/**/*.test.ts", "packages/**/*.test.tsx"],
  },
});
