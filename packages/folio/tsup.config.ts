import { resolve } from "node:path";
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/core.ts", "src/react.ts"],
  format: ["esm", "cjs"],
  platform: "browser",
  clean: true,
  external: [
    "@tiptap/core",
    "@tiptap/extension-color",
    "@tiptap/extension-collaboration",
    "@tiptap/extension-details",
    "@tiptap/extension-drag-handle",
    "@tiptap/extension-drag-handle-react",
    "@tiptap/extension-highlight",
    "@tiptap/extension-image",
    "@tiptap/extension-mention",
    "@tiptap/extension-node-range",
    "@tiptap/extension-placeholder",
    "@tiptap/extension-table",
    "@tiptap/extension-table-of-contents",
    "@tiptap/extension-task-item",
    "@tiptap/extension-task-list",
    "@tiptap/extension-text-style",
    "@tiptap/markdown",
    "@tiptap/pm",
    "@tiptap/react",
    "@tiptap/starter-kit",
    "@tiptap/suggestion",
    "@tiptap/y-tiptap",
    "lucide-react",
    "react",
    "react-dom",
    "y-protocols",
    "yjs",
  ],
  dts: true,
  minify: true,
  sourcemap: false,
  esbuildOptions(options) {
    options.alias = {
      ...options.alias,
      "@futelab/folio-core/browser": resolve("../core/src/browser.ts"),
    };
    options.legalComments = "none";
  },
});
