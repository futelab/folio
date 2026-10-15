---
"@futelab/folio": patch
---

Position table edge controls after layout commits and keep them aligned during resize, scrolling, and document changes. Keep table actions tied to the selection so hovering neighboring blocks no longer repeatedly shifts the document or flickers the controls. Clean up geometry observers and pending updates when controls become read-only or unmount.
