# @futelab/folio

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
