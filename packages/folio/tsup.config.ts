import { resolve } from "node:path";
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/core.ts", "src/react.ts"],
  format: ["esm", "cjs"],
  platform: "browser",
  dts: true,
  sourcemap: true,
  esbuildOptions(options) {
    options.alias = {
      ...options.alias,
      "@futelab/folio-core/browser": resolve("../core/src/browser.ts"),
    };
  },
});
