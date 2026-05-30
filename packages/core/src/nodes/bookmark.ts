import { mergeAttributes, Node } from "@tiptap/core";

export const FolioBookmark = Node.create({
  name: "bookmark",

  group: "block",

  atom: true,

  selectable: true,

  draggable: true,

  addAttributes() {
    return {
      url: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-url"),
        renderHTML: (attributes) =>
          attributes.url ? { "data-url": attributes.url } : {},
      },
      title: {
        default: null,
        parseHTML: (element) =>
          element.getAttribute("data-title") ?? element.textContent,
        renderHTML: (attributes) =>
          attributes.title ? { "data-title": attributes.title } : {},
      },
      description: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-description"),
        renderHTML: (attributes) =>
          attributes.description
            ? { "data-description": attributes.description }
            : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-folio-bookmark]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-folio-bookmark": "",
        class: "folio-bookmark",
      }),
      node.attrs.title ?? node.attrs.url ?? "Bookmark",
    ];
  },
});
