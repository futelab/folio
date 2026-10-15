import { mergeAttributes, Node } from "@tiptap/core";

/** Relative column weights; percentages such as [60, 40] are also valid. */
export function isFolioColumnWidth(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 100;
}

export const FolioColumns = Node.create({
  name: "columns",
  group: "block",
  content: "column{2,3}",
  defining: true,
  isolating: true,
  parseHTML: () => [{ tag: "div[data-folio-columns]" }],
  renderHTML: ({ HTMLAttributes }) => [
    "div",
    mergeAttributes(HTMLAttributes, { "data-folio-columns": "", class: "folio-columns" }),
    0,
  ],
});

export const FolioColumn = Node.create({
  name: "column",
  // A structural slot may occur only inside columns, never as a standalone block.
  content: "block+",
  defining: true,
  isolating: true,
  addAttributes: () => ({
    width: {
      default: 1,
      parseHTML: (element: HTMLElement) =>
        element.hasAttribute("data-width") ? Number(element.getAttribute("data-width")) : 1,
      renderHTML: (attrs: Record<string, unknown>) => ({
        "data-width": attrs.width,
        style: `--folio-column-width: ${isFolioColumnWidth(attrs.width) ? attrs.width : 1}`,
      }),
    },
  }),
  parseHTML: () => [{ tag: "div[data-folio-column]" }],
  renderHTML: ({ HTMLAttributes }) => [
    "div",
    mergeAttributes(HTMLAttributes, { "data-folio-column": "", class: "folio-column" }),
    0,
  ],
});
