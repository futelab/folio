# @futelab/folio

## 0.2.0

Upgrade note: the default schema now includes `columns`, `column` and `folioBlockId` (including null attributes on ordinary blocks). Upgrade editors, readers, converters and collaborating clients together. Version 0.1 validators may reject documents produced by 0.2; retain original backups for rollback or migrate explicitly. The snapshot envelope remains version 1 and does not imply backward schema compatibility.

### Minor Changes

- 9691de3: Add block action menus and stable block links, multi-block selection and batch operations, composable editor UI with external floating portals, and schema-aware rich-text, plain-text and image clipboard flows.

  Add nested block dragging and responsive columns with adjustable widths, plus document find and replace with keyboard navigation, read-only browsing and undo support.

  Expose Yjs collaboration integration, anchored comment stores and revision history adapters with preview and restore. Provide in-memory demo implementations; production transport, persistence and server authorization remain host responsibilities.

  Stabilize block controls across callout text and padding, single-body toggle panels, nested column gutters and image captions. Keep image controls at the visual top through loading, resizing and failed-image states. Expand cross-browser coverage and document the new integration contracts.

## 0.1.3

### Patch Changes

- 2f26a8e: Improve block dragging with stable six-dot handles, native block previews, source highlighting, full-width insertion guides, gap and document-edge drop targets, nested-container and viewport auto-scrolling, and Escape cancellation. Preserve composite blocks and isolate each move in undo history. Clean up drag state on document changes, read-only transitions and unmount, and reject stale or cross-editor block drops.

## 0.1.2

### Patch Changes

- 6f09f8f: Render editable empty-document hints in paragraph flow instead of an absolute Demo overlay, keeping hints below document actions across locales and viewport sizes. Guard DOM positioning while the editor is temporarily unmounted during controlled content or configuration replacement.

## 0.1.1

### Patch Changes

- 96a962d: Position table edge controls after layout commits and keep them aligned during resize, scrolling, and document changes. Keep table actions tied to the selection so hovering neighboring blocks no longer repeatedly shifts the document or flickers the controls. Clean up geometry observers and pending updates when controls become read-only or unmount.

## 0.1.0

### Minor Changes

- 11f3653: Release the validated Folio editor and reader: bounded schema validation, versioned snapshots,
  safe and loss-aware HTML/Markdown conversions, extension commands/renderers, complete media
  and table flows, transaction-level read-only mode, isolated undo histories, IME handling,
  SSR entry points, and an accessible multilingual demo. Upgrade the supported toolchain and
  add Oxlint/Oxfmt, cross-browser and packed-consumer checks, npm release CI and GitHub Pages.
