# Folio

[简体中文](./README.ZH-CN.md) · [Live demo](https://futelab.github.io/folio/) · [Release guide](./docs/RELEASING.md)

Folio is a React document editor and reader built on Tiptap. The public package is `@futelab/folio`; documents use Tiptap-compatible JSON. MIT licensed.

## Features

- Paragraphs, H1–H3, nested lists and tasks, quotes, dividers, code, resizable tables, images with captions, bookmarks, callouts, toggles, mentions and a table of contents.
- Searchable slash commands, selection formatting, block insertion, drag ordering and keyboard alternatives.
- Image URL and upload flows, editable media metadata, links, mention candidates and table management.
- Transaction-level read-only mode, controlled/uncontrolled state and isolated document histories.
- React reader with extension renderers, server rendering, stable heading anchors and bounded rendering.
- Validated/versioned JSON persistence; HTML and Markdown import/export with explicit errors before content loss.
- English and Simplified Chinese, per-instance translations and CSS-variable themes.

## Install

```sh
pnpm add @futelab/folio react react-dom
```

React 18.3 and 19 are covered by packed-consumer tests. Development and CI use Node 24 and the pnpm version in `package.json`.

```tsx
"use client";
import { useState } from "react";
import "@futelab/folio/styles.css";
import { createEmptyFolioDocument } from "@futelab/folio/core";
import { FolioEditor, FolioReader } from "@futelab/folio/react";

export function Article() {
  const [document, setDocument] = useState(createEmptyFolioDocument);
  return (
    <>
      <FolioEditor documentId="article-42" value={document} onChange={setDocument} />
      <FolioReader value={document} />
    </>
  );
}
```

## Package entry points

| Entry                          | Purpose                                                                                     |
| ------------------------------ | ------------------------------------------------------------------------------------------- |
| `@futelab/folio/core`          | Documents, validation, snapshots, extensions, commands and URL policy.                      |
| `@futelab/folio/react`         | Client editor, reader, hooks, menus and controls.                                           |
| `@futelab/folio/reader`        | Reader and rendering API without the editor client boundary; use in server components.      |
| `@futelab/folio/serialization` | HTML/Markdown conversions; browser and Node implementations selected by package conditions. |
| `@futelab/folio/styles.css`    | Complete default styles.                                                                    |
| `@futelab/folio`               | Combined client entry; prefer the specific subpaths above.                                  |

ESM and CommonJS include matching declaration files. Next.js editors belong in a client component. Server pages can import `FolioReader` from `/reader`; import the CSS in the root layout. Do not call the combined client entry from server-only code.

## Editor contract

- Use `value` + `onChange` for controlled state, or `defaultValue` for initial uncontrolled state.
- Pass a stable `documentId`; change it when switching documents. A genuine external replacement resets selection and undo history. Normal parent echoes retain the editor and history.
- `onChange` returns JSON, not an HTML string. Debounce persistence in the host application and handle server conflicts there.
- `editable={false}` hides write controls and rejects document-changing transactions, including direct editor commands. Invalid input freezes writes and reports through `onError(error)` while retaining the last valid document.
- `uploadImage(file)` resolves to a hosted URL or `{ src, alt?, caption? }`. The component handles loading, errors, retry and cancellation; authentication/storage/size policy belong to the host. Keep callbacks free of credentials in document JSON.
- `mentionSuggestions` accepts `{ id, label }[]`. Select a candidate through the toolbar, `@` entry or slash command.
- `locale="zh-CN"`, `translations` and `labels` customize messages. `placeholder`, `className` and `classNames` customize presentation.
- `useFolioEditor` exposes the underlying editor for custom shells. Standalone menus and controls are also exported.

Block `+` inserts a paragraph below the current top-level block. Hover a block and drag its six-dot handle to reorder it. A blue line shows the insertion position, including gaps and the start/end of the document; the source stays highlighted and the native drag preview follows the pointer. Hold near the viewport or a scroll container's top/bottom edge to scroll, and press Escape to cancel. Lists, callouts, toggles and tables move as complete top-level blocks with their content and attributes preserved. Each move is a separate undo step. Alt+Shift+ArrowUp/ArrowDown and the document action buttons provide keyboard/touch alternatives. Drag reordering stays within the same editor/document; columns and nested reparenting are not supported. Table edge buttons append to the end; focused-table actions manage rows, columns, headers and cell merging.

## Safe persistence and recovery

```ts
import {
  createFolioSnapshot,
  parseFolioSnapshot,
  validateFolioDocument,
} from "@futelab/folio/core";

const stored = JSON.stringify(createFolioSnapshot(document));
// Returns { format: "folio", version: 1, document } and migrates legacy bare JSON.
const loaded = parseFolioSnapshot(stored).document;
const result = validateFolioDocument(loaded); // { valid, errors: [{ code, path, message }] }
```

`parseFolioDocument` and `parseFolioSnapshot` throw `FolioDocumentValidationError` with `issues`. `isFolioDocument` performs validation, rather than checking only the root type. Future snapshot versions and unsupported data are rejected. Catch failures, retain the original saved value, offer a backup/recovery UI and avoid replacing failed loads with an automatically saved empty document. The demo demonstrates this behavior, quota failures and legacy migration.

Default validation limits are 10,000 nodes, depth 64 and two million text/attribute characters. Configure `limits` for your application. `createFolioDocumentValidator(options)` compiles a reusable validator for a stable schema. Snapshot JSON is separate from the package version.

## Reader and extensions

`FolioReader` accepts `value: unknown`, `extensions`, `headingIdPrefix`, `limits`, `maxRenderedNodes`, `onError`, `renderError`, `className` and `classNames.root`. It preserves list start numbers, table spans/widths, code languages and image captions. Invalid, unknown or failing content produces visible diagnostics. Reader `onError` is a synchronous render diagnostic: it must be pure and may run more than once. Use `renderError` to return fallback UI; do not set React state in that callback.

Readers in one React root get unique IDs automatically. For independent roots or `renderFolioNode` calls, pass distinct, stable `headingIdPrefix` values. Rendering defaults to 50,000 generated elements, including table-of-contents expansion.

An extension can contribute `tiptapExtensions`, command metadata and `renderers`. A renderer has `{ type, kind?: "node" | "mark", render(node, { children, path }) }`; register it with the same extensions in the reader. Node/mark schema definitions come from Tiptap. Extension names and contributions must be unique; custom command names override matching defaults. Pass the same extensions to serialization. Conversion rejects nodes without the required format handlers instead of silently discarding them.

## HTML and Markdown

```ts
import { fromHTML, toHTML, fromMarkdown, toMarkdown } from "@futelab/folio/serialization";
const document = fromHTML("<h2>Notes</h2><p>Hello</p>");
const html = toHTML(document);
const markdown = toMarkdown(document);
const parsed = fromMarkdown(markdown);
```

Conversions accept a second `{ extensions, limits }` argument. HTML uses the configured schema, validates URLs and rejects unsupported or active markup. It exports a populated table of contents, visible image captions and bookmark descriptions. Reader, media input and conversions share the URL policy: HTTP/HTTPS and safe relative image URLs, raster base64 images, and HTTP/HTTPS/mailto/tel/safe relative links. SVG data URLs and unsafe protocols are rejected.

Markdown export supports the lossless subset: basic blocks, lists/tasks, code, quotes, dividers, plain images and common marks. Tables, callouts, bookmarks, toggles, captions, colors, underline and unsupported attributes raise `FolioMarkdownSerializationError`. Custom extensions require compatible Markdown handlers and must pass round-trip checks. Raw HTML tokens in Markdown are rejected consistently in Node and browsers; use `fromHTML` for HTML input. Fenced/inline code and Markdown autolinks remain valid.

Tiptap generates matching `id`/`data-toc-id` pairs on headings. To explicitly discard those regenerable anchors when exporting Markdown, use `toMarkdown(document, { headingIds: "omit-matching-toc" })`. The default preserves IDs and reports unrepresentable attributes. Standalone or mismatched author IDs are always preserved/rejected, never silently discarded; the input document is not mutated.

## Styling

Override `--folio-color-bg`, `--folio-color-text`, `--folio-color-border`, `--folio-color-accent`, `--folio-font-family` and related variables globally or on a wrapping element. Editor class hooks are `root`, `content`, `blockControls`, `bubbleToolbar` and `slashMenu`. Menus, dialogs, table controls and reader diagnostics are included in the CSS entry.

## Develop and verify

```sh
pnpm install --frozen-lockfile
pnpm demo
pnpm check
pnpm exec playwright install chromium firefox webkit
pnpm test:e2e
pnpm test:package
```

The demo runs at `http://127.0.0.1:55399/`. `pnpm format`/`format:check` use Oxfmt; `pnpm lint`/`lint:fix` use Oxlint. No ESLint or Prettier process is required.

CI checks formatting, lint, types, unit/Node SSR tests, builds, production dependency advisories, Chromium/Firefox/WebKit/mobile flows and isolated React 18/19/Next.js tarball consumers. Consumer checks cover ESM/CJS types and runtime, SSR, production bundles and browser hydration/interactions. [Release and Pages setup](./docs/RELEASING.md) documents the external npm authorization requirements and tag workflow.
