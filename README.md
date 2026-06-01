# Folio

[简体中文](./README.ZH-CN.md)

Folio is a React component library for building Notion-like rich text editing
and reading experiences. It is JSON-first, powered by Tiptap, and packaged as
`@futelab/folio` for reuse across product apps that need document editing,
preview, publishing, or read-only rendering.

The package is currently in alpha. The public API is usable, but expect small
breaking changes while the editor interaction model and extension surface are
still being refined.

## Features

- Composed React editor with a Notion-like writing surface.
- Slash command menu opened by typing `/`.
- Block side controls for opening block commands from the current row.
- Floating text formatting toolbar for selected text.
- Table controls for adding rows and columns in place.
- Reader component that renders saved Folio JSON without mounting an editor.
- JSON document helpers, default Tiptap extensions, default block commands, and
  HTML/Markdown serialization utilities.
- One CSS entry point with theme variables and class hooks.

## Installation

```bash
pnpm add @futelab/folio react react-dom
```

React and React DOM are peer dependencies. Folio supports React 18 and newer.

Import the package stylesheet once in your application entry:

```ts
import "@futelab/folio/styles.css";
```

For example, in a Vite app this usually goes in `src/main.tsx`. In a Next.js
App Router project, import it from `app/layout.tsx` or another global stylesheet
entry.

## Quick Start

```tsx
import { useState } from "react";
import "@futelab/folio/styles.css";
import { createEmptyFolioDocument } from "@futelab/folio/core";
import type { FolioDocument } from "@futelab/folio/core";
import { FolioEditor, FolioReader } from "@futelab/folio/react";

export function ArticleEditor() {
  const [document, setDocument] = useState<FolioDocument>(() =>
    createEmptyFolioDocument(),
  );

  return (
    <div className="article-editor">
      <FolioEditor
        value={document}
        onChange={setDocument}
        placeholder="Type '/' for commands"
      />

      <aside>
        <FolioReader value={document} />
      </aside>
    </div>
  );
}
```

The editor emits a `FolioDocument`, which is Tiptap-compatible JSON. Store this
JSON in your database or local state. Use HTML or Markdown only when importing,
exporting, or rendering into another system.

## Client Rendering

`FolioEditor` is an interactive browser component. In Next.js App Router, put it
inside a client component:

```tsx
"use client";

import { useState } from "react";
import { createEmptyFolioDocument } from "@futelab/folio/core";
import type { FolioDocument } from "@futelab/folio/core";
import { FolioEditor } from "@futelab/folio/react";

export function ClientEditor() {
  const [value, setValue] = useState<FolioDocument>(() =>
    createEmptyFolioDocument(),
  );

  return <FolioEditor value={value} onChange={setValue} />;
}
```

`FolioReader` is the right component for read-only document pages because it
renders regular React elements instead of a ProseMirror editor.

## Editor Usage

### Controlled Editor

Use `value` and `onChange` when your app owns the document state.

```tsx
import type { FolioDocument } from "@futelab/folio/core";
import { FolioEditor } from "@futelab/folio/react";

interface Props {
  value: FolioDocument;
  onSaveDraft: (value: FolioDocument) => void;
}

export function ControlledFolioEditor({ value, onSaveDraft }: Props) {
  return (
    <FolioEditor
      value={value}
      onChange={onSaveDraft}
      placeholder="Write something..."
    />
  );
}
```

This is the recommended mode for product forms, autosave flows, collaborative
state, and editor + preview layouts.

### Uncontrolled Editor

Use `defaultValue` when you only need an initial document and want to receive
changes without feeding the value back into the editor every render.

```tsx
import {
  createEmptyFolioDocument,
  type FolioDocument,
} from "@futelab/folio/core";
import { FolioEditor } from "@futelab/folio/react";

export function DraftEditor() {
  function handleChange(nextDocument: FolioDocument) {
    window.localStorage.setItem("draft", JSON.stringify(nextDocument));
  }

  return (
    <FolioEditor
      defaultValue={createEmptyFolioDocument()}
      onChange={handleChange}
    />
  );
}
```

### Read-only Editor

Set `editable={false}` if you need the editor layout but want to disable edits:

```tsx
<FolioEditor value={document} editable={false} />
```

For publishing and static previews, prefer `FolioReader`.

## Reader Usage

```tsx
import type { FolioDocument } from "@futelab/folio/core";
import { FolioReader } from "@futelab/folio/react";

export function PublishedArticle({ document }: { document: FolioDocument }) {
  return <FolioReader className="article-body" value={document} />;
}
```

`FolioReader` supports the default Folio document nodes, including paragraphs,
headings, lists, task lists, blockquotes, code blocks, images, tables, toggles,
callouts, bookmarks, mentions, and table of contents blocks.

The reader sanitizes link and image URLs before rendering. Links allow `http:`,
`https:`, `mailto:`, `tel:`, and safe relative URLs. Images allow `http:`,
`https:`, safe relative URLs, and base64 data image URLs.

## Saving and Loading Documents

Folio documents are plain JSON. A typical save flow looks like this:

```tsx
import { useEffect, useState } from "react";
import {
  createEmptyFolioDocument,
  isFolioDocument,
  type FolioDocument,
} from "@futelab/folio/core";
import { FolioEditor } from "@futelab/folio/react";

const STORAGE_KEY = "my-app.article";

function loadDocument(): FolioDocument {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : undefined;

    return isFolioDocument(parsed) ? parsed : createEmptyFolioDocument();
  } catch {
    return createEmptyFolioDocument();
  }
}

export function LocalDraft() {
  const [document, setDocument] = useState<FolioDocument>(loadDocument);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(document));
  }, [document]);

  return <FolioEditor value={document} onChange={setDocument} />;
}
```

For server persistence, store the same JSON in a JSON/JSONB column or a document
blob. In production apps, debounce or batch `onChange` before calling your API.

## Document Model

The core type is `FolioDocument`:

```ts
import type { FolioDocument } from "@futelab/folio/core";

const document: FolioDocument = {
  type: "doc",
  content: [
    {
      type: "heading",
      attrs: { level: 1 },
      content: [{ type: "text", text: "Product notes" }],
    },
    {
      type: "paragraph",
      content: [{ type: "text", text: "Write with Folio." }],
    },
  ],
};
```

Useful helpers:

```ts
import {
  createEmptyFolioDocument,
  isFolioDocument,
  sampleFolioDocument,
} from "@futelab/folio/core";
```

- `createEmptyFolioDocument()` creates an empty document.
- `isFolioDocument(value)` checks whether a parsed value is a Folio document.
- `sampleFolioDocument` is a small fixture for tests, stories, or demos.

## Built-in Interactions

`FolioEditor` ships with these interactions:

- Type `/` in an empty or active text block to open slash commands.
- Use `ArrowUp`, `ArrowDown`, `Home`, `End`, `Enter`, and `Escape` in the slash
  menu.
- Hover a block to show side controls. The `+` button opens the block command
  menu for that row.
- Select text to show the floating formatting toolbar.
- Hover or focus a table to show table controls. The right `+` adds a column,
  and the bottom `+` adds a row.

Default slash commands:

- Text
- Heading 1, Heading 2, Heading 3
- Bulleted list, numbered list, todo list
- Quote
- Callout
- Divider
- Code block
- Table
- Image
- Bookmark
- Toggle
- Table of contents

Media commands are intentionally basic in the alpha. For production image and
bookmark workflows, applications usually provide their own picker, upload, or
metadata resolution UI.

## Serialization

Import serialization helpers from the explicit subpath:

```ts
import {
  fromHTML,
  fromMarkdown,
  toHTML,
  toMarkdown,
} from "@futelab/folio/serialization";
```

### HTML

```ts
const html = toHTML(document);
const parsedDocument = fromHTML("<h1>Hello</h1><p>World</p>");
```

HTML serialization uses the default Folio/Tiptap schema.

### Markdown

```ts
const markdown = toMarkdown(document);
const parsedDocument = fromMarkdown("# Hello");
```

Markdown is intentionally lossless. `toMarkdown` supports the subset that can be
represented without losing data: paragraphs, headings, lists, task lists,
blockquotes, horizontal rules, code blocks, hard breaks, images without
captions, and common text marks. It throws `FolioMarkdownSerializationError`
when a document contains unsupported or lossy nodes such as tables, callouts,
bookmarks, toggles, or table of contents blocks.

## Styling and Theming

Import the default stylesheet:

```ts
import "@futelab/folio/styles.css";
```

The stylesheet defines editor styles, reader styles, menu styles, and CSS custom
properties. Override variables globally or in a wrapper:

```css
.my-folio-scope {
  --folio-color-bg: #ffffff;
  --folio-color-text: #1f2328;
  --folio-color-muted: #6b7280;
  --folio-color-border: #d8dee4;
  --folio-color-hover: #f6f8fa;
  --folio-color-selected: #ddf4ff;
  --folio-color-accent: #0969da;
  --folio-font-family: Inter, ui-sans-serif, system-ui, sans-serif;
}
```

Then scope the editor or reader:

```tsx
<div className="my-folio-scope">
  <FolioEditor value={document} onChange={setDocument} />
</div>
```

You can also attach custom class names to specific editor surfaces:

```tsx
<FolioEditor
  className="article-editor"
  classNames={{
    root: "article-editor__root",
    content: "article-editor__content",
    blockControls: "article-editor__block-controls",
    bubbleToolbar: "article-editor__toolbar",
    slashMenu: "article-editor__commands",
  }}
  value={document}
  onChange={setDocument}
/>
```

## API Reference

### Package Entry Points

| Entry point | Purpose |
| --- | --- |
| `@futelab/folio` | Combined public exports. Useful for small apps, but subpaths are clearer. |
| `@futelab/folio/react` | React components and hooks. |
| `@futelab/folio/core` | Document types, default extensions, default commands, and core helpers. |
| `@futelab/folio/serialization` | HTML and Markdown import/export helpers. |
| `@futelab/folio/styles.css` | Default editor and reader styles. |

### `FolioEditor`

```tsx
import { FolioEditor } from "@futelab/folio/react";
```

| Prop | Type | Description |
| --- | --- | --- |
| `value` | `FolioDocument` | Controlled document value. |
| `defaultValue` | `FolioDocument` | Initial document for uncontrolled usage. |
| `onChange` | `(value: FolioDocument) => void` | Called after editor updates. |
| `editable` | `boolean` | Enables or disables editing. Defaults to `true`. |
| `extensions` | `FolioExtension[]` | Adds Tiptap extensions to the default editor schema. |
| `placeholder` | `string` | Placeholder text for empty blocks. |
| `className` | `string` | Additional class for the editor root. |
| `classNames` | `FolioEditorClassNames` | Class hooks for root, content, block controls, bubble toolbar, and slash menu. |
| `initialSlashQuery` | `string` | Opens the slash menu with an initial query. Mostly useful for demos and tests. |

### `FolioReader`

```tsx
import { FolioReader } from "@futelab/folio/react";
```

| Prop | Type | Description |
| --- | --- | --- |
| `value` | `FolioDocument` | Document to render. |
| `className` | `string` | Additional class for the reader root. |
| `classNames.root` | `string` | Additional root class hook. |

### `useFolioEditor`

Use the hook when you need to compose your own editor shell with lower-level
Tiptap or Folio UI pieces.

```tsx
import { EditorContent } from "@tiptap/react";
import { useFolioEditor } from "@futelab/folio/react";

export function CustomEditorShell() {
  const editor = useFolioEditor({
    placeholder: "Write...",
  });

  return <EditorContent editor={editor} />;
}
```

The hook accepts the same state-related options as `FolioEditor`: `value`,
`defaultValue`, `onChange`, `editable`, `extensions`, and `placeholder`.

### Core Helpers

```ts
import {
  createDefaultFolioCommands,
  createDefaultTiptapExtensions,
  createEmptyFolioDocument,
  createFolioExtension,
  createFolioExtensionRegistry,
  isFolioDocument,
} from "@futelab/folio/core";
```

Use these helpers when building custom editor shells, validating loaded JSON,
or creating extension metadata.

## Extensions

Folio extensions can add Tiptap extensions to the default editor setup:

```tsx
import { Extension } from "@tiptap/core";
import { createFolioExtension } from "@futelab/folio/core";
import type { FolioDocument } from "@futelab/folio/core";
import { FolioEditor } from "@futelab/folio/react";

const WordCountExtension = Extension.create({
  name: "wordCount",
});

const wordCount = createFolioExtension({
  name: "word-count",
  tiptapExtensions: [WordCountExtension],
});

export function EditorWithExtensions({
  document,
  setDocument,
}: {
  document: FolioDocument;
  setDocument: (value: FolioDocument) => void;
}) {
  return (
    <FolioEditor
      extensions={[wordCount]}
      value={document}
      onChange={setDocument}
    />
  );
}
```

The current alpha focuses on schema and interaction primitives. If you need a
fully custom slash command menu, compose a custom shell with `useFolioEditor`,
`SlashMenu`, and your own command list.

## Local Development

This repository uses pnpm, Turborepo, and Changesets.

```bash
pnpm install
pnpm demo
```

The demo runs at:

```text
http://127.0.0.1:55399/
```

Common commands:

```bash
pnpm typecheck
pnpm test
pnpm lint
pnpm build
pnpm test:e2e
pnpm changeset
```

To build only the publishable package:

```bash
pnpm --filter @futelab/folio build
```

## Recommended Production Pattern

For most apps:

1. Import `@futelab/folio/styles.css` once.
2. Keep `FolioDocument` as the canonical saved value.
3. Use `FolioEditor` in controlled mode for authoring.
4. Debounce `onChange` before autosaving.
5. Use `FolioReader` for previews and published pages.
6. Convert to HTML or Markdown only at import/export boundaries.
