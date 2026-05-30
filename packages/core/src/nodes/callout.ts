import { mergeAttributes, Node } from "@tiptap/core";

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
        renderHTML: (attributes) => ({
          "data-tone": attributes.tone,
        }),
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
