import { mergeAttributes, Node } from "@tiptap/core";

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
      "Table of contents",
    ];
  },
});
