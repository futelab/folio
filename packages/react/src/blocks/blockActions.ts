import type { Editor, JSONContent } from "@tiptap/core";
import { closeHistory } from "@tiptap/pm/history";
import { getFolioBlockAnchorId, isFolioBlockId } from "@futelab/folio-core/browser";
import { getSelectedBlocks } from "./blockSelection";

export interface FolioBlockLinkContext {
  editor: Editor;
  documentId?: string;
  blockId: string;
  anchorId: string;
  node: JSONContent;
}
export type FolioBlockLinkResolver = (context: FolioBlockLinkContext) => string | Promise<string>;
let sequence = 0;
export async function getSelectedBlockLink(
  editor: Editor,
  documentId?: string,
  resolver?: FolioBlockLinkResolver,
): Promise<string> {
  if (editor.isDestroyed) throw new Error("The editor is no longer available");
  const blocks = getSelectedBlocks(editor);
  const block = blocks.length === 1 ? blocks[0] : undefined;
  if (!block) throw new Error("Select one block to copy its link");
  let id = block.node.attrs.folioBlockId;
  const headingId =
    block.node.type.name === "heading" && typeof block.node.attrs.id === "string"
      ? block.node.attrs.id
      : undefined;
  if (!headingId && !isFolioBlockId(id)) {
    if (!editor.isEditable || !Object.hasOwn(block.node.type.spec.attrs ?? {}, "folioBlockId"))
      throw new Error("This block does not support a persistent link");
    id = globalThis.crypto?.randomUUID?.() ?? `block-${Date.now()}-${++sequence}`;
    editor.view.dispatch(
      closeHistory(editor.state.tr).setNodeMarkup(block.pos, undefined, {
        ...block.node.attrs,
        folioBlockId: id,
      }),
    );
    if (editor.state.doc.nodeAt(block.pos)?.attrs.folioBlockId !== id)
      throw new Error("The block link could not be saved");
    editor.view.dispatch(closeHistory(editor.state.tr));
  }
  const blockId = headingId || (id as string);
  const anchorId = headingId || getFolioBlockAnchorId(blockId);
  if (resolver)
    return resolver({
      editor,
      documentId,
      blockId,
      anchorId,
      node: editor.state.doc.nodeAt(block.pos)!.toJSON(),
    });
  const url = new URL(editor.view.dom.ownerDocument.defaultView!.location.href);
  url.hash = anchorId;
  return url.toString();
}
export async function writeFolioClipboardText(editor: Editor, text: string): Promise<void> {
  const document = editor.view.dom.ownerDocument;
  const navigator = document.defaultView?.navigator;
  if (navigator?.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.tabIndex = -1;
  textarea.setAttribute("aria-hidden", "true");
  Object.assign(textarea.style, { position: "fixed", left: "-10000px", top: "0" });
  document.body.append(textarea);
  try {
    textarea.select();
    if (!document.execCommand?.("copy")) throw new Error("Clipboard access is unavailable");
  } finally {
    textarea.remove();
    if (!editor.isDestroyed) editor.view.dom.focus({ preventScroll: true });
  }
}
