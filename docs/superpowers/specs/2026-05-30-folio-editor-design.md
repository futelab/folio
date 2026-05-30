# @futelab/folio Notion-like Editor Design

Date: 2026-05-30
Status: Approved for implementation planning

## Goal

Build `@futelab/folio`, a product-ready React component library for Notion-like rich text editing and reading. The package should be reusable across other projects that need a polished document editor, while keeping the first version focused on document editing rather than Notion databases, real-time collaboration, or AI authoring.

The selected direction is: architecture as a reusable component library, interaction quality benchmarked against Notion.

## Non-goals for v1

- Notion database blocks such as table views, kanban views, calendars, properties, filters, sorting, relations, or rollups.
- Built-in real-time collaboration.
- Built-in AI writing features.
- A hard dependency on Tailwind or CSS-in-JS.
- Full server-side rendering for the editable editor surface.

## Package and Repository Shape

The project uses a TypeScript monorepo:

```txt
pnpm workspace
Turborepo
Changesets
Vite library builds
Storybook docs app
Vitest and Playwright
```

Only one package is published in v1:

```txt
@futelab/folio
```

Internal package boundaries remain explicit:

```txt
packages/core
  schema, document JSON types, extension registry, commands, serialization

packages/react
  FolioEditor, FolioReader, useFolioEditor, default menus, block UI

packages/styles
  styles.css, editor.css, reader.css, CSS variables, default theme

apps/docs
  Storybook documentation app with examples and interaction demos
```

The published package exposes simple default imports and advanced subpath exports:

```tsx
import { FolioEditor, FolioReader } from "@futelab/folio";
import "@futelab/folio/styles.css";

import { createFolioExtension } from "@futelab/folio/core";
import { useFolioEditor } from "@futelab/folio/react";
```

## Editor Core

The editor core is based on Tiptap and ProseMirror.

Tiptap is the implementation engine, but it is not the primary public API. Folio owns the stable public contracts for:

- document JSON
- extension configuration
- editor and reader props
- theme tokens
- renderer overrides
- import and export utilities

Advanced consumers may pass Tiptap extensions through an escape hatch, but normal consumers should not need to learn Tiptap internals.

## Content Model

The canonical content format is structured JSON.

```txt
Folio JSON Document
  -> FolioEditor
  -> Tiptap internal state
  -> onChange(nextJson)
  -> application storage
  -> FolioReader renders the same JSON
```

HTML and Markdown are import/export formats, not the source of truth:

```ts
toHTML(doc)
fromHTML(html)
toMarkdown(doc)
fromMarkdown(markdown)
```

This keeps custom blocks, mentions, callouts, embeds, todo state, colors, and future extension metadata stable across editing and rendering.

## Public React API

The primary components are:

```tsx
<FolioEditor
  value={doc}
  onChange={setDoc}
  placeholder="Write something..."
  editable
  extensions={extensions}
  classNames={classNames}
  components={components}
/>

<FolioReader
  value={doc}
  extensions={extensions}
  classNames={classNames}
  components={components}
/>
```

`FolioEditor` supports controlled mode with `value` and `onChange`, plus uncontrolled mode with `defaultValue`.

`FolioReader` renders the same JSON document without editing controls and is designed to be SSR-friendly.

Advanced consumers can use a hook and compose their own UI:

```tsx
const editor = useFolioEditor({
  value,
  onChange,
  extensions,
});
```

## v1 Block and Mark Scope

v1 is a complete document editor, excluding Notion databases.

Blocks:

- paragraph
- heading H1-H3
- bullet list
- ordered list
- todo list
- quote
- callout
- divider
- code block
- table
- image with caption
- bookmark/embed
- toggle
- table of contents

Marks and inline features:

- bold
- italic
- underline
- strike
- inline code
- link
- mention
- text color
- highlight

## Notion-like Interaction Baseline

Default interactions should feel closer to Notion than to a conventional form rich-text editor.

Required v1 interactions:

- Slash command menu opened with `/`.
- Slash command search, keyboard navigation, Enter to select, Esc to close.
- Block hover handle.
- `+` insert button near blocks.
- Block drag and drop sorting.
- Block menu for transform, duplicate, copy, delete, and move actions.
- Bubble menu for selected text formatting.
- Link creation and editing from the bubble menu.
- Color and highlight controls.
- Markdown shortcuts such as `#`, `##`, `-`, `1.`, `>`, code fence, and todo input.
- Empty block placeholder.
- Keyboard-first navigation.
- Reader and editor visual parity for content rendering.

## Extension System

Folio exposes four public extension categories:

```ts
type FolioExtension =
  | FolioBlockExtension
  | FolioMarkExtension
  | FolioCommandExtension
  | FolioRendererExtension;
```

The extension context should expose:

- document schema access
- command registration
- slash command registration
- renderer registration
- menu contribution points
- transaction hooks
- theme and component slot access where appropriate

This keeps v1 extensible without designing a full plugin marketplace up front.

Future optional packages can build on the same extension shape:

```txt
@futelab/folio-markdown
@futelab/folio-collab-yjs
@futelab/folio-ai
```

## Styling and Theming

The default UI direction is Minimal Notion-like:

- content-first
- low visual noise
- calm menus
- block controls visible only when useful
- default reader/editor styles aligned

The core style strategy is:

```txt
@futelab/folio/styles.css
CSS variables for theme tokens
classNames for local class overrides
components slots for replacing menus, block UI, and renderers
```

Tailwind may be used in demos or adapters, but it is not a core dependency. CSS-in-JS is also not a core dependency.

## Compatibility

Target environment:

```txt
React >= 18
TypeScript >= 5
Modern ESM bundlers
Vite, Next.js, Remix support
```

Editor:

- client-first because Tiptap and ProseMirror depend on the DOM
- SSR-safe to import
- friendly to Next.js `use client` boundaries and dynamic loading

Reader:

- SSR-friendly
- can render Folio JSON without initializing the editor runtime

## Testing Strategy

Tests should match the risk of an editor component library.

Vitest:

- schema conversion
- command behavior
- serialization
- extension registry
- Markdown and HTML import/export where implemented

React Testing Library:

- editor render
- reader render
- controlled and uncontrolled modes
- classNames and component slots
- basic extension rendering

Playwright:

- slash command behavior
- bubble menu behavior
- block drag and drop
- markdown shortcuts
- keyboard navigation
- reader/editor visual parity

## Documentation

The Storybook docs app should include:

- quick start
- controlled editor
- uncontrolled editor
- reader
- theme customization
- custom block extension
- custom command extension
- custom renderer
- HTML and Markdown import/export
- Next.js usage
- package release workflow

## Release Strategy

The first release starts as `0.1.0` alpha quality.

The code, documentation, types, and package boundaries should be public-ready from the start, but the API can evolve while the package is still in `0.x`.

Changesets manages versioning, changelogs, and release preparation. Turborepo manages task orchestration and caching.

## Open Implementation Decisions

These decisions are intentionally deferred to the implementation plan:

- exact Tiptap extension list
- table implementation details
- drag and drop library choice
- exact CSS variable token names
- Markdown parser and serializer package choice
