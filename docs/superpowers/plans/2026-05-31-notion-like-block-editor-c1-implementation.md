# Notion-Like Block Editor C1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the current Folio demo and React editor package into a Notion-like block editing experience with contextual block controls, richer command menus, and a document-first surface.

**Architecture:** Keep the existing Tiptap editor and Folio document model. Add a small block interaction layer in `packages/react`, expand command display metadata in `packages/core`, refine shared styles in `packages/styles`, and make `apps/demo` consume the resulting editor as the primary experience. Preserve the package aggregator in `packages/folio`.

**Tech Stack:** TypeScript, React, Tiptap 3, ProseMirror DOM coordinates, lucide-react icons, CSS variables, Vitest, Testing Library, Playwright, pnpm, Turborepo.

---

## Reference Inputs

- Design spec: `docs/superpowers/specs/2026-05-31-notion-like-block-editor-c1-design.md`
- Current demo: `apps/demo/src/DemoApp.tsx`
- Current demo styles: `apps/demo/src/styles.css`
- Current editor shell: `packages/react/src/FolioEditor.tsx`
- Current slash menu: `packages/react/src/menus/SlashMenu.tsx`
- Current block controls: `packages/react/src/blocks/BlockControls.tsx`
- Current command definitions: `packages/core/src/commands/defaultCommands.ts`
- Public package forwarding: `packages/folio/src/react.ts`
- E2E suite: `tests/e2e/folio-demo.spec.ts`

## Scope Check

C1 is one product slice: block-editor interaction feel. It excludes database views, AI commands, collaboration, comments, and real cross-block drag sorting. The drag handle in C1 is a visible and accessible affordance; true reorder behavior is planned for C1.2.

## Current Workspace State

The workspace currently contains uncommitted slash-command fixes from the previous interaction:

- `packages/react/src/FolioEditor.tsx`
- `packages/react/src/menus/SlashMenu.tsx`
- `packages/react/src/menus/slashMenuUtils.ts`
- `packages/styles/editor.css`
- `packages/folio/src/react.ts`
- `apps/demo/src/DemoApp.tsx`
- `apps/demo/src/styles.css`
- `tests/e2e/folio-demo.spec.ts`
- `turbo.json`

Task 1 stabilizes and commits that baseline before adding C1-specific block editing changes.

## File Structure

Create or modify these files:

```txt
packages/core/src/extensions/types.ts
packages/core/src/commands/defaultCommands.ts

packages/react/src/FolioEditor.tsx
packages/react/src/index.ts
packages/react/src/blocks/BlockControls.tsx
packages/react/src/blocks/BlockInteractionLayer.tsx
packages/react/src/blocks/BlockSideControls.tsx
packages/react/src/blocks/blockDom.ts
packages/react/src/menus/SlashMenu.tsx
packages/react/src/menus/slashMenuUtils.ts
packages/react/src/__tests__/FolioEditor.test.tsx

packages/styles/editor.css
packages/folio/src/react.ts
packages/folio/styles.css

apps/demo/src/DemoApp.tsx
apps/demo/src/styles.css
tests/e2e/folio-demo.spec.ts
turbo.json
```

Boundary rules:

- `packages/core` owns command metadata shape and default command data. It must not import React.
- `packages/react` owns DOM interaction, menu rendering, editor state, and React components.
- `packages/styles` owns reusable component CSS.
- `apps/demo` owns the demo layout and page-level Notion-like surface.
- `packages/folio` only forwards public-facing package types and runtime exports.

## Task 1: Stabilize Current Slash Command Baseline

**Files:**
- Modify: `packages/react/src/FolioEditor.tsx`
- Modify: `packages/react/src/menus/SlashMenu.tsx`
- Create: `packages/react/src/menus/slashMenuUtils.ts`
- Modify: `packages/styles/editor.css`
- Modify: `packages/folio/src/react.ts`
- Modify: `apps/demo/src/DemoApp.tsx`
- Modify: `apps/demo/src/styles.css`
- Modify: `tests/e2e/folio-demo.spec.ts`
- Modify: `turbo.json`

- [ ] **Step 1: Review current slash-command diff**

Run:

```bash
git diff -- packages/react/src/FolioEditor.tsx packages/react/src/menus/SlashMenu.tsx packages/react/src/menus/slashMenuUtils.ts packages/styles/editor.css packages/folio/src/react.ts apps/demo/src/DemoApp.tsx apps/demo/src/styles.css tests/e2e/folio-demo.spec.ts turbo.json
```

Expected: diff shows typed `/query` opening the menu, cursor-relative menu positioning, keyboard active item selection, query cleanup on command select, and e2e coverage for those behaviors.

- [ ] **Step 2: Verify the slash baseline**

Run:

```bash
pnpm --filter @futelab/folio build && pnpm test:e2e
```

Expected: Playwright reports `4 passed`, including:

```txt
slash commands open from editor input and filter typed query
slash command selection removes the typed query and applies the block
slash commands stay near the cursor and support editor keyboard selection
```

- [ ] **Step 3: Commit the slash baseline**

Run:

```bash
git add packages/react/src/FolioEditor.tsx \
  packages/react/src/menus/SlashMenu.tsx \
  packages/react/src/menus/slashMenuUtils.ts \
  packages/styles/editor.css \
  packages/folio/src/react.ts \
  apps/demo/src/DemoApp.tsx \
  apps/demo/src/styles.css \
  tests/e2e/folio-demo.spec.ts \
  turbo.json
git commit -m "fix: make slash commands follow editor context"
```

Expected: commit succeeds and `git status --short` no longer lists these slash-baseline files as modified.

## Task 2: Add Command Display Metadata

**Files:**
- Modify: `packages/core/src/extensions/types.ts`
- Modify: `packages/core/src/commands/defaultCommands.ts`
- Modify: `packages/react/src/__tests__/FolioEditor.test.tsx`
- Modify: `packages/folio/src/react.ts`

- [ ] **Step 1: Write a failing unit test for default command metadata**

Add this test in `packages/react/src/__tests__/FolioEditor.test.tsx` near the slash menu tests:

```tsx
import { createDefaultFolioCommands } from "@futelab/folio-core/browser";

it("provides grouped slash command display metadata", () => {
  const commands = createDefaultFolioCommands();
  const heading = commands.find((command) => command.name === "heading1");
  const image = commands.find((command) => command.name === "image");

  expect(heading).toMatchObject({
    group: "Basic",
    description: "Large section heading",
    icon: "Heading1",
  });
  expect(image).toMatchObject({
    group: "Media",
    description: "Embed an image by URL",
    icon: "Image",
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
pnpm --filter @futelab/folio-react test -- FolioEditor.test.tsx
```

Expected: FAIL because `group`, `description`, and `icon` do not exist on default commands yet.

- [ ] **Step 3: Extend command contribution types**

In `packages/core/src/extensions/types.ts`, replace `FolioCommandContribution` with:

```ts
export type FolioCommandGroup = "Basic" | "Lists" | "Media" | "Advanced";

export type FolioCommandIcon =
  | "Text"
  | "Heading1"
  | "Heading2"
  | "Heading3"
  | "List"
  | "ListOrdered"
  | "ListTodo"
  | "Quote"
  | "Code"
  | "Minus"
  | "Table"
  | "Image"
  | "Bookmark"
  | "PanelTop"
  | "ListTree";

export interface FolioCommandContribution {
  name: string;
  label: string;
  group?: FolioCommandGroup;
  description?: string;
  icon?: FolioCommandIcon;
  keywords?: string[];
  action: FolioCommandAction;
}
```

- [ ] **Step 4: Add metadata to default commands**

In `packages/core/src/commands/defaultCommands.ts`, update each command object with `group`, `description`, and `icon`. Use this metadata map:

```ts
const commandMetadata = {
  paragraph: {
    group: "Basic",
    description: "Start with plain text",
    icon: "Text",
  },
  heading1: {
    group: "Basic",
    description: "Large section heading",
    icon: "Heading1",
  },
  heading2: {
    group: "Basic",
    description: "Medium section heading",
    icon: "Heading2",
  },
  heading3: {
    group: "Basic",
    description: "Small section heading",
    icon: "Heading3",
  },
  bulletList: {
    group: "Lists",
    description: "Create a bulleted list",
    icon: "List",
  },
  orderedList: {
    group: "Lists",
    description: "Create a numbered list",
    icon: "ListOrdered",
  },
  todoList: {
    group: "Lists",
    description: "Track tasks with checkboxes",
    icon: "ListTodo",
  },
  quote: {
    group: "Advanced",
    description: "Capture a quote or excerpt",
    icon: "Quote",
  },
  callout: {
    group: "Advanced",
    description: "Highlight information in a callout",
    icon: "PanelTop",
  },
  divider: {
    group: "Advanced",
    description: "Add a horizontal divider",
    icon: "Minus",
  },
  codeBlock: {
    group: "Advanced",
    description: "Write code with formatting",
    icon: "Code",
  },
  table: {
    group: "Advanced",
    description: "Insert a simple table",
    icon: "Table",
  },
  image: {
    group: "Media",
    description: "Embed an image by URL",
    icon: "Image",
  },
  bookmark: {
    group: "Media",
    description: "Save a rich link bookmark",
    icon: "Bookmark",
  },
  toggle: {
    group: "Advanced",
    description: "Create a collapsible section",
    icon: "PanelTop",
  },
  toc: {
    group: "Advanced",
    description: "Insert a table of contents",
    icon: "ListTree",
  },
} satisfies Record<string, {
  group: NonNullable<FolioCommandContribution["group"]>;
  description: string;
  icon: NonNullable<FolioCommandContribution["icon"]>;
}>;
```

Apply metadata to each returned command with object spread:

```ts
{
  name: "heading1",
  label: "Heading 1",
  ...commandMetadata.heading1,
  keywords: ["h1", "title"],
  action: ({ editor }) =>
    runEditorChain(editor, (chain) => chain.toggleHeading({ level: 1 })),
}
```

- [ ] **Step 5: Update aggregator types**

In `packages/folio/src/react.ts`, import and expose the expanded command type through existing `FolioCommandContribution` references. No runtime code is required beyond keeping the type import:

```ts
import type {
  FolioCommandContribution,
  FolioDocument,
  FolioExtension,
} from "./core";
```

- [ ] **Step 6: Run the metadata test**

Run:

```bash
pnpm --filter @futelab/folio-react test -- FolioEditor.test.tsx
```

Expected: PASS for the new metadata test and existing editor tests.

- [ ] **Step 7: Commit command metadata**

Run:

```bash
git add packages/core/src/extensions/types.ts \
  packages/core/src/commands/defaultCommands.ts \
  packages/folio/src/react.ts \
  packages/react/src/__tests__/FolioEditor.test.tsx
git commit -m "feat: add block command display metadata"
```

Expected: commit succeeds.

## Task 3: Render a Rich Grouped Slash Menu

**Files:**
- Modify: `packages/react/src/menus/slashMenuUtils.ts`
- Modify: `packages/react/src/menus/SlashMenu.tsx`
- Modify: `packages/styles/editor.css`
- Modify: `packages/react/src/__tests__/FolioEditor.test.tsx`

- [ ] **Step 1: Write failing tests for grouped command menu rendering**

Add this test in `packages/react/src/__tests__/FolioEditor.test.tsx`:

```tsx
it("renders slash commands with groups, icons, descriptions, and active state", () => {
  const commands: FolioCommandContribution[] = [
    {
      name: "paragraph",
      label: "Text",
      group: "Basic",
      description: "Start with plain text",
      icon: "Text",
      action: () => true,
    },
    {
      name: "image",
      label: "Image",
      group: "Media",
      description: "Embed an image by URL",
      icon: "Image",
      action: () => true,
    },
  ];

  render(
    <SlashMenu
      activeIndex={1}
      commands={commands}
      editor={null}
      query="/"
    />,
  );

  expect(screen.getByText("Basic")).toBeInTheDocument();
  expect(screen.getByText("Media")).toBeInTheDocument();
  expect(screen.getByText("Start with plain text")).toBeInTheDocument();
  expect(screen.getByText("Embed an image by URL")).toBeInTheDocument();
  expect(screen.getByRole("menuitem", { name: /Image/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm --filter @futelab/folio-react test -- FolioEditor.test.tsx
```

Expected: FAIL because `SlashMenu` does not render groups, icons, or descriptions.

- [ ] **Step 3: Add grouping utilities**

Replace `packages/react/src/menus/slashMenuUtils.ts` with:

```ts
import type { FolioCommandContribution } from "@futelab/folio-core/browser";

export const slashMenuGroupOrder = ["Basic", "Lists", "Media", "Advanced"] as const;

export function normalizeSlashQuery(query: string): string {
  return query.replace(/^\//, "").trim().toLowerCase();
}

function getSearchTokens(value: string): string[] {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[\s_-]+/)
    .filter(Boolean);
}

function commandMatchesQuery(
  command: FolioCommandContribution,
  query: string,
): boolean {
  if (!query) return true;

  const searchableValues = [
    command.label,
    command.name,
    command.description ?? "",
    ...(command.keywords ?? []),
  ];

  return searchableValues.some((value) => {
    const normalizedValue = value.toLowerCase();

    return (
      normalizedValue.startsWith(query) ||
      getSearchTokens(value).some((token) => token.startsWith(query))
    );
  });
}

export function getSlashMenuCommands(
  commands: FolioCommandContribution[],
  query?: string,
): FolioCommandContribution[] {
  if (!query?.startsWith("/")) return [];

  const normalizedQuery = normalizeSlashQuery(query);

  return commands.filter((command) =>
    commandMatchesQuery(command, normalizedQuery),
  );
}

export function groupSlashMenuCommands(
  commands: FolioCommandContribution[],
): Array<{ group: string; commands: FolioCommandContribution[] }> {
  const grouped = new Map<string, FolioCommandContribution[]>();

  for (const command of commands) {
    const group = command.group ?? "Advanced";
    grouped.set(group, [...(grouped.get(group) ?? []), command]);
  }

  return slashMenuGroupOrder
    .filter((group) => grouped.has(group))
    .map((group) => ({ group, commands: grouped.get(group) ?? [] }));
}
```

- [ ] **Step 4: Render grouped rows in `SlashMenu`**

In `packages/react/src/menus/SlashMenu.tsx`:

1. Import lucide icons:

```ts
import {
  Bookmark,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Image,
  List,
  ListOrdered,
  ListTodo,
  ListTree,
  Minus,
  PanelTop,
  Quote,
  Table,
  Text,
} from "lucide-react";
```

2. Import grouping helper:

```ts
import { getSlashMenuCommands, groupSlashMenuCommands } from "./slashMenuUtils";
```

3. Add icon map above the component:

```tsx
const commandIcons = {
  Bookmark,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Image,
  List,
  ListOrdered,
  ListTodo,
  ListTree,
  Minus,
  PanelTop,
  Quote,
  Table,
  Text,
};
```

4. Inside the component, derive grouped commands:

```ts
const filteredCommands = getSlashMenuCommands(availableCommands, query);
const groupedCommands = groupSlashMenuCommands(filteredCommands);
```

5. Replace the button map with grouped rendering:

```tsx
{groupedCommands.map((group) => (
  <div className="folio-slash-menu__group" key={group.group}>
    <div className="folio-slash-menu__group-label">{group.group}</div>
    {group.commands.map((command) => {
      const index = filteredCommands.findIndex((item) => item.name === command.name);
      const isActive = index === activeIndex;
      const Icon = command.icon ? commandIcons[command.icon] : Text;

      return (
        <button
          aria-selected={isActive ? "true" : undefined}
          className="folio-slash-menu__item"
          data-active={isActive ? "true" : undefined}
          key={command.name}
          onClick={() => {
            if (onCommandSelect) {
              onCommandSelect(command);
              return;
            }

            command.action({ editor });
          }}
          onFocus={() => onActiveIndexChange?.(index)}
          onMouseEnter={() => onActiveIndexChange?.(index)}
          role="menuitem"
          type="button"
        >
          <span className="folio-slash-menu__item-icon">
            <Icon aria-hidden size={17} />
          </span>
          <span className="folio-slash-menu__item-copy">
            <span className="folio-slash-menu__item-label">{command.label}</span>
            {command.description ? (
              <span className="folio-slash-menu__item-description">
                {command.description}
              </span>
            ) : null}
          </span>
        </button>
      );
    })}
  </div>
))}
```

- [ ] **Step 5: Style grouped slash menu**

In `packages/styles/editor.css`, extend slash menu styles:

```css
.folio-slash-menu,
.folio-editor__slash-menu {
  gap: 0;
  padding: 6px;
}

.folio-slash-menu__group + .folio-slash-menu__group {
  border-top: 1px solid var(--folio-color-border);
  margin-top: 4px;
  padding-top: 4px;
}

.folio-slash-menu__group-label {
  color: var(--folio-color-subtle);
  font-size: 0.72rem;
  font-weight: 650;
  line-height: 1;
  padding: 7px 8px 5px;
  text-transform: uppercase;
}

.folio-slash-menu__item {
  gap: 0.65rem;
  min-height: 44px;
  padding: 6px 8px;
}

.folio-slash-menu__item-icon {
  align-items: center;
  background: var(--folio-color-surface);
  border-radius: var(--folio-radius-sm);
  color: var(--folio-color-muted);
  display: inline-flex;
  flex: 0 0 auto;
  height: 28px;
  justify-content: center;
  width: 28px;
}

.folio-slash-menu__item-copy {
  display: grid;
  gap: 1px;
  min-width: 0;
}

.folio-slash-menu__item-label {
  color: var(--folio-color-text);
  font-size: 0.92rem;
  line-height: 1.25;
}

.folio-slash-menu__item-description {
  color: var(--folio-color-muted);
  font-size: 0.78rem;
  line-height: 1.25;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

- [ ] **Step 6: Run tests**

Run:

```bash
pnpm --filter @futelab/folio-react test -- FolioEditor.test.tsx
pnpm --filter @futelab/folio build
```

Expected: tests and package build pass.

- [ ] **Step 7: Commit grouped command menu**

Run:

```bash
git add packages/react/src/menus/slashMenuUtils.ts \
  packages/react/src/menus/SlashMenu.tsx \
  packages/styles/editor.css \
  packages/folio/styles.css \
  packages/react/src/__tests__/FolioEditor.test.tsx
git commit -m "feat: render grouped block command menu"
```

Expected: commit succeeds.

## Task 4: Add Contextual Block Side Controls

**Files:**
- Create: `packages/react/src/blocks/blockDom.ts`
- Create: `packages/react/src/blocks/BlockSideControls.tsx`
- Create: `packages/react/src/blocks/BlockInteractionLayer.tsx`
- Modify: `packages/react/src/blocks/BlockControls.tsx`
- Modify: `packages/react/src/index.ts`
- Modify: `packages/react/src/FolioEditor.tsx`
- Modify: `packages/styles/editor.css`
- Modify: `packages/react/src/__tests__/FolioEditor.test.tsx`
- Modify: `tests/e2e/folio-demo.spec.ts`

- [ ] **Step 1: Write failing e2e for contextual block controls**

Add this test to `tests/e2e/folio-demo.spec.ts`:

```ts
test("block side controls appear on block hover and open the command menu", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "New page" }).click();

  const editor = page.getByRole("textbox").last();
  await editor.click();
  await page.keyboard.type("A block with controls");

  await expect(page.getByRole("button", { name: "Add block below" })).toHaveCount(0);

  await editor.getByText("A block with controls").hover();

  await expect(page.getByRole("button", { name: "Add block below" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Drag block" })).toBeVisible();

  await page.getByRole("button", { name: "Add block below" }).click();

  await expect(page.getByRole("menu", { name: "Slash commands" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: /Text/ })).toBeVisible();
});
```

- [ ] **Step 2: Run e2e to verify it fails**

Run:

```bash
pnpm test:e2e
```

Expected: FAIL because `Add block below` does not exist yet.

- [ ] **Step 3: Create DOM helpers**

Create `packages/react/src/blocks/blockDom.ts`:

```ts
import type { Editor } from "@tiptap/core";

export interface FolioBlockAnchor {
  element: HTMLElement;
  rect: DOMRect;
}

const blockSelector = [
  ".ProseMirror > p",
  ".ProseMirror > h1",
  ".ProseMirror > h2",
  ".ProseMirror > h3",
  ".ProseMirror > ul",
  ".ProseMirror > ol",
  ".ProseMirror > blockquote",
  ".ProseMirror > pre",
  ".ProseMirror > table",
  ".ProseMirror > details",
  '.ProseMirror > [data-type="details"]',
  ".ProseMirror > .folio-callout",
  ".ProseMirror > .folio-bookmark",
  ".ProseMirror > .folio-image",
].join(",");

export function findBlockElement(
  target: EventTarget | null,
  root: HTMLElement | null,
): HTMLElement | null {
  if (!(target instanceof HTMLElement) || !root) return null;

  const candidate = target.closest<HTMLElement>(blockSelector);

  return candidate && root.contains(candidate) ? candidate : null;
}

export function getCurrentBlockElement(
  editor: Editor | null,
): HTMLElement | null {
  if (!editor) return null;

  const { from } = editor.state.selection;
  const domAtPos = editor.view.domAtPos(from);
  const node =
    domAtPos.node instanceof HTMLElement
      ? domAtPos.node
      : domAtPos.node.parentElement;

  if (!node) return null;

  return node.closest<HTMLElement>(blockSelector);
}

export function getBlockAnchor(
  element: HTMLElement | null,
): FolioBlockAnchor | null {
  if (!element) return null;

  return {
    element,
    rect: element.getBoundingClientRect(),
  };
}
```

- [ ] **Step 4: Create `BlockSideControls`**

Create `packages/react/src/blocks/BlockSideControls.tsx`:

```tsx
import type { CSSProperties } from "react";
import { GripVertical, Plus } from "lucide-react";

export interface BlockSideControlsProps {
  className?: string;
  style?: CSSProperties;
  visible: boolean;
  onAddBlock: () => void;
}

export function BlockSideControls({
  className,
  style,
  visible,
  onAddBlock,
}: BlockSideControlsProps) {
  if (!visible) return null;

  return (
    <div
      className={className ?? "folio-block-side-controls"}
      data-testid="folio-block-side-controls"
      style={style}
    >
      <button
        aria-label="Add block below"
        className="folio-block-side-controls__button"
        onClick={onAddBlock}
        title="Add block below"
        type="button"
      >
        <Plus aria-hidden size={16} />
      </button>
      <button
        aria-label="Drag block"
        className="folio-block-side-controls__button"
        title="Drag block"
        type="button"
      >
        <GripVertical aria-hidden size={16} />
      </button>
    </div>
  );
}
```

- [ ] **Step 5: Create `BlockInteractionLayer`**

Create `packages/react/src/blocks/BlockInteractionLayer.tsx`:

```tsx
import { useMemo } from "react";
import type { CSSProperties } from "react";
import { getBlockAnchor } from "./blockDom";
import { BlockSideControls } from "./BlockSideControls";

export interface BlockInteractionLayerProps {
  activeBlock: HTMLElement | null;
  editorRoot: HTMLElement | null;
  className?: string;
  onOpenBlockMenu: () => void;
}

function getControlStyle(
  blockElement: HTMLElement | null,
  editorRoot: HTMLElement | null,
): CSSProperties | undefined {
  const anchor = getBlockAnchor(blockElement);
  if (!anchor || !editorRoot) return undefined;

  const rootRect = editorRoot.getBoundingClientRect();

  return {
    top: anchor.rect.top - rootRect.top - 2,
  };
}

export function BlockInteractionLayer({
  activeBlock,
  editorRoot,
  className,
  onOpenBlockMenu,
}: BlockInteractionLayerProps) {
  const style = useMemo(
    () => getControlStyle(activeBlock, editorRoot),
    [activeBlock, editorRoot],
  );

  return (
    <div className={className ?? "folio-block-interaction-layer"}>
      <BlockSideControls
        onAddBlock={onOpenBlockMenu}
        style={style}
        visible={Boolean(style)}
      />
    </div>
  );
}
```

- [ ] **Step 6: Integrate the layer into `FolioEditor`**

In `packages/react/src/FolioEditor.tsx`:

1. Import the layer and block DOM helpers:

```ts
import type { KeyboardEvent, MouseEvent } from "react";
import { BlockInteractionLayer } from "./blocks/BlockInteractionLayer";
import { findBlockElement, getCurrentBlockElement } from "./blocks/blockDom";
```

2. Add menu and active-block state:

```ts
const [blockMenuOpen, setBlockMenuOpen] = useState(false);
const [hoveredBlock, setHoveredBlock] = useState<HTMLElement | null>(null);
const [focusedBlock, setFocusedBlock] = useState<HTMLElement | null>(null);
```

3. Sync the focused block from editor selection changes:

```ts
useEffect(() => {
  if (!editor) return undefined;

  const syncFocusedBlock = () => {
    setFocusedBlock(getCurrentBlockElement(editor));
  };

  editor.on("selectionUpdate", syncFocusedBlock);
  editor.on("focus", syncFocusedBlock);
  editor.on("update", syncFocusedBlock);

  return () => {
    editor.off("selectionUpdate", syncFocusedBlock);
    editor.off("focus", syncFocusedBlock);
    editor.off("update", syncFocusedBlock);
  };
}, [editor]);
```

4. Track hover on the editor root, not on the pointer-transparent overlay:

```ts
const activeBlock = hoveredBlock ?? focusedBlock;

const handleEditorMouseMove = useCallback(
  (event: MouseEvent<HTMLDivElement>) => {
    setHoveredBlock(findBlockElement(event.target, rootRef.current));
  },
  [],
);

const handleEditorMouseLeave = useCallback(() => {
  setHoveredBlock(null);
}, []);
```

Attach both handlers to the root editor container that already owns `rootRef`:

```tsx
<div
  className={classNames("folio-editor", props.className, props.classNames?.root)}
  data-testid="folio-editor"
  onKeyDownCapture={handleKeyDownCapture}
  onMouseLeave={handleEditorMouseLeave}
  onMouseMove={handleEditorMouseMove}
  ref={rootRef}
>
```

5. Change menu visibility so slash query or block menu opens the same menu:

```ts
const activeMenuQuery = slashQuery ?? (blockMenuOpen ? "/" : undefined);
const filteredSlashCommands = useMemo(
  () => getSlashMenuCommands(slashCommands, activeMenuQuery),
  [slashCommands, activeMenuQuery],
);
```

6. Add open handler:

```ts
const handleOpenBlockMenu = useCallback(() => {
  setBlockMenuOpen(true);
  setSlashQuery("/");
  setSlashMenuStyle(getSlashMenuPosition(editor, rootRef.current));
  setActiveSlashCommandIndex(0);
}, [editor]);
```

7. Clear both slash and plus menu state when closing:

```ts
setSlashQuery(undefined);
setSlashMenuStyle(undefined);
setBlockMenuOpen(false);
setActiveSlashCommandIndex(0);
```

8. Render the block layer before `EditorContent`:

```tsx
<BlockInteractionLayer
  activeBlock={activeBlock}
  editorRoot={rootRef.current}
  onOpenBlockMenu={handleOpenBlockMenu}
/>
```

9. Pass `activeMenuQuery` to `SlashMenu`:

```tsx
<SlashMenu
  activeIndex={activeSlashCommandIndexForMenu}
  commands={slashCommands}
  editor={editor}
  onActiveIndexChange={setActiveSlashCommandIndex}
  onCommandSelect={handleSlashCommandSelect}
  query={activeMenuQuery}
  style={slashMenuStyle}
/>
```

- [ ] **Step 7: Export block controls**

In `packages/react/src/index.ts`, add:

```ts
export * from "./blocks/BlockInteractionLayer";
export * from "./blocks/BlockSideControls";
```

- [ ] **Step 8: Style block side controls**

Add to `packages/styles/editor.css`:

```css
.folio-block-interaction-layer {
  inset: 0;
  pointer-events: none;
  position: absolute;
  z-index: 15;
}

.folio-block-side-controls {
  display: inline-flex;
  gap: 1px;
  left: -44px;
  pointer-events: auto;
  position: absolute;
}

.folio-block-side-controls__button {
  align-items: center;
  appearance: none;
  background: transparent;
  border: 0;
  border-radius: var(--folio-radius-sm);
  color: var(--folio-color-subtle);
  cursor: pointer;
  display: inline-flex;
  height: 24px;
  justify-content: center;
  padding: 0;
  width: 24px;
}

.folio-block-side-controls__button:hover,
.folio-block-side-controls__button:focus-visible {
  background: var(--folio-color-hover);
  color: var(--folio-color-text);
  outline: none;
}
```

- [ ] **Step 9: Remove always-visible legacy block controls**

In `packages/react/src/FolioEditor.tsx`, remove the existing always-visible `BlockControls` render. Keep the `BlockControls` export for compatibility, but the default editor should now use contextual controls only.

- [ ] **Step 10: Run e2e**

Run:

```bash
pnpm --filter @futelab/folio build && pnpm test:e2e
```

Expected: the new block side controls e2e passes and all existing e2e tests pass.

- [ ] **Step 11: Commit contextual block controls**

Run:

```bash
git add packages/react/src/blocks/blockDom.ts \
  packages/react/src/blocks/BlockInteractionLayer.tsx \
  packages/react/src/blocks/BlockSideControls.tsx \
  packages/react/src/blocks/BlockControls.tsx \
  packages/react/src/FolioEditor.tsx \
  packages/react/src/index.ts \
  packages/styles/editor.css \
  packages/folio/styles.css \
  packages/react/src/__tests__/FolioEditor.test.tsx \
  tests/e2e/folio-demo.spec.ts
git commit -m "feat: add contextual block side controls"
```

Expected: commit succeeds.

## Task 5: Polish the Demo Into a Document-First Surface

**Files:**
- Modify: `apps/demo/src/DemoApp.tsx`
- Modify: `apps/demo/src/styles.css`
- Modify: `tests/e2e/folio-demo.spec.ts`

- [ ] **Step 1: Write failing e2e for document-first layout**

Add this test in `tests/e2e/folio-demo.spec.ts`:

```ts
test("blank page uses a document-first surface with preview collapsed", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "New page" }).click();

  await expect(page.getByRole("complementary", { name: "Preview" })).toHaveCount(0);
  await expect(page.getByPlaceholder("Untitled")).toBeVisible();
  await expect(page.getByText("Type '/' for commands")).toBeVisible();

  const editor = page.getByTestId("folio-editor");
  await expect(editor).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
});
```

- [ ] **Step 2: Run e2e to verify it fails**

Run:

```bash
pnpm test:e2e
```

Expected: FAIL because preview is visible by default and editor background is not transparent.

- [ ] **Step 3: Collapse preview by default**

In `apps/demo/src/DemoApp.tsx`, change:

```ts
const [showPreview, setShowPreview] = useState(true);
```

to:

```ts
const [showPreview, setShowPreview] = useState(false);
```

- [ ] **Step 4: Add title placeholder**

In the page title input, add:

```tsx
placeholder="Untitled"
```

The resulting title input should be:

```tsx
<input
  aria-label="Page title"
  className="folio-demo__title"
  onChange={(event) =>
    setPages((currentPages) =>
      updatePageTitle(currentPages, selectedPage.id, event.target.value),
    )
  }
  placeholder="Untitled"
  value={selectedPage.title}
/>
```

- [ ] **Step 5: Make blank page placeholder visible**

Ensure `FolioEditor` in the demo uses:

```tsx
placeholder="Type '/' for commands"
```

- [ ] **Step 6: Replace warm card styling with document styling**

In `apps/demo/src/styles.css`, adjust these rules:

```css
.folio-demo {
  background: #fbfbfa;
  color: #2f2f2c;
  display: grid;
  grid-template-columns: 248px minmax(0, 1fr);
  min-height: 100vh;
}

.folio-demo:has(.folio-demo__preview) {
  grid-template-columns: 248px minmax(0, 1fr) minmax(340px, 29vw);
}

.folio-demo__sidebar {
  background: #f7f7f5;
  border-right: 1px solid #e6e4df;
}

.folio-demo__document {
  margin: 0 auto;
  max-width: 780px;
  min-width: 0;
  padding: clamp(4rem, 7vw, 6rem) clamp(1.5rem, 4vw, 3rem) 6rem;
  width: 100%;
}

.folio-demo__title {
  display: block;
  font-size: clamp(2.25rem, 5vw, 3rem);
  font-weight: 700;
  letter-spacing: 0;
  line-height: 1.12;
  margin: 0 0 1.25rem;
}

.folio-demo__title::placeholder {
  color: #b7b3ad;
}

.folio-demo__document .folio-editor {
  background: transparent;
  min-height: 58vh;
}

.folio-demo__document .folio-editor__content {
  min-height: 42vh;
}
```

- [ ] **Step 7: Keep preview available but secondary**

In the preview toolbar button, keep `aria-pressed={showPreview}` and `title="Preview"`. The preview should render only when `showPreview` is true:

```tsx
{showPreview ? (
  <aside aria-label="Preview" className="folio-demo__preview">
    <FolioReader value={selectedPage.document} />
  </aside>
) : null}
```

- [ ] **Step 8: Run e2e**

Run:

```bash
pnpm --filter @futelab/folio build && pnpm test:e2e
```

Expected: document-first layout test passes.

- [ ] **Step 9: Commit demo surface polish**

Run:

```bash
git add apps/demo/src/DemoApp.tsx apps/demo/src/styles.css tests/e2e/folio-demo.spec.ts
git commit -m "feat: polish demo document surface"
```

Expected: commit succeeds.

## Task 6: Make Toolbar Behavior Less Prominent

**Files:**
- Modify: `packages/react/src/FolioEditor.tsx`
- Modify: `packages/react/src/menus/BubbleToolbar.tsx`
- Modify: `packages/styles/editor.css`
- Modify: `tests/e2e/folio-demo.spec.ts`

- [ ] **Step 1: Write failing e2e that formatting toolbar is absent on a blank page**

Add to `tests/e2e/folio-demo.spec.ts`:

```ts
test("formatting toolbar does not dominate blank pages", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "New page" }).click();

  await expect(page.getByRole("toolbar", { name: "Text formatting" })).toHaveCount(0);

  const editor = page.getByRole("textbox").last();
  await editor.click();
  await page.keyboard.type("Select me");
  await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");

  await expect(page.getByRole("toolbar", { name: "Text formatting" })).toBeVisible();
});
```

- [ ] **Step 2: Run e2e to verify it fails**

Run:

```bash
pnpm test:e2e
```

Expected: FAIL because the toolbar is always rendered.

- [ ] **Step 3: Track text selection in `FolioEditor`**

In `packages/react/src/FolioEditor.tsx`, add state:

```ts
const [hasTextSelection, setHasTextSelection] = useState(false);
```

Inside the editor effect, update selection tracking:

```ts
const syncSelectionState = () => {
  const selection = editor.state.selection;
  setHasTextSelection(!selection.empty);
};

editor.on("selectionUpdate", syncSelectionState);
editor.on("transaction", syncSelectionState);
```

Clean up in the same effect:

```ts
editor.off("selectionUpdate", syncSelectionState);
editor.off("transaction", syncSelectionState);
```

- [ ] **Step 4: Render `BubbleToolbar` only for non-empty selections**

In `FolioEditor.tsx`, wrap:

```tsx
{hasTextSelection ? (
  <BubbleToolbar
    className={classNames(
      "folio-editor__bubble-toolbar",
      props.classNames?.bubbleToolbar,
    )}
    editor={editor}
  />
) : null}
```

- [ ] **Step 5: Keep unit test aligned**

Update the existing unit test named `renders the text formatting bubble toolbar` to use an initial selection harness instead of expecting it on an empty editor. Use this replacement test:

```tsx
it("hides the text formatting toolbar until text is selected", () => {
  render(<FolioEditor value={documentWithText("Selectable")} onChange={vi.fn()} />);

  expect(
    screen.queryByRole("toolbar", { name: "Text formatting" }),
  ).not.toBeInTheDocument();
});
```

- [ ] **Step 6: Run tests**

Run:

```bash
pnpm --filter @futelab/folio-react test -- FolioEditor.test.tsx
pnpm --filter @futelab/folio build && pnpm test:e2e
```

Expected: unit and e2e tests pass.

- [ ] **Step 7: Commit toolbar behavior**

Run:

```bash
git add packages/react/src/FolioEditor.tsx \
  packages/react/src/menus/BubbleToolbar.tsx \
  packages/styles/editor.css \
  packages/folio/styles.css \
  packages/react/src/__tests__/FolioEditor.test.tsx \
  tests/e2e/folio-demo.spec.ts
git commit -m "feat: show formatting toolbar only for selection"
```

Expected: commit succeeds.

## Task 7: Package Exports and Build Cache Check

**Files:**
- Modify: `packages/folio/src/react.ts`
- Modify: `turbo.json`

- [ ] **Step 1: Verify public type forwarding**

In `packages/folio/src/react.ts`, expose props for new React components:

```ts
export interface BlockInteractionLayerProps {
  activeBlock: HTMLElement | null;
  editorRoot: HTMLElement | null;
  className?: string;
  onOpenBlockMenu: () => void;
}

export const BlockInteractionLayer = InternalBlockInteractionLayer as (
  props: BlockInteractionLayerProps,
) => ReactElement | null;

export interface BlockSideControlsProps {
  className?: string;
  style?: CSSProperties;
  visible: boolean;
  onAddBlock: () => void;
}

export const BlockSideControls = InternalBlockSideControls as (
  props: BlockSideControlsProps,
) => ReactElement | null;
```

Add `InternalBlockSideControls` to the import list from `../../react/src`:

```ts
BlockInteractionLayer as InternalBlockInteractionLayer,
BlockSideControls as InternalBlockSideControls,
```

- [ ] **Step 2: Ensure Turborepo rebuilds public package when React sources change**

In `turbo.json`, keep `@futelab/folio#build.inputs` as:

```json
"inputs": [
  "$TURBO_DEFAULT$",
  "$TURBO_ROOT$/packages/core/src/**/*",
  "$TURBO_ROOT$/packages/react/src/**/*",
  "$TURBO_ROOT$/packages/styles/**/*.css"
]
```

- [ ] **Step 3: Run package build**

Run:

```bash
pnpm build
```

Expected: build exits 0. Vite/Storybook chunk-size warnings are acceptable; TypeScript errors are not acceptable.

- [ ] **Step 4: Commit export/cache check**

Run:

```bash
git add packages/folio/src/react.ts turbo.json
git commit -m "chore: expose block controls through folio package"
```

Expected: commit succeeds if files changed. If `git diff --cached --quiet` exits 0, skip this commit.

## Task 8: Final Verification and Visual QA

**Files:**
- Test only; no planned source edits.

- [ ] **Step 1: Run full verification**

Run:

```bash
pnpm typecheck
pnpm test
pnpm lint
pnpm build
pnpm test:e2e
```

Expected:

- `pnpm typecheck`: all Turbo tasks successful.
- `pnpm test`: all Vitest/package test tasks successful.
- `pnpm lint`: exits 0.
- `pnpm build`: exits 0; chunk-size warnings are acceptable.
- `pnpm test:e2e`: all Playwright tests pass.

- [ ] **Step 2: Capture visual QA screenshot**

Run:

```bash
pnpm exec node <<'NODE'
const { chromium } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 920 } });
  await page.goto('http://127.0.0.1:55399/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: 'New page' }).click();
  const editor = page.getByRole('textbox').last();
  await editor.click();
  await page.keyboard.type('/he');
  await page.screenshot({
    path: '/tmp/folio-c1-notion-like-editor.png',
    fullPage: true,
  });
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
NODE
```

Expected: screenshot exists at `/tmp/folio-c1-notion-like-editor.png` and shows:

- Preview collapsed.
- No large white editor card.
- Inline placeholder or typed `/he` near the first block.
- Slash menu near cursor.
- Sidebar remains usable.

- [ ] **Step 3: Check package bump status**

Run:

```bash
pnpm changeset status
```

Expected: `@futelab/folio` remains listed for the existing minor bump.

- [ ] **Step 4: Commit final verification note only if source changed**

Run:

```bash
git status --short
```

Expected: no uncommitted source changes. If verification generated no tracked changes, do not create a commit.

## Execution Order

Implement tasks in order:

1. Stabilize slash baseline.
2. Add command metadata.
3. Render grouped command menu.
4. Add contextual block side controls.
5. Polish demo document surface.
6. Make formatting toolbar selection-driven.
7. Check exports and build cache.
8. Run final verification and visual QA.

Every task should end with either a commit or a verified no-op commit skip.
