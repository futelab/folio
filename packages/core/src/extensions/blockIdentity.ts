import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { Node } from "@tiptap/pm/model";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export const folioBlockTypes = [
  "paragraph",
  "heading",
  "bulletList",
  "orderedList",
  "taskList",
  "blockquote",
  "horizontalRule",
  "codeBlock",
  "image",
  "table",
  "details",
  "callout",
  "bookmark",
  "tableOfContents",
  "columns",
  "column",
];

export function isFolioBlockId(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(value);
}

export function getFolioBlockAnchorId(blockId: string, prefix = ""): string {
  return `${prefix ? `${prefix}-` : ""}folio-block-${blockId}`;
}

// IDs are assigned only when a block is linked, so ordinary documents keep
// their existing Markdown interoperability and don't acquire unnecessary IDs.
export const FolioBlockIdentity = Extension.create({
  name: "folioBlockIdentity",
  addGlobalAttributes() {
    return [
      {
        types: folioBlockTypes,
        attributes: {
          folioBlockId: {
            default: null,
            parseHTML: (element: HTMLElement) => {
              const value =
                element.getAttribute("data-folio-block-id") ??
                (element.matches("figure[data-folio-image]")
                  ? element.querySelector("img")?.getAttribute("data-folio-block-id")
                  : null);
              return isFolioBlockId(value) ? value : null;
            },
            renderHTML: (attributes: Record<string, unknown>) =>
              isFolioBlockId(attributes.folioBlockId)
                ? { "data-folio-block-id": attributes.folioBlockId }
                : {},
          },
        },
      },
    ];
  },
  addProseMirrorPlugins() {
    const key = new PluginKey<DecorationSet>("folioBlockAnchors");
    const anchors = (document: Node) => {
      const decorations: Decoration[] = [];
      document.descendants((node, position) => {
        if (!isFolioBlockId(node.attrs.folioBlockId)) return;
        const anchorId = getFolioBlockAnchorId(node.attrs.folioBlockId);
        if (node.type.name === "heading" && node.attrs.id && node.attrs.id !== anchorId)
          decorations.push(
            Decoration.widget(
              position,
              (view) => {
                const alias = view.dom.ownerDocument.createElement("span");
                alias.id = anchorId;
                alias.setAttribute("data-folio-block-anchor", "");
                alias.setAttribute("aria-hidden", "true");
                alias.setAttribute("contenteditable", "false");
                return alias;
              },
              { key: anchorId, side: -1 },
            ),
          );
        else
          decorations.push(
            Decoration.node(position, position + node.nodeSize, {
              id: anchorId,
            }),
          );
      });
      return DecorationSet.create(document, decorations);
    };
    return [
      new Plugin<DecorationSet>({
        key,
        state: {
          init: (_config, state) => anchors(state.doc),
          apply: (transaction, current) =>
            transaction.docChanged ? anchors(transaction.doc) : current,
        },
        props: { decorations: (state) => key.getState(state) },
      }),
    ];
  },
});
