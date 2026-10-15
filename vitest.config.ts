import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@futelab/folio-core/browser": resolve(root, "packages/core/src/browser.ts"),
      "@futelab/folio-core": resolve(root, "packages/core/src/index.ts"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: [],
    include: ["packages/**/*.test.ts", "packages/**/*.test.tsx"],
  },
});
