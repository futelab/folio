import { mergeAttributes, Node } from "@tiptap/core";
import { sanitizeFolioUrl } from "../security";

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
        parseHTML: (element) =>
          sanitizeFolioUrl(
            element.getAttribute("data-url") ?? element.querySelector("a")?.getAttribute("href"),
            { kind: "link" },
          ) ?? null,
        renderHTML: (attributes) =>
          sanitizeFolioUrl(attributes.url, { kind: "link" })
            ? { "data-url": sanitizeFolioUrl(attributes.url, { kind: "link" }) }
            : {},
      },
      title: {
        default: null,
        parseHTML: (element) =>
          element.getAttribute("data-title") ??
          element.querySelector("a")?.textContent ??
          element.textContent,
        renderHTML: (attributes) => (attributes.title ? { "data-title": attributes.title } : {}),
      },
      description: {
        default: null,
        parseHTML: (element) =>
          element.getAttribute("data-description") ??
          element.querySelector("p")?.textContent ??
          null,
        renderHTML: (attributes) =>
          attributes.description ? { "data-description": attributes.description } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-folio-bookmark]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const url = sanitizeFolioUrl(node.attrs.url, { kind: "link" });
    const title = String(node.attrs.title ?? node.attrs.url ?? "Bookmark");
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-folio-bookmark": "",
        class: "folio-bookmark",
      }),
      url
        ? ["a", { href: url, rel: "noopener noreferrer", target: "_blank" }, title]
        : ["span", {}, title],
      ...(node.attrs.description ? [["p", {}, String(node.attrs.description)]] : []),
    ];
  },
});
