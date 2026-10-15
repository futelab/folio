import { mergeAttributes } from "@tiptap/core";
import type { Attributes } from "@tiptap/core";
import { Image } from "@tiptap/extension-image";
import { sanitizeFolioUrl } from "../security";

export const FolioImage = Image.extend({
  name: "image",

  addAttributes() {
    const parent: Attributes = this.parent?.() ?? {};
    const imageElement = (element: HTMLElement) =>
      element.matches("figure") ? element.querySelector("img") : element;
    return {
      ...parent,
      src: {
        ...parent?.src,
        parseHTML: (element: HTMLElement) =>
          sanitizeFolioUrl(imageElement(element)?.getAttribute("src"), { kind: "image" }) ?? null,
        renderHTML: (attributes: Record<string, unknown>) => {
          const src = sanitizeFolioUrl(attributes.src, { kind: "image" });
          return src ? { src } : {};
        },
      },
      alt: {
        ...parent?.alt,
        parseHTML: (element: HTMLElement) => imageElement(element)?.getAttribute("alt") ?? null,
      },
      title: {
        ...parent?.title,
        parseHTML: (element: HTMLElement) => imageElement(element)?.getAttribute("title") ?? null,
      },
      caption: {
        default: null,
        parseHTML: (element) =>
          element.getAttribute("data-caption") ??
          element.querySelector("figcaption")?.textContent ??
          null,
        renderHTML: (attributes) =>
          attributes.caption ? { "data-caption": attributes.caption } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: "figure[data-folio-image]" }, ...(this.parent?.() ?? [])];
  },

  renderHTML({ HTMLAttributes }) {
    const image = [
      "img",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        class: "folio-image",
      }),
    ] as const;
    const caption = HTMLAttributes["data-caption"];
    return caption
      ? ["figure", { "data-folio-image": "" }, image, ["figcaption", {}, String(caption)]]
      : image;
  },
});
