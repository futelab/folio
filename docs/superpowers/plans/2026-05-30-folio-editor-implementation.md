# Folio Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first alpha of `@futelab/folio`, a React 18/19 Notion-like editor and reader component library with JSON-first content, default Notion-like interactions, theming, docs, and release tooling.

**Architecture:** Publish one public package, `@futelab/folio`, from a pnpm/Turborepo monorepo. Keep internal boundaries in `packages/core`, `packages/react`, and `packages/styles`, then aggregate exports through the root package. Use Tiptap/ProseMirror as the editing engine while keeping Folio-owned types, component props, extension registry, serialization utilities, and theme API as the public contract.

**Tech Stack:** TypeScript, React, Tiptap 3, ProseMirror, pnpm workspace, Turborepo, Changesets, Vite library builds, Vitest, Testing Library, Playwright, Storybook, CSS variables.

---

## Reference Inputs

- Design spec: `docs/superpowers/specs/2026-05-30-folio-editor-design.md`
- Tiptap React setup: https://tiptap.dev/docs/editor/getting-started/install/react
- Tiptap StarterKit: https://tiptap.dev/docs/editor/extensions/functionality/starterkit
- Tiptap extension model: https://tiptap.dev/docs/editor/core-concepts/extensions
- Tiptap HTML utility: https://tiptap.dev/docs/editor/api/utilities/html
- Tiptap static renderer: https://tiptap.dev/docs/editor/api/utilities/static-renderer
- Tiptap Markdown extension: https://tiptap.dev/docs/editor/markdown
- Tiptap TableKit: https://tiptap.dev/docs/editor/extensions/nodes/table
- Tiptap Details node: https://tiptap.dev/docs/editor/extensions/nodes/details
- Tiptap Mention and Suggestion: https://tiptap.dev/docs/editor/extensions/nodes/mention and https://tiptap.dev/docs/editor/api/utilities/suggestion
- Tiptap DragHandle React: https://tiptap.dev/docs/editor/extensions/functionality/drag-handle-react

## Scope Check

This plan implements one product slice: the alpha component library. It does not implement Notion databases, collaboration, or AI packages. The implementation still reserves extension points for those future packages by defining command, renderer, and transaction hook contracts in core.

## File Structure

Create or modify the following files:

```txt
package.json
pnpm-workspace.yaml
turbo.json
tsconfig.base.json
vitest.config.ts
playwright.config.ts
.npmrc
.changeset/config.json

packages/core/package.json
packages/core/tsconfig.json
packages/core/src/index.ts
packages/core/src/document.ts
packages/core/src/fixtures.ts
packages/core/src/extensions/types.ts
packages/core/src/extensions/registry.ts
packages/core/src/extensions/defaultExtensions.ts
packages/core/src/serialization/html.ts
packages/core/src/serialization/markdown.ts
packages/core/src/commands/defaultCommands.ts
packages/core/src/nodes/callout.ts
packages/core/src/nodes/bookmark.ts
packages/core/src/nodes/image.ts
packages/core/src/nodes/toc.ts
packages/core/src/testing/testExtensions.ts
packages/core/src/__tests__/document.test.ts
packages/core/src/__tests__/registry.test.ts
packages/core/src/__tests__/serialization.test.ts

packages/react/package.json
packages/react/tsconfig.json
packages/react/src/index.ts
packages/react/src/FolioEditor.tsx
packages/react/src/FolioReader.tsx
packages/react/src/useFolioEditor.ts
packages/react/src/context.tsx
packages/react/src/menus/SlashMenu.tsx
packages/react/src/menus/BubbleToolbar.tsx
packages/react/src/blocks/BlockControls.tsx
packages/react/src/blocks/DragHandle.tsx
packages/react/src/reader/renderers.tsx
packages/react/src/__tests__/FolioEditor.test.tsx
packages/react/src/__tests__/FolioReader.test.tsx

packages/styles/package.json
packages/styles/editor.css
packages/styles/reader.css
packages/styles/styles.css

packages/folio/package.json
packages/folio/tsconfig.json
packages/folio/src/index.ts
packages/folio/src/core.ts
packages/folio/src/react.ts
packages/folio/scripts/build-styles.mjs

apps/docs/package.json
apps/docs/.storybook/main.ts
apps/docs/.storybook/preview.ts
apps/docs/src/FolioEditor.stories.tsx
apps/docs/src/FolioReader.stories.tsx
apps/docs/src/CustomExtension.stories.tsx

tests/e2e/folio-editor.spec.ts
```

Boundary rules:

- `packages/core` contains no React runtime imports.
- `packages/react` can import `@futelab/folio-core` and CSS class names, but cannot own serialization logic.
- `packages/styles` contains only CSS.
- `packages/folio` is the published aggregator package and should contain minimal forwarding code.
- `apps/docs` consumes the published-facing `@futelab/folio` exports.

## Task 1: Scaffold Workspace and Tooling

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `turbo.json`
- Create: `tsconfig.base.json`
- Create: `vitest.config.ts`
- Create: `playwright.config.ts`
- Create: `.npmrc`
- Create: `.changeset/config.json`

- [ ] **Step 1: Write the initial root package manifest**

Create `package.json` with this content:

```json
{
  "name": "folio-workspace",
  "private": true,
  "packageManager": "pnpm@10.0.0",
  "scripts": {
    "build": "turbo run build",
    "dev": "turbo run dev --parallel",
    "lint": "turbo run lint",
    "test": "turbo run test",
    "test:e2e": "playwright test",
    "typecheck": "turbo run typecheck",
    "changeset": "changeset",
    "version": "changeset version",
    "release": "pnpm build && changeset publish"
  },
  "devDependencies": {
    "@changesets/cli": "^2.29.0",
    "@playwright/test": "^1.52.0",
    "@testing-library/jest-dom": "^6.6.0",
    "@testing-library/react": "^16.3.0",
    "@testing-library/user-event": "^14.6.0",
    "@types/node": "^22.15.0",
    "@types/react": "^19.1.0",
    "@types/react-dom": "^19.1.0",
    "@vitejs/plugin-react": "^4.5.0",
    "jsdom": "^26.1.0",
    "turbo": "^2.5.0",
    "typescript": "^5.8.0",
    "vite": "^6.3.0",
    "vitest": "^3.1.0"
  }
}
```

- [ ] **Step 2: Add workspace, Turbo, TypeScript, test, and release config files**

Create `pnpm-workspace.yaml`:

```yaml
packages:
  - "packages/*"
  - "apps/*"
```

Create `turbo.json`:

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {
      "dependsOn": ["^build"]
    },
    "test": {
      "dependsOn": ["^build"]
    },
    "typecheck": {
      "dependsOn": ["^build"]
    }
  }
}
```

Create `tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["DOM", "DOM.Iterable", "ES2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: [],
    include: ["packages/**/*.test.ts", "packages/**/*.test.tsx"],
  },
});
```

Create `playwright.config.ts`:

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:6006",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm --filter @futelab/folio-docs dev -- --host 127.0.0.1 --port 6006",
    url: "http://127.0.0.1:6006",
    reuseExistingServer: true,
    timeout: 120000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
```

Create `.npmrc`:

```txt
auto-install-peers=true
strict-peer-dependencies=false
```

Create `.changeset/config.json`:

```json
{
  "$schema": "https://unpkg.com/@changesets/config@3.1.1/schema.json",
  "changelog": "@changesets/cli/changelog",
  "commit": false,
  "fixed": [],
  "linked": [],
  "access": "public",
  "baseBranch": "main",
  "updateInternalDependencies": "patch",
  "ignore": ["@futelab/folio-docs"]
}
```

- [ ] **Step 3: Install workspace dependencies**

Run:

```bash
pnpm install
```

Expected: dependencies install and `pnpm-lock.yaml` is created.

- [ ] **Step 4: Run root verification**

Run:

```bash
pnpm typecheck
```

Expected: Turbo reports no package tasks yet or exits without TypeScript errors.

- [ ] **Step 5: Commit tooling**

Run:

```bash
git add package.json pnpm-workspace.yaml turbo.json tsconfig.base.json vitest.config.ts playwright.config.ts .npmrc .changeset/config.json pnpm-lock.yaml
git commit -m "chore: scaffold folio workspace tooling"
```

## Task 2: Add Package Boundaries and Published Aggregator

**Files:**
- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/core/src/index.ts`
- Create: `packages/react/package.json`
- Create: `packages/react/tsconfig.json`
- Create: `packages/react/src/index.ts`
- Create: `packages/styles/package.json`
- Create: `packages/styles/styles.css`
- Create: `packages/styles/editor.css`
- Create: `packages/styles/reader.css`
- Create: `packages/folio/package.json`
- Create: `packages/folio/tsconfig.json`
- Create: `packages/folio/src/index.ts`
- Create: `packages/folio/src/core.ts`
- Create: `packages/folio/src/react.ts`
- Create: `packages/folio/scripts/build-styles.mjs`

- [ ] **Step 1: Write failing package export smoke tests**

Create `packages/core/src/index.ts`:

```ts
export const folioCoreVersion = "0.1.0-alpha.0";
```

Create `packages/react/src/index.ts`:

```ts
export const folioReactVersion = "0.1.0-alpha.0";
```

Create `packages/folio/src/index.ts`:

```ts
export { folioCoreVersion } from "../../core/src";
export { folioReactVersion } from "../../react/src";
```

Run:

```bash
pnpm --filter @futelab/folio build
```

Expected: FAIL because package manifests and build scripts do not exist yet.

- [ ] **Step 2: Create internal package manifests and TypeScript configs**

Create `packages/core/package.json`:

```json
{
  "name": "@futelab/folio-core",
  "version": "0.1.0-alpha.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "require": "./dist/index.cjs"
    }
  },
  "scripts": {
    "build": "tsup src/index.ts --format esm,cjs --dts --sourcemap",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@tiptap/core": "^3.0.0"
  },
  "devDependencies": {
    "tsup": "^8.4.0"
  }
}
```

Create `packages/core/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src"]
}
```

Create `packages/react/package.json`:

```json
{
  "name": "@futelab/folio-react",
  "version": "0.1.0-alpha.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "require": "./dist/index.cjs"
    }
  },
  "scripts": {
    "build": "tsup src/index.ts --format esm,cjs --dts --sourcemap --external react --external react-dom",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@futelab/folio-core": "workspace:*",
    "@tiptap/react": "^3.0.0"
  },
  "peerDependencies": {
    "react": ">=18",
    "react-dom": ">=18"
  },
  "devDependencies": {
    "tsup": "^8.4.0"
  }
}
```

Create `packages/react/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src"]
}
```

Create `packages/styles/package.json`:

```json
{
  "name": "@futelab/folio-styles",
  "version": "0.1.0-alpha.0",
  "private": true,
  "type": "module",
  "exports": {
    "./styles.css": "./styles.css",
    "./editor.css": "./editor.css",
    "./reader.css": "./reader.css"
  },
  "scripts": {
    "build": "node -e \"console.log('styles ready')\"",
    "test": "node -e \"console.log('styles test ready')\"",
    "typecheck": "node -e \"console.log('styles typecheck ready')\""
  }
}
```

Create `packages/folio/package.json`:

```json
{
  "name": "@futelab/folio",
  "version": "0.1.0-alpha.0",
  "type": "module",
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "files": ["dist", "styles.css"],
  "sideEffects": ["./styles.css"],
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "require": "./dist/index.cjs"
    },
    "./core": {
      "types": "./dist/core.d.ts",
      "import": "./dist/core.js",
      "require": "./dist/core.cjs"
    },
    "./react": {
      "types": "./dist/react.d.ts",
      "import": "./dist/react.js",
      "require": "./dist/react.cjs"
    },
    "./styles.css": "./styles.css"
  },
  "scripts": {
    "build": "tsup src/index.ts src/core.ts src/react.ts --format esm,cjs --dts --sourcemap --no-external @futelab/folio-core --no-external @futelab/folio-react && node scripts/build-styles.mjs",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "peerDependencies": {
    "react": ">=18",
    "react-dom": ">=18"
  },
  "devDependencies": {
    "tsup": "^8.4.0"
  },
  "publishConfig": {
    "access": "public"
  }
}
```

Create `packages/folio/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src"]
}
```

- [ ] **Step 3: Create forwarding files and empty style files**

Create `packages/folio/src/core.ts`:

```ts
export * from "../../core/src";
```

Create `packages/folio/src/react.ts`:

```ts
export * from "../../react/src";
```

Create `packages/folio/scripts/build-styles.mjs`:

```js
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const stylesRoot = resolve(here, "../../styles");

const tokens = readFileSync(resolve(stylesRoot, "styles.css"), "utf8")
  .split("\n")
  .filter((line) => !line.startsWith("@import"))
  .join("\n");
const editor = readFileSync(resolve(stylesRoot, "editor.css"), "utf8");
const reader = readFileSync(resolve(stylesRoot, "reader.css"), "utf8");

writeFileSync(resolve(here, "../styles.css"), `${tokens}\n${editor}\n${reader}\n`);
```

Create `packages/styles/styles.css`:

```css
@import "./editor.css";
@import "./reader.css";
```

Create `packages/styles/editor.css`:

```css
.folio-editor {
  color: var(--folio-color-text);
}
```

Create `packages/styles/reader.css`:

```css
.folio-reader {
  color: var(--folio-color-text);
}
```

- [ ] **Step 4: Install build dependency and verify packages build**

Run:

```bash
pnpm install
pnpm build
```

Expected: all package build tasks pass and `packages/*/dist` exists for TypeScript packages.

- [ ] **Step 5: Commit package boundaries**

Run:

```bash
git add packages package.json pnpm-lock.yaml
git commit -m "chore: add folio package boundaries"
```

## Task 3: Define Core Document Types and Fixtures

**Files:**
- Create: `packages/core/src/document.ts`
- Create: `packages/core/src/fixtures.ts`
- Modify: `packages/core/src/index.ts`
- Create: `packages/core/src/__tests__/document.test.ts`

- [ ] **Step 1: Write failing document tests**

Create `packages/core/src/__tests__/document.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  createEmptyFolioDocument,
  isFolioDocument,
  sampleFolioDocument,
} from "../index";

describe("Folio document model", () => {
  it("creates an empty JSON-first document", () => {
    expect(createEmptyFolioDocument()).toEqual({
      type: "doc",
      content: [{ type: "paragraph" }],
    });
  });

  it("recognizes valid document roots", () => {
    expect(isFolioDocument(sampleFolioDocument)).toBe(true);
    expect(isFolioDocument({ type: "paragraph" })).toBe(false);
    expect(isFolioDocument(null)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
pnpm --filter @futelab/folio-core test -- document.test.ts
```

Expected: FAIL with missing exports from `../index`.

- [ ] **Step 3: Implement document model and fixtures**

Create `packages/core/src/document.ts`:

```ts
import type { JSONContent } from "@tiptap/core";

export type FolioDocument = JSONContent & {
  type: "doc";
  content?: JSONContent[];
};

export type FolioJSONContent = JSONContent;

export function createEmptyFolioDocument(): FolioDocument {
  return {
    type: "doc",
    content: [{ type: "paragraph" }],
  };
}

export function isFolioDocument(value: unknown): value is FolioDocument {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as { type?: unknown };
  return candidate.type === "doc";
}
```

Create `packages/core/src/fixtures.ts`:

```ts
import type { FolioDocument } from "./document";

export const sampleFolioDocument: FolioDocument = {
  type: "doc",
  content: [
    {
      type: "heading",
      attrs: { level: 1 },
      content: [{ type: "text", text: "Folio document" }],
    },
    {
      type: "paragraph",
      content: [
        { type: "text", text: "A JSON-first document with " },
        { type: "text", marks: [{ type: "bold" }], text: "rich text" },
        { type: "text", text: "." },
      ],
    },
  ],
};
```

Modify `packages/core/src/index.ts`:

```ts
export const folioCoreVersion = "0.1.0-alpha.0";

export * from "./document";
export * from "./fixtures";
```

- [ ] **Step 4: Run document tests and typecheck**

Run:

```bash
pnpm --filter @futelab/folio-core test -- document.test.ts
pnpm --filter @futelab/folio-core typecheck
```

Expected: tests pass and TypeScript reports no errors.

- [ ] **Step 5: Commit document model**

Run:

```bash
git add packages/core/src
git commit -m "feat: add folio document model"
```

## Task 4: Implement Extension Registry and Public Extension Types

**Files:**
- Create: `packages/core/src/extensions/types.ts`
- Create: `packages/core/src/extensions/registry.ts`
- Modify: `packages/core/src/index.ts`
- Create: `packages/core/src/__tests__/registry.test.ts`

- [ ] **Step 1: Write failing registry tests**

Create `packages/core/src/__tests__/registry.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createFolioExtension, createFolioExtensionRegistry } from "../index";

describe("Folio extension registry", () => {
  it("registers block, command, and renderer contributions in insertion order", () => {
    const callout = createFolioExtension({
      name: "callout",
      blocks: [{ name: "callout" }],
      commands: [{ name: "insertCallout", label: "Callout", action: () => true }],
      renderers: [{ type: "callout", render: () => "callout" }],
    });

    const registry = createFolioExtensionRegistry([callout]);

    expect(registry.blocks.map((block) => block.name)).toEqual(["callout"]);
    expect(registry.commands.map((command) => command.name)).toEqual(["insertCallout"]);
    expect(registry.renderers.map((renderer) => renderer.type)).toEqual(["callout"]);
  });

  it("rejects duplicate extension names", () => {
    const first = createFolioExtension({ name: "same" });
    const second = createFolioExtension({ name: "same" });

    expect(() => createFolioExtensionRegistry([first, second])).toThrow(
      "Duplicate Folio extension name: same",
    );
  });
});
```

- [ ] **Step 2: Run the failing registry test**

Run:

```bash
pnpm --filter @futelab/folio-core test -- registry.test.ts
```

Expected: FAIL with missing extension exports.

- [ ] **Step 3: Implement extension types and registry**

Create `packages/core/src/extensions/types.ts`:

```ts
import type { Extension } from "@tiptap/core";
import type { FolioJSONContent } from "../document";

export type FolioCommandAction = (context: FolioCommandContext) => boolean;

export interface FolioCommandContext {
  editor: unknown;
  attrs?: Record<string, unknown>;
}

export interface FolioBlockContribution {
  name: string;
  label?: string;
}

export interface FolioMarkContribution {
  name: string;
  label?: string;
}

export interface FolioCommandContribution {
  name: string;
  label: string;
  keywords?: string[];
  action: FolioCommandAction;
}

export interface FolioRendererContribution {
  type: string;
  render: (node: FolioJSONContent) => unknown;
}

export interface FolioExtension {
  name: string;
  blocks?: FolioBlockContribution[];
  marks?: FolioMarkContribution[];
  commands?: FolioCommandContribution[];
  renderers?: FolioRendererContribution[];
  tiptapExtensions?: Extension[];
}
```

Create `packages/core/src/extensions/registry.ts`:

```ts
import type {
  FolioBlockContribution,
  FolioCommandContribution,
  FolioExtension,
  FolioMarkContribution,
  FolioRendererContribution,
} from "./types";

export interface FolioExtensionRegistry {
  extensions: FolioExtension[];
  blocks: FolioBlockContribution[];
  marks: FolioMarkContribution[];
  commands: FolioCommandContribution[];
  renderers: FolioRendererContribution[];
}

export function createFolioExtension(extension: FolioExtension): FolioExtension {
  return extension;
}

export function createFolioExtensionRegistry(
  extensions: FolioExtension[] = [],
): FolioExtensionRegistry {
  const names = new Set<string>();
  const blocks: FolioBlockContribution[] = [];
  const marks: FolioMarkContribution[] = [];
  const commands: FolioCommandContribution[] = [];
  const renderers: FolioRendererContribution[] = [];

  for (const extension of extensions) {
    if (names.has(extension.name)) {
      throw new Error(`Duplicate Folio extension name: ${extension.name}`);
    }

    names.add(extension.name);
    blocks.push(...(extension.blocks ?? []));
    marks.push(...(extension.marks ?? []));
    commands.push(...(extension.commands ?? []));
    renderers.push(...(extension.renderers ?? []));
  }

  return {
    extensions,
    blocks,
    marks,
    commands,
    renderers,
  };
}
```

Modify `packages/core/src/index.ts`:

```ts
export const folioCoreVersion = "0.1.0-alpha.0";

export * from "./document";
export * from "./fixtures";
export * from "./extensions/types";
export * from "./extensions/registry";
```

- [ ] **Step 4: Run registry tests**

Run:

```bash
pnpm --filter @futelab/folio-core test -- registry.test.ts
pnpm --filter @futelab/folio-core typecheck
```

Expected: tests pass and TypeScript reports no errors.

- [ ] **Step 5: Commit extension registry**

Run:

```bash
git add packages/core/src
git commit -m "feat: add folio extension registry"
```

## Task 5: Add Default Tiptap Extensions and Serialization Utilities

**Files:**
- Create: `packages/core/src/extensions/defaultExtensions.ts`
- Create: `packages/core/src/nodes/callout.ts`
- Create: `packages/core/src/nodes/bookmark.ts`
- Create: `packages/core/src/nodes/image.ts`
- Create: `packages/core/src/nodes/toc.ts`
- Create: `packages/core/src/serialization/html.ts`
- Create: `packages/core/src/serialization/markdown.ts`
- Create: `packages/core/src/testing/testExtensions.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/core/package.json`
- Create: `packages/core/src/__tests__/serialization.test.ts`

- [ ] **Step 1: Add Tiptap dependencies**

Run:

```bash
pnpm --filter @futelab/folio-core add @tiptap/core @tiptap/html @tiptap/static-renderer @tiptap/markdown @tiptap/starter-kit @tiptap/extension-table @tiptap/extension-task-list @tiptap/extension-task-item @tiptap/extension-image @tiptap/extension-placeholder @tiptap/extension-text-style @tiptap/extension-color @tiptap/extension-highlight @tiptap/extension-details @tiptap/extension-details-summary @tiptap/extension-details-content @tiptap/extension-table-of-contents @tiptap/extension-mention @tiptap/suggestion
```

Expected: package manifest and lockfile update with Tiptap dependencies.

- [ ] **Step 2: Write failing serialization tests**

Create `packages/core/src/__tests__/serialization.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  createEmptyFolioDocument,
  fromHTML,
  fromMarkdown,
  sampleFolioDocument,
  toHTML,
  toMarkdown,
} from "../index";

describe("Folio serialization", () => {
  it("renders Folio JSON to HTML on the server path", () => {
    expect(toHTML(sampleFolioDocument)).toContain("<h1");
    expect(toHTML(sampleFolioDocument)).toContain("Folio document");
  });

  it("parses HTML into Folio JSON", () => {
    expect(fromHTML("<h1>Hello</h1><p>World</p>")).toMatchObject({
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 1 } },
        { type: "paragraph" },
      ],
    });
  });

  it("returns an empty document for blank Markdown", () => {
    expect(fromMarkdown("")).toEqual(createEmptyFolioDocument());
  });

  it("serializes basic Markdown", () => {
    expect(toMarkdown(sampleFolioDocument)).toContain("# Folio document");
  });
});
```

- [ ] **Step 3: Run the failing serialization tests**

Run:

```bash
pnpm --filter @futelab/folio-core test -- serialization.test.ts
```

Expected: FAIL with missing serialization exports.

- [ ] **Step 4: Implement custom callout, bookmark, image, and TOC nodes**

Create `packages/core/src/nodes/callout.ts`:

```ts
import { Node, mergeAttributes } from "@tiptap/core";

export const FolioCallout = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  defining: true,

  addAttributes() {
    return {
      tone: {
        default: "info",
        parseHTML: (element) => element.getAttribute("data-tone") ?? "info",
        renderHTML: (attrs) => ({ "data-tone": attrs.tone }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "aside[data-folio-callout]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "aside",
      mergeAttributes(HTMLAttributes, {
        "data-folio-callout": "",
        class: "folio-callout",
      }),
      0,
    ];
  },
});
```

Create `packages/core/src/nodes/bookmark.ts`:

```ts
import { Node, mergeAttributes } from "@tiptap/core";

export const FolioBookmark = Node.create({
  name: "bookmark",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      url: {
        default: "",
        parseHTML: (element) => element.getAttribute("href") ?? "",
        renderHTML: (attrs) => ({ href: attrs.url }),
      },
      title: {
        default: "",
        parseHTML: (element) => element.textContent ?? "",
        renderHTML: () => ({}),
      },
      description: {
        default: "",
        renderHTML: () => ({}),
      },
    };
  },

  parseHTML() {
    return [{ tag: "a[data-folio-bookmark]" }];
  },

  renderHTML({ HTMLAttributes, node }) {
    return [
      "a",
      mergeAttributes(HTMLAttributes, {
        "data-folio-bookmark": "",
        class: "folio-bookmark",
      }),
      node.attrs.title || node.attrs.url,
    ];
  },
});
```

Create `packages/core/src/nodes/image.ts`:

```ts
import Image from "@tiptap/extension-image";

export const FolioImage = Image.extend({
  name: "image",

  addAttributes() {
    return {
      ...this.parent?.(),
      caption: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-caption") ?? "",
        renderHTML: (attrs) => (attrs.caption ? { "data-caption": attrs.caption } : {}),
      },
    };
  },

  renderHTML({ HTMLAttributes }) {
    return ["img", { ...HTMLAttributes, class: "folio-image" }];
  },
});
```

Create `packages/core/src/nodes/toc.ts`:

```ts
import { Node, mergeAttributes } from "@tiptap/core";

export const FolioTableOfContentsNode = Node.create({
  name: "tableOfContents",
  group: "block",
  atom: true,
  selectable: true,

  parseHTML() {
    return [{ tag: "nav[data-folio-toc]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "nav",
      mergeAttributes(HTMLAttributes, {
        "data-folio-toc": "",
        class: "folio-toc",
      }),
      ["span", { class: "folio-toc__title" }, "Table of contents"],
    ];
  },
});
```

- [ ] **Step 5: Implement default extensions and serialization**

Create `packages/core/src/extensions/defaultExtensions.ts`:

```ts
import type { Extension } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { TableKit } from "@tiptap/extension-table";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Placeholder from "@tiptap/extension-placeholder";
import TextStyle from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import Details from "@tiptap/extension-details";
import DetailsSummary from "@tiptap/extension-details-summary";
import DetailsContent from "@tiptap/extension-details-content";
import { TableOfContents } from "@tiptap/extension-table-of-contents";
import Mention from "@tiptap/extension-mention";
import { Markdown } from "@tiptap/markdown";
import { FolioBookmark } from "../nodes/bookmark";
import { FolioCallout } from "../nodes/callout";
import { FolioImage } from "../nodes/image";
import { FolioTableOfContentsNode } from "../nodes/toc";
import type { FolioExtension } from "./types";

export interface CreateDefaultTiptapExtensionsOptions {
  folioExtensions?: FolioExtension[];
  placeholder?: string;
  includeMarkdown?: boolean;
}

export function createDefaultTiptapExtensions(
  options: CreateDefaultTiptapExtensionsOptions = {},
): Extension[] {
  const external = options.folioExtensions?.flatMap((extension) => extension.tiptapExtensions ?? []) ?? [];

  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      link: { openOnClick: false },
    }),
    TableKit.configure({
      table: {
        resizable: true,
        HTMLAttributes: { class: "folio-table" },
      },
    }),
    TaskList.configure({ HTMLAttributes: { class: "folio-task-list" } }),
    TaskItem.configure({ nested: true }),
    FolioImage.configure({ allowBase64: false }),
    Placeholder.configure({
      placeholder: options.placeholder ?? "Type / for commands",
    }),
    TextStyle,
    Color,
    Highlight.configure({ multicolor: true }),
    Details.configure({
      persist: true,
      HTMLAttributes: { class: "folio-toggle" },
    }),
    DetailsSummary,
    DetailsContent,
    TableOfContents,
    FolioTableOfContentsNode,
    Mention.configure({
      HTMLAttributes: { class: "folio-mention" },
      suggestion: {
        char: "@",
        items: ({ query }) =>
          ["Alice", "Bob", "Carol"].filter((name) =>
            name.toLowerCase().includes(query.toLowerCase()),
          ),
      },
    }),
    FolioCallout,
    FolioBookmark,
    ...(options.includeMarkdown ? [Markdown] : []),
    ...external,
  ];
}
```

Create `packages/core/src/testing/testExtensions.ts`:

```ts
import type { Extension } from "@tiptap/core";
import { createDefaultTiptapExtensions } from "../extensions/defaultExtensions";

export function createTestTiptapExtensions(): Extension[] {
  return createDefaultTiptapExtensions({ includeMarkdown: true });
}
```

Create `packages/core/src/serialization/html.ts`:

```ts
import { generateJSON } from "@tiptap/html";
import { renderToHTMLString } from "@tiptap/static-renderer/pm/html-string";
import type { FolioDocument } from "../document";
import { createDefaultTiptapExtensions } from "../extensions/defaultExtensions";

export function toHTML(document: FolioDocument): string {
  return renderToHTMLString({
    content: document,
    extensions: createDefaultTiptapExtensions(),
  });
}

export function fromHTML(html: string): FolioDocument {
  return generateJSON(html, createDefaultTiptapExtensions()) as FolioDocument;
}
```

Create `packages/core/src/serialization/markdown.ts`:

```ts
import { Editor } from "@tiptap/core";
import { renderToMarkdown } from "@tiptap/static-renderer/pm/markdown";
import type { FolioDocument } from "../document";
import { createEmptyFolioDocument } from "../document";
import { createDefaultTiptapExtensions } from "../extensions/defaultExtensions";

export function toMarkdown(document: FolioDocument): string {
  return renderToMarkdown({
    content: document,
    extensions: createDefaultTiptapExtensions({ includeMarkdown: true }),
  });
}

export function fromMarkdown(markdown: string): FolioDocument {
  if (markdown.trim().length === 0) {
    return createEmptyFolioDocument();
  }

  const editor = new Editor({
    extensions: createDefaultTiptapExtensions({ includeMarkdown: true }),
    content: markdown,
    contentType: "markdown",
  });

  const json = editor.getJSON() as FolioDocument;
  editor.destroy();
  return json;
}
```

Modify `packages/core/src/index.ts`:

```ts
export const folioCoreVersion = "0.1.0-alpha.0";

export * from "./document";
export * from "./fixtures";
export * from "./extensions/types";
export * from "./extensions/registry";
export * from "./extensions/defaultExtensions";
export * from "./serialization/html";
export * from "./serialization/markdown";
export * from "./testing/testExtensions";
export * from "./nodes/callout";
export * from "./nodes/bookmark";
export * from "./nodes/image";
export * from "./nodes/toc";
```

- [ ] **Step 6: Run serialization tests**

Run:

```bash
pnpm --filter @futelab/folio-core test -- serialization.test.ts
pnpm --filter @futelab/folio-core typecheck
```

Expected: tests pass and TypeScript reports no errors.

- [ ] **Step 7: Commit default extensions and serialization**

Run:

```bash
git add packages/core package.json pnpm-lock.yaml
git commit -m "feat: add folio serialization and default extensions"
```

## Task 6: Add Default Commands for Slash Menu and Block Menu

**Files:**
- Create: `packages/core/src/commands/defaultCommands.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/core/src/__tests__/registry.test.ts`

- [ ] **Step 1: Add failing command tests**

Append this test to `packages/core/src/__tests__/registry.test.ts`:

```ts
import { createDefaultFolioCommands } from "../commands/defaultCommands";

describe("default Folio commands", () => {
  it("exposes slash command labels in a stable order", () => {
    expect(createDefaultFolioCommands().map((command) => command.name)).toEqual([
      "paragraph",
      "heading1",
      "heading2",
      "heading3",
      "bulletList",
      "orderedList",
      "todoList",
      "quote",
      "callout",
      "divider",
      "codeBlock",
      "table",
      "image",
      "bookmark",
      "toggle",
      "toc",
    ]);
  });
});
```

- [ ] **Step 2: Run failing command test**

Run:

```bash
pnpm --filter @futelab/folio-core test -- registry.test.ts
```

Expected: FAIL because `createDefaultFolioCommands` does not exist.

- [ ] **Step 3: Implement default command metadata**

Create `packages/core/src/commands/defaultCommands.ts`:

```ts
import type { FolioCommandContribution } from "../extensions/types";

function runEditorChain(editor: unknown, callback: (chain: any) => any): boolean {
  const candidate = editor as { chain?: () => any };
  if (!candidate.chain) {
    return false;
  }

  callback(candidate.chain().focus()).run();
  return true;
}

export function createDefaultFolioCommands(): FolioCommandContribution[] {
  return [
    {
      name: "paragraph",
      label: "Text",
      keywords: ["paragraph", "plain"],
      action: ({ editor }) => runEditorChain(editor, (chain) => chain.setParagraph()),
    },
    {
      name: "heading1",
      label: "Heading 1",
      keywords: ["h1", "title"],
      action: ({ editor }) => runEditorChain(editor, (chain) => chain.toggleHeading({ level: 1 })),
    },
    {
      name: "heading2",
      label: "Heading 2",
      keywords: ["h2", "subtitle"],
      action: ({ editor }) => runEditorChain(editor, (chain) => chain.toggleHeading({ level: 2 })),
    },
    {
      name: "heading3",
      label: "Heading 3",
      keywords: ["h3"],
      action: ({ editor }) => runEditorChain(editor, (chain) => chain.toggleHeading({ level: 3 })),
    },
    {
      name: "bulletList",
      label: "Bulleted list",
      keywords: ["ul", "list"],
      action: ({ editor }) => runEditorChain(editor, (chain) => chain.toggleBulletList()),
    },
    {
      name: "orderedList",
      label: "Numbered list",
      keywords: ["ol", "list"],
      action: ({ editor }) => runEditorChain(editor, (chain) => chain.toggleOrderedList()),
    },
    {
      name: "todoList",
      label: "Todo list",
      keywords: ["task", "check"],
      action: ({ editor }) => runEditorChain(editor, (chain) => chain.toggleTaskList()),
    },
    {
      name: "quote",
      label: "Quote",
      keywords: ["blockquote"],
      action: ({ editor }) => runEditorChain(editor, (chain) => chain.toggleBlockquote()),
    },
    {
      name: "callout",
      label: "Callout",
      keywords: ["note", "aside"],
      action: ({ editor }) =>
        runEditorChain(editor, (chain) =>
          chain.insertContent({
            type: "callout",
            attrs: { tone: "info" },
            content: [{ type: "paragraph", content: [{ type: "text", text: "Callout" }] }],
          }),
        ),
    },
    {
      name: "divider",
      label: "Divider",
      keywords: ["horizontal", "rule"],
      action: ({ editor }) => runEditorChain(editor, (chain) => chain.setHorizontalRule()),
    },
    {
      name: "codeBlock",
      label: "Code block",
      keywords: ["pre", "code"],
      action: ({ editor }) => runEditorChain(editor, (chain) => chain.toggleCodeBlock()),
    },
    {
      name: "table",
      label: "Table",
      keywords: ["grid"],
      action: ({ editor }) => runEditorChain(editor, (chain) => chain.insertTable({ rows: 3, cols: 3, withHeaderRow: true })),
    },
    {
      name: "image",
      label: "Image",
      keywords: ["photo", "media"],
      action: ({ editor, attrs }) =>
        runEditorChain(editor, (chain) => chain.setImage({ src: String(attrs?.src ?? "") })),
    },
    {
      name: "bookmark",
      label: "Bookmark",
      keywords: ["link", "embed"],
      action: ({ editor, attrs }) =>
        runEditorChain(editor, (chain) =>
          chain.insertContent({
            type: "bookmark",
            attrs: {
              url: String(attrs?.url ?? ""),
              title: String(attrs?.title ?? attrs?.url ?? ""),
              description: String(attrs?.description ?? ""),
            },
          }),
        ),
    },
    {
      name: "toggle",
      label: "Toggle",
      keywords: ["details", "collapse"],
      action: ({ editor }) => runEditorChain(editor, (chain) => chain.setDetails()),
    },
    {
      name: "toc",
      label: "Table of contents",
      keywords: ["outline"],
      action: ({ editor }) =>
        runEditorChain(editor, (chain) =>
          chain.insertContent({
            type: "tableOfContents",
          }),
        ),
    },
  ];
}
```

Modify `packages/core/src/index.ts`:

```ts
export const folioCoreVersion = "0.1.0-alpha.0";

export * from "./document";
export * from "./fixtures";
export * from "./extensions/types";
export * from "./extensions/registry";
export * from "./extensions/defaultExtensions";
export * from "./serialization/html";
export * from "./serialization/markdown";
export * from "./testing/testExtensions";
export * from "./nodes/callout";
export * from "./nodes/bookmark";
export * from "./nodes/image";
export * from "./nodes/toc";
export * from "./commands/defaultCommands";
```

- [ ] **Step 4: Run command tests**

Run:

```bash
pnpm --filter @futelab/folio-core test -- registry.test.ts
pnpm --filter @futelab/folio-core typecheck
```

Expected: tests pass.

- [ ] **Step 5: Commit commands**

Run:

```bash
git add packages/core/src
git commit -m "feat: add default folio commands"
```

## Task 7: Implement React Hook, Context, Editor, and Reader

**Files:**
- Modify: `packages/react/package.json`
- Create: `packages/react/src/context.tsx`
- Create: `packages/react/src/useFolioEditor.ts`
- Create: `packages/react/src/FolioEditor.tsx`
- Create: `packages/react/src/FolioReader.tsx`
- Create: `packages/react/src/reader/renderers.tsx`
- Modify: `packages/react/src/index.ts`
- Create: `packages/react/src/__tests__/FolioEditor.test.tsx`
- Create: `packages/react/src/__tests__/FolioReader.test.tsx`

- [ ] **Step 1: Add React package dependencies**

Run:

```bash
pnpm --filter @futelab/folio-react add @tiptap/core @tiptap/react @tiptap/pm @tiptap/starter-kit @tiptap/static-renderer react-dom
```

Expected: `packages/react/package.json` and `pnpm-lock.yaml` update.

- [ ] **Step 2: Write failing React component tests**

Create `packages/react/src/__tests__/FolioEditor.test.tsx`:

```tsx
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createEmptyFolioDocument } from "@futelab/folio-core";
import { FolioEditor } from "../FolioEditor";

describe("FolioEditor", () => {
  it("renders an editable editor surface", () => {
    render(
      <FolioEditor
        value={createEmptyFolioDocument()}
        onChange={vi.fn()}
        placeholder="Write here"
      />,
    );

    expect(screen.getByTestId("folio-editor")).toHaveClass("folio-editor");
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });
});
```

Create `packages/react/src/__tests__/FolioReader.test.tsx`:

```tsx
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { sampleFolioDocument } from "@futelab/folio-core";
import { FolioReader } from "../FolioReader";

describe("FolioReader", () => {
  it("renders Folio JSON without editor controls", () => {
    render(<FolioReader value={sampleFolioDocument} />);

    expect(screen.getByTestId("folio-reader")).toHaveClass("folio-reader");
    expect(screen.getByText("Folio document")).toBeInTheDocument();
    expect(screen.queryByTestId("folio-editor")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run failing React tests**

Run:

```bash
pnpm --filter @futelab/folio-react test -- Folio
```

Expected: FAIL with missing component implementation.

- [ ] **Step 4: Implement React context and hook**

Create `packages/react/src/context.tsx`:

```tsx
import { createContext, useContext } from "react";
import type { Editor } from "@tiptap/react";

export interface FolioEditorContextValue {
  editor: Editor | null;
}

export const FolioEditorContext = createContext<FolioEditorContextValue>({
  editor: null,
});

export function useFolioEditorContext(): FolioEditorContextValue {
  return useContext(FolioEditorContext);
}
```

Create `packages/react/src/useFolioEditor.ts`:

```ts
import { useEffect, useRef } from "react";
import { useEditor } from "@tiptap/react";
import {
  createDefaultTiptapExtensions,
  createEmptyFolioDocument,
  type FolioDocument,
  type FolioExtension,
} from "@futelab/folio-core";

export interface UseFolioEditorOptions {
  value?: FolioDocument;
  defaultValue?: FolioDocument;
  onChange?: (value: FolioDocument) => void;
  editable?: boolean;
  extensions?: FolioExtension[];
  placeholder?: string;
}

export function useFolioEditor(options: UseFolioEditorOptions = {}) {
  const onChangeRef = useRef(options.onChange);
  onChangeRef.current = options.onChange;

  const editor = useEditor({
    extensions: createDefaultTiptapExtensions({
      folioExtensions: options.extensions,
      placeholder: options.placeholder,
    }),
    content: options.value ?? options.defaultValue ?? createEmptyFolioDocument(),
    editable: options.editable ?? true,
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      onChangeRef.current?.(editor.getJSON() as FolioDocument);
    },
  });

  useEffect(() => {
    if (!editor || !options.value) {
      return;
    }

    const current = JSON.stringify(editor.getJSON());
    const next = JSON.stringify(options.value);

    if (current !== next) {
      editor.commands.setContent(options.value, { emitUpdate: false });
    }
  }, [editor, options.value]);

  useEffect(() => {
    editor?.setEditable(options.editable ?? true);
  }, [editor, options.editable]);

  return editor;
}
```

- [ ] **Step 5: Implement editor and reader components**

Create `packages/react/src/FolioEditor.tsx`:

```tsx
import { EditorContent } from "@tiptap/react";
import { FolioEditorContext } from "./context";
import { useFolioEditor, type UseFolioEditorOptions } from "./useFolioEditor";

export interface FolioEditorClassNames {
  root?: string;
  content?: string;
}

export interface FolioEditorProps extends UseFolioEditorOptions {
  className?: string;
  classNames?: FolioEditorClassNames;
}

export function FolioEditor(props: FolioEditorProps) {
  const editor = useFolioEditor(props);
  const rootClassName = ["folio-editor", props.className, props.classNames?.root]
    .filter(Boolean)
    .join(" ");

  return (
    <FolioEditorContext.Provider value={{ editor }}>
      <div className={rootClassName} data-testid="folio-editor">
        <EditorContent
          editor={editor}
          role="textbox"
          className={["folio-editor__content", props.classNames?.content].filter(Boolean).join(" ")}
        />
      </div>
    </FolioEditorContext.Provider>
  );
}
```

Create `packages/react/src/reader/renderers.tsx`:

```tsx
import { Fragment, type ReactNode } from "react";
import type { FolioJSONContent } from "@futelab/folio-core";

interface TocEntry {
  id: string;
  level: number;
  text: string;
}

function textContent(node: FolioJSONContent): string {
  if (node.type === "text") {
    return node.text ?? "";
  }

  return node.content?.map(textContent).join("") ?? "";
}

function collectHeadings(node: FolioJSONContent, entries: TocEntry[] = []): TocEntry[] {
  if (node.type === "heading") {
    const text = textContent(node);
    entries.push({
      id: text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
      level: Number(node.attrs?.level ?? 1),
      text,
    });
  }

  node.content?.forEach((child) => collectHeadings(child, entries));
  return entries;
}

export function renderFolioNode(node: FolioJSONContent, key = "root", root: FolioJSONContent = node): ReactNode {
  const children = node.content?.map((child, index) => renderFolioNode(child, `${key}-${index}`, root));

  if (node.type === "text") {
    let text: ReactNode = node.text ?? "";
    for (const mark of node.marks ?? []) {
      if (mark.type === "bold") text = <strong key={`${key}-bold`}>{text}</strong>;
      if (mark.type === "italic") text = <em key={`${key}-italic`}>{text}</em>;
      if (mark.type === "code") text = <code key={`${key}-code`}>{text}</code>;
      if (mark.type === "link") text = <a key={`${key}-link`} href={String(mark.attrs?.href ?? "")}>{text}</a>;
    }
    return <Fragment key={key}>{text}</Fragment>;
  }

  if (node.type === "heading") {
    const level = Number(node.attrs?.level ?? 1);
    const Tag = `h${Math.min(Math.max(level, 1), 3)}` as "h1" | "h2" | "h3";
    const id = textContent(node).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    return <Tag key={key} id={id}>{children}</Tag>;
  }

  if (node.type === "paragraph") return <p key={key}>{children}</p>;
  if (node.type === "bulletList") return <ul key={key}>{children}</ul>;
  if (node.type === "orderedList") return <ol key={key}>{children}</ol>;
  if (node.type === "listItem") return <li key={key}>{children}</li>;
  if (node.type === "blockquote") return <blockquote key={key}>{children}</blockquote>;
  if (node.type === "horizontalRule") return <hr key={key} />;
  if (node.type === "codeBlock") return <pre key={key}><code>{node.content?.map((item) => item.text).join("")}</code></pre>;
  if (node.type === "image") return <figure key={key}><img src={String(node.attrs?.src ?? "")} alt={String(node.attrs?.alt ?? "")} />{node.attrs?.caption ? <figcaption>{String(node.attrs.caption)}</figcaption> : null}</figure>;
  if (node.type === "callout") return <aside key={key} className="folio-callout" data-tone={String(node.attrs?.tone ?? "info")}>{children}</aside>;
  if (node.type === "bookmark") return <a key={key} className="folio-bookmark" href={String(node.attrs?.url ?? "")}>{String(node.attrs?.title ?? node.attrs?.url ?? "")}</a>;
  if (node.type === "tableOfContents") {
    return (
      <nav key={key} className="folio-toc" aria-label="Table of contents">
        {collectHeadings(root).map((entry) => (
          <a key={entry.id} className={`folio-toc__item folio-toc__item--level-${entry.level}`} href={`#${entry.id}`}>
            {entry.text}
          </a>
        ))}
      </nav>
    );
  }
  if (node.type === "doc") return <>{children}</>;

  return <div key={key} data-folio-unknown-node={node.type}>{children}</div>;
}
```

Create `packages/react/src/FolioReader.tsx`:

```tsx
import type { FolioDocument } from "@futelab/folio-core";
import { renderFolioNode } from "./reader/renderers";

export interface FolioReaderClassNames {
  root?: string;
}

export interface FolioReaderProps {
  value: FolioDocument;
  className?: string;
  classNames?: FolioReaderClassNames;
}

export function FolioReader({ value, className, classNames }: FolioReaderProps) {
  const rootClassName = ["folio-reader", className, classNames?.root].filter(Boolean).join(" ");

  return (
    <article className={rootClassName} data-testid="folio-reader">
      {renderFolioNode(value)}
    </article>
  );
}
```

Modify `packages/react/src/index.ts`:

```ts
export const folioReactVersion = "0.1.0-alpha.0";

export * from "./FolioEditor";
export * from "./FolioReader";
export * from "./useFolioEditor";
export * from "./context";
```

- [ ] **Step 6: Run React tests and typecheck**

Run:

```bash
pnpm --filter @futelab/folio-react test -- Folio
pnpm --filter @futelab/folio-react typecheck
```

Expected: tests pass and TypeScript reports no errors.

- [ ] **Step 7: Commit React core**

Run:

```bash
git add packages/react package.json pnpm-lock.yaml
git commit -m "feat: add folio editor and reader components"
```

## Task 8: Add Slash Menu, Bubble Toolbar, Block Controls, and Drag Handle

**Files:**
- Modify: `packages/react/package.json`
- Create: `packages/react/src/menus/SlashMenu.tsx`
- Create: `packages/react/src/menus/BubbleToolbar.tsx`
- Create: `packages/react/src/blocks/BlockControls.tsx`
- Create: `packages/react/src/blocks/DragHandle.tsx`
- Modify: `packages/react/src/FolioEditor.tsx`
- Modify: `packages/react/src/index.ts`
- Modify: `packages/react/src/__tests__/FolioEditor.test.tsx`

- [ ] **Step 1: Add interaction dependencies**

Run:

```bash
pnpm --filter @futelab/folio-react add @tiptap/extension-drag-handle-react @tiptap/extension-drag-handle @tiptap/extension-node-range lucide-react
```

Expected: React package manifest and lockfile update.

- [ ] **Step 2: Add failing interaction tests**

Append these tests to `packages/react/src/__tests__/FolioEditor.test.tsx`:

```tsx
import userEvent from "@testing-library/user-event";

it("shows slash commands when slash query is set", async () => {
  render(
    <FolioEditor
      value={createEmptyFolioDocument()}
      onChange={vi.fn()}
      initialSlashQuery="/"
    />,
  );

  expect(screen.getByRole("menu", { name: "Slash commands" })).toBeInTheDocument();
  expect(screen.getByRole("menuitem", { name: "Heading 1" })).toBeInTheDocument();
});

it("renders bubble toolbar controls", () => {
  render(<FolioEditor value={createEmptyFolioDocument()} onChange={vi.fn()} />);

  expect(screen.getByRole("toolbar", { name: "Text formatting" })).toBeInTheDocument();
});

it("renders block controls", () => {
  render(<FolioEditor value={createEmptyFolioDocument()} onChange={vi.fn()} />);

  expect(screen.getByRole("button", { name: "Insert block" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Drag block" })).toBeInTheDocument();
});
```

- [ ] **Step 3: Run failing interaction tests**

Run:

```bash
pnpm --filter @futelab/folio-react test -- FolioEditor.test.tsx
```

Expected: FAIL because `initialSlashQuery` and controls are missing.

- [ ] **Step 4: Implement menu and control components**

Create `packages/react/src/menus/SlashMenu.tsx`:

```tsx
import { createDefaultFolioCommands, type FolioCommandContribution } from "@futelab/folio-core";

export interface SlashMenuProps {
  editor: unknown;
  query: string;
  commands?: FolioCommandContribution[];
}

export function SlashMenu({ editor, query, commands = createDefaultFolioCommands() }: SlashMenuProps) {
  const normalizedQuery = query.replace("/", "").trim().toLowerCase();
  const items = commands.filter((command) => {
    const haystack = [command.name, command.label, ...(command.keywords ?? [])].join(" ").toLowerCase();
    return haystack.includes(normalizedQuery);
  });

  if (!query.startsWith("/")) {
    return null;
  }

  return (
    <div className="folio-slash-menu" role="menu" aria-label="Slash commands">
      {items.map((command) => (
        <button
          className="folio-slash-menu__item"
          key={command.name}
          role="menuitem"
          type="button"
          onClick={() => command.action({ editor })}
        >
          {command.label}
        </button>
      ))}
    </div>
  );
}
```

Create `packages/react/src/menus/BubbleToolbar.tsx`:

```tsx
import { Bold, Code, Highlighter, Italic, Link, Strikethrough, Underline } from "lucide-react";
import type { Editor } from "@tiptap/react";

export interface BubbleToolbarProps {
  editor: Editor | null;
}

export function BubbleToolbar({ editor }: BubbleToolbarProps) {
  const toggle = (action: (editor: Editor) => void) => {
    if (editor) action(editor);
  };

  return (
    <div className="folio-bubble-toolbar" role="toolbar" aria-label="Text formatting">
      <button aria-label="Bold" type="button" onClick={() => toggle((item) => item.chain().focus().toggleBold().run())}><Bold size={16} /></button>
      <button aria-label="Italic" type="button" onClick={() => toggle((item) => item.chain().focus().toggleItalic().run())}><Italic size={16} /></button>
      <button aria-label="Underline" type="button" onClick={() => toggle((item) => item.chain().focus().toggleUnderline().run())}><Underline size={16} /></button>
      <button aria-label="Strike" type="button" onClick={() => toggle((item) => item.chain().focus().toggleStrike().run())}><Strikethrough size={16} /></button>
      <button aria-label="Code" type="button" onClick={() => toggle((item) => item.chain().focus().toggleCode().run())}><Code size={16} /></button>
      <button aria-label="Link" type="button" onClick={() => toggle((item) => item.chain().focus().setLink({ href: "https://example.com" }).run())}><Link size={16} /></button>
      <button aria-label="Highlight" type="button" onClick={() => toggle((item) => item.chain().focus().toggleHighlight({ color: "#fff3bf" }).run())}><Highlighter size={16} /></button>
    </div>
  );
}
```

Create `packages/react/src/blocks/BlockControls.tsx`:

```tsx
import { Plus } from "lucide-react";
import type { Editor } from "@tiptap/react";

export interface BlockControlsProps {
  editor: Editor | null;
}

export function BlockControls({ editor }: BlockControlsProps) {
  return (
    <div className="folio-block-controls" aria-label="Block controls">
      <button
        aria-label="Insert block"
        type="button"
        onClick={() => editor?.chain().focus().insertContent({ type: "paragraph" }).run()}
      >
        <Plus size={16} />
      </button>
    </div>
  );
}
```

Create `packages/react/src/blocks/DragHandle.tsx`:

```tsx
import TiptapDragHandle from "@tiptap/extension-drag-handle-react";
import type { Editor } from "@tiptap/react";
import { GripVertical } from "lucide-react";

export interface FolioDragHandleProps {
  editor: Editor | null;
}

export function FolioDragHandle({ editor }: FolioDragHandleProps) {
  if (!editor) {
    return null;
  }

  return (
    <TiptapDragHandle editor={editor} nested={{ edgeDetection: { threshold: -16 } }}>
      <button aria-label="Drag block" className="folio-drag-handle" type="button">
        <GripVertical size={16} />
      </button>
    </TiptapDragHandle>
  );
}
```

- [ ] **Step 5: Wire controls into editor**

Modify `packages/react/src/FolioEditor.tsx`:

```tsx
import { EditorContent } from "@tiptap/react";
import { BlockControls } from "./blocks/BlockControls";
import { FolioDragHandle } from "./blocks/DragHandle";
import { FolioEditorContext } from "./context";
import { BubbleToolbar } from "./menus/BubbleToolbar";
import { SlashMenu } from "./menus/SlashMenu";
import { useFolioEditor, type UseFolioEditorOptions } from "./useFolioEditor";

export interface FolioEditorClassNames {
  root?: string;
  content?: string;
}

export interface FolioEditorProps extends UseFolioEditorOptions {
  className?: string;
  classNames?: FolioEditorClassNames;
  initialSlashQuery?: string;
}

export function FolioEditor(props: FolioEditorProps) {
  const editor = useFolioEditor(props);
  const rootClassName = ["folio-editor", props.className, props.classNames?.root]
    .filter(Boolean)
    .join(" ");

  return (
    <FolioEditorContext.Provider value={{ editor }}>
      <div className={rootClassName} data-testid="folio-editor">
        <BlockControls editor={editor} />
        <FolioDragHandle editor={editor} />
        <BubbleToolbar editor={editor} />
        <SlashMenu editor={editor} query={props.initialSlashQuery ?? ""} />
        <EditorContent
          editor={editor}
          role="textbox"
          className={["folio-editor__content", props.classNames?.content].filter(Boolean).join(" ")}
        />
      </div>
    </FolioEditorContext.Provider>
  );
}
```

Modify `packages/react/src/index.ts`:

```ts
export const folioReactVersion = "0.1.0-alpha.0";

export * from "./FolioEditor";
export * from "./FolioReader";
export * from "./useFolioEditor";
export * from "./context";
export * from "./menus/SlashMenu";
export * from "./menus/BubbleToolbar";
export * from "./blocks/BlockControls";
export * from "./blocks/DragHandle";
```

- [ ] **Step 6: Run interaction tests**

Run:

```bash
pnpm --filter @futelab/folio-react test -- FolioEditor.test.tsx
pnpm --filter @futelab/folio-react typecheck
```

Expected: tests pass.

- [ ] **Step 7: Commit editor interactions**

Run:

```bash
git add packages/react package.json pnpm-lock.yaml
git commit -m "feat: add notion-like editor controls"
```

## Task 9: Add Minimal Notion-like Styles and Theme Tokens

**Files:**
- Modify: `packages/styles/editor.css`
- Modify: `packages/styles/reader.css`
- Modify: `packages/styles/styles.css`

- [ ] **Step 1: Write style acceptance check**

Run:

```bash
test -f packages/styles/styles.css && test -f packages/styles/editor.css && test -f packages/styles/reader.css && rg -- "--folio-color-text|folio-slash-menu|folio-bubble-toolbar|folio-reader" packages/styles
```

Expected: FAIL because tokens and component classes are incomplete.

- [ ] **Step 2: Implement default theme CSS**

Modify `packages/styles/styles.css`:

```css
@import "./editor.css";
@import "./reader.css";

:root {
  --folio-color-bg: #ffffff;
  --folio-color-surface: #fbfbfa;
  --folio-color-text: #252525;
  --folio-color-muted: #787774;
  --folio-color-border: #e9e5df;
  --folio-color-hover: #f1f1ef;
  --folio-color-selected: #e8f2ff;
  --folio-color-callout-bg: #f7f4ed;
  --folio-color-callout-border: #ded7c8;
  --folio-radius-sm: 4px;
  --folio-radius-md: 6px;
  --folio-font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --folio-shadow-menu: 0 8px 24px rgba(15, 15, 15, 0.12);
}
```

Modify `packages/styles/editor.css`:

```css
.folio-editor {
  background: var(--folio-color-bg);
  color: var(--folio-color-text);
  font-family: var(--folio-font-family);
  line-height: 1.6;
  position: relative;
}

.folio-editor__content {
  min-height: 160px;
  outline: none;
}

.folio-editor .ProseMirror {
  outline: none;
}

.folio-editor .ProseMirror p {
  margin: 0.35rem 0;
}

.folio-editor .ProseMirror h1,
.folio-editor .ProseMirror h2,
.folio-editor .ProseMirror h3 {
  color: var(--folio-color-text);
  font-weight: 650;
  line-height: 1.25;
  margin: 1.2rem 0 0.5rem;
}

.folio-editor .ProseMirror h1 {
  font-size: 2rem;
}

.folio-editor .ProseMirror h2 {
  font-size: 1.5rem;
}

.folio-editor .ProseMirror h3 {
  font-size: 1.2rem;
}

.folio-block-controls,
.folio-bubble-toolbar,
.folio-slash-menu {
  background: var(--folio-color-bg);
  border: 1px solid var(--folio-color-border);
  border-radius: var(--folio-radius-md);
  box-shadow: var(--folio-shadow-menu);
}

.folio-block-controls {
  display: inline-flex;
  gap: 2px;
  padding: 2px;
}

.folio-block-controls button,
.folio-bubble-toolbar button,
.folio-slash-menu__item,
.folio-drag-handle {
  align-items: center;
  background: transparent;
  border: 0;
  border-radius: var(--folio-radius-sm);
  color: var(--folio-color-muted);
  cursor: pointer;
  display: inline-flex;
  min-height: 28px;
  padding: 4px 6px;
}

.folio-block-controls button:hover,
.folio-bubble-toolbar button:hover,
.folio-slash-menu__item:hover,
.folio-drag-handle:hover {
  background: var(--folio-color-hover);
  color: var(--folio-color-text);
}

.folio-bubble-toolbar {
  display: inline-flex;
  gap: 2px;
  padding: 3px;
}

.folio-slash-menu {
  display: grid;
  max-height: 280px;
  min-width: 220px;
  overflow: auto;
  padding: 6px;
  position: absolute;
  z-index: 20;
}

.folio-slash-menu__item {
  color: var(--folio-color-text);
  justify-content: flex-start;
  text-align: left;
  width: 100%;
}

.folio-callout {
  background: var(--folio-color-callout-bg);
  border-left: 3px solid var(--folio-color-callout-border);
  border-radius: var(--folio-radius-md);
  margin: 0.75rem 0;
  padding: 0.75rem 0.9rem;
}

.folio-bookmark {
  border: 1px solid var(--folio-color-border);
  border-radius: var(--folio-radius-md);
  color: inherit;
  display: block;
  margin: 0.75rem 0;
  padding: 0.85rem;
  text-decoration: none;
}

.folio-mention {
  background: var(--folio-color-hover);
  border-radius: var(--folio-radius-sm);
  color: var(--folio-color-text);
  padding: 0.05rem 0.25rem;
}

.folio-toc {
  border: 1px solid var(--folio-color-border);
  border-radius: var(--folio-radius-md);
  display: grid;
  gap: 0.25rem;
  margin: 0.75rem 0;
  padding: 0.75rem;
}

.folio-toc__item {
  color: var(--folio-color-muted);
  text-decoration: none;
}

.folio-toc__item--level-2 {
  padding-left: 1rem;
}

.folio-toc__item--level-3 {
  padding-left: 2rem;
}
```

Modify `packages/styles/reader.css`:

```css
.folio-reader {
  background: var(--folio-color-bg);
  color: var(--folio-color-text);
  font-family: var(--folio-font-family);
  line-height: 1.65;
}

.folio-reader p {
  margin: 0.35rem 0;
}

.folio-reader h1,
.folio-reader h2,
.folio-reader h3 {
  color: var(--folio-color-text);
  font-weight: 650;
  line-height: 1.25;
  margin: 1.2rem 0 0.5rem;
}

.folio-reader h1 {
  font-size: 2rem;
}

.folio-reader h2 {
  font-size: 1.5rem;
}

.folio-reader h3 {
  font-size: 1.2rem;
}

.folio-reader blockquote {
  border-left: 3px solid var(--folio-color-border);
  color: var(--folio-color-muted);
  margin: 0.75rem 0;
  padding-left: 0.9rem;
}

.folio-reader code {
  background: var(--folio-color-hover);
  border-radius: var(--folio-radius-sm);
  padding: 0.1rem 0.25rem;
}

.folio-reader figure {
  margin: 1rem 0;
}

.folio-reader figcaption {
  color: var(--folio-color-muted);
  font-size: 0.875rem;
  margin-top: 0.35rem;
}
```

- [ ] **Step 3: Run style acceptance check**

Run:

```bash
rg -- "--folio-color-text|folio-slash-menu|folio-bubble-toolbar|folio-reader" packages/styles
pnpm build
```

Expected: required class names are found and package builds pass.

- [ ] **Step 4: Commit styles**

Run:

```bash
git add packages/styles
git commit -m "feat: add folio default theme styles"
```

## Task 10: Add Storybook Documentation App

**Files:**
- Create: `apps/docs/package.json`
- Create: `apps/docs/.storybook/main.ts`
- Create: `apps/docs/.storybook/preview.ts`
- Create: `apps/docs/src/FolioEditor.stories.tsx`
- Create: `apps/docs/src/FolioReader.stories.tsx`
- Create: `apps/docs/src/CustomExtension.stories.tsx`

- [ ] **Step 1: Add Storybook dependencies**

Run:

```bash
pnpm --filter @futelab/folio-docs add @storybook/react-vite @storybook/addon-essentials storybook vite react react-dom @futelab/folio
```

Expected: docs package does not exist yet, so this command fails.

- [ ] **Step 2: Create docs package and Storybook config**

Create `apps/docs/package.json`:

```json
{
  "name": "@futelab/folio-docs",
  "version": "0.1.0-alpha.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "storybook dev",
    "build": "storybook build",
    "test": "node -e \"console.log('docs tests run through e2e')\"",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@futelab/folio": "workspace:*",
    "@storybook/addon-essentials": "^8.6.0",
    "@storybook/react-vite": "^8.6.0",
    "react": "^19.1.0",
    "react-dom": "^19.1.0",
    "storybook": "^8.6.0",
    "vite": "^6.3.0"
  },
  "devDependencies": {
    "@types/react": "^19.1.0",
    "@types/react-dom": "^19.1.0",
    "typescript": "^5.8.0"
  }
}
```

Create `apps/docs/.storybook/main.ts`:

```ts
import type { StorybookConfig } from "@storybook/react-vite";

const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(ts|tsx)"],
  addons: ["@storybook/addon-essentials"],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
};

export default config;
```

Create `apps/docs/.storybook/preview.ts`:

```ts
import "@futelab/folio/styles.css";
```

- [ ] **Step 3: Add Storybook stories**

Create `apps/docs/src/FolioEditor.stories.tsx`:

```tsx
import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { FolioEditor, type FolioDocument, createEmptyFolioDocument } from "@futelab/folio";

const meta = {
  title: "Folio/Editor",
  component: FolioEditor,
} satisfies Meta<typeof FolioEditor>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Controlled: Story = {
  render: () => {
    const [value, setValue] = useState<FolioDocument>(createEmptyFolioDocument());
    return <FolioEditor value={value} onChange={setValue} placeholder="Type / for commands" />;
  },
};

export const WithSlashMenu: Story = {
  render: () => {
    const [value, setValue] = useState<FolioDocument>(createEmptyFolioDocument());
    return <FolioEditor value={value} onChange={setValue} initialSlashQuery="/" />;
  },
};
```

Create `apps/docs/src/FolioReader.stories.tsx`:

```tsx
import type { Meta, StoryObj } from "@storybook/react";
import { FolioReader, sampleFolioDocument } from "@futelab/folio";

const meta = {
  title: "Folio/Reader",
  component: FolioReader,
} satisfies Meta<typeof FolioReader>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  args: {
    value: sampleFolioDocument,
  },
};
```

Create `apps/docs/src/CustomExtension.stories.tsx`:

```tsx
import type { Meta, StoryObj } from "@storybook/react";
import { createFolioExtension, createFolioExtensionRegistry } from "@futelab/folio";

function ExtensionExample() {
  const extension = createFolioExtension({
    name: "example",
    commands: [{ name: "example", label: "Example", action: () => true }],
  });
  const registry = createFolioExtensionRegistry([extension]);

  return <pre>{JSON.stringify(registry.commands.map((command) => command.label), null, 2)}</pre>;
}

const meta = {
  title: "Folio/Custom Extension",
  component: ExtensionExample,
} satisfies Meta<typeof ExtensionExample>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Basic: Story = {};
```

- [ ] **Step 4: Verify docs build**

Run:

```bash
pnpm install
pnpm --filter @futelab/folio-docs build
```

Expected: Storybook static build completes.

- [ ] **Step 5: Commit docs app**

Run:

```bash
git add apps/docs package.json pnpm-lock.yaml
git commit -m "docs: add folio storybook examples"
```

## Task 11: Add Playwright Interaction Coverage

**Files:**
- Create: `tests/e2e/folio-editor.spec.ts`
- Modify: `package.json` if Playwright browser install script is needed

- [ ] **Step 1: Write failing e2e tests**

Create `tests/e2e/folio-editor.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test("slash menu renders Notion-like command list", async ({ page }) => {
  await page.goto("/?path=/story/folio-editor--with-slash-menu");

  await expect(page.getByRole("menu", { name: "Slash commands" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Heading 1" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Callout" })).toBeVisible();
});

test("reader renders document content without editor controls", async ({ page }) => {
  await page.goto("/?path=/story/folio-reader--basic");

  await expect(page.getByTestId("folio-reader")).toBeVisible();
  await expect(page.getByText("Folio document")).toBeVisible();
  await expect(page.getByTestId("folio-editor")).toHaveCount(0);
});
```

- [ ] **Step 2: Run e2e tests before docs server is configured**

Run:

```bash
pnpm test:e2e
```

Expected: FAIL if browsers are missing or Storybook route is not yet serving the story.

- [ ] **Step 3: Install Playwright browsers if needed**

Run:

```bash
pnpm exec playwright install chromium
```

Expected: Chromium browser installs.

- [ ] **Step 4: Run e2e tests**

Run:

```bash
pnpm test:e2e
```

Expected: slash menu and reader tests pass in Chromium.

- [ ] **Step 5: Commit e2e coverage**

Run:

```bash
git add tests/e2e package.json pnpm-lock.yaml
git commit -m "test: add folio interaction e2e coverage"
```

## Task 12: Finalize Aggregated Exports and Release Checks

**Files:**
- Modify: `packages/folio/src/index.ts`
- Modify: `packages/folio/src/core.ts`
- Modify: `packages/folio/src/react.ts`
- Modify: `packages/folio/package.json`
- Create: `.changeset/soft-cycles-happen.md`

- [ ] **Step 1: Write failing aggregate export check**

Run:

```bash
pnpm --filter @futelab/folio build
node -e "import('./packages/folio/dist/index.js').then((m) => { if (!m.FolioEditor || !m.FolioReader || !m.createFolioExtension) process.exit(1) })"
```

Expected: FAIL if aggregate exports are incomplete.

- [ ] **Step 2: Finalize package forwarding code**

Modify `packages/folio/src/index.ts`:

```ts
export * from "../../core/src";
export * from "../../react/src";
```

Modify `packages/folio/src/core.ts`:

```ts
export * from "../../core/src";
```

Modify `packages/folio/src/react.ts`:

```ts
export * from "../../react/src";
```

- [ ] **Step 3: Add initial changeset**

Create `.changeset/soft-cycles-happen.md`:

```md
---
"@futelab/folio": minor
---

Add the first alpha of the Folio Notion-like React editor and reader component library.
```

- [ ] **Step 4: Run full verification**

Run:

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
pnpm changeset status
pnpm --filter @futelab/folio pack --pack-destination .tmp
! tar -xOf .tmp/futelab-folio-*.tgz package/package.json | rg "workspace:"
```

Expected: all commands pass. Changesets reports one pending minor release for `@futelab/folio`, and the packed package manifest contains no `workspace:` dependency references.

- [ ] **Step 5: Commit release readiness**

Run:

```bash
git add packages/folio .changeset package.json pnpm-lock.yaml
git commit -m "chore: prepare folio alpha release"
```

## Self-Review

Spec coverage:

- Productized package shape: covered by Tasks 1, 2, and 12.
- `@futelab/folio` single public package with subpath exports: covered by Tasks 2 and 12.
- Tiptap/ProseMirror core: covered by Tasks 5, 7, and 8.
- JSON-first model: covered by Task 3.
- HTML/Markdown utilities: covered by Task 5.
- Editor and Reader components: covered by Task 7.
- Image caption, mention, bookmark, callout, toggle, table, and table-of-contents coverage: covered by Tasks 5, 6, and 7.
- Notion-like slash, bubble, block controls, and drag handle: covered by Task 8 and verified by Task 11.
- Minimal Notion-like theme with CSS variables: covered by Task 9.
- Storybook docs: covered by Task 10.
- Vitest, Testing Library, and Playwright: covered by Tasks 1, 3, 4, 5, 7, 8, and 11.
- Changesets and Turborepo: covered by Tasks 1 and 12.
- Excluded databases/collaboration/AI: preserved by limiting scope to document blocks and extension interfaces.

Placeholder scan:

- No task contains deferred work markers.
- Code examples define concrete paths, exports, commands, and expected verification commands.

Type consistency:

- `FolioDocument`, `FolioJSONContent`, `FolioExtension`, `FolioEditor`, `FolioReader`, `useFolioEditor`, `createFolioExtension`, and `createFolioExtensionRegistry` names are introduced before later tasks use them.
- Aggregator exports from `../../core/src` and `../../react/src` keep the published package free of internal workspace runtime dependencies.
