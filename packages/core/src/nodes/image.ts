import { mergeAttributes } from "@tiptap/core";
import { Image } from "@tiptap/extension-image";

export const FolioImage = Image.extend({
  name: "image",

  addAttributes() {
    return {
      ...this.parent?.(),
      caption: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-caption"),
        renderHTML: (attributes) =>
          attributes.caption ? { "data-caption": attributes.caption } : {},
      },
    };
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "img",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        class: "folio-image",
      }),
    ];
  },
});
