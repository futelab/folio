import type { Editor } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import type {
  FolioCommentAction,
  FolioCommentAnchor,
  FolioCommentReply,
  FolioCommentsOptions,
  FolioCommentThread,
} from "./types";
import { folioCommentsPluginKey } from "./extension";

let fallbackId = 0;
export function createCommentId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `comment-${Date.now()}-${++fallbackId}`;
}
function bodyText(body: string) {
  const value = body.trim();
  if (!value || value.length > 10000)
    throw new Error("Comments must contain 1 to 10000 characters.");
  return value;
}
function threadFor(options: FolioCommentsOptions, id: string) {
  const thread = options.store.getSnapshot().find((entry) => entry.id === id);
  if (!thread) throw new Error("Comment thread no longer exists.");
  return thread;
}
async function allow(
  options: FolioCommentsOptions,
  action: FolioCommentAction,
  thread?: FolioCommentThread,
  reply?: FolioCommentReply,
) {
  if (!options.user.id) throw new Error("A comment author is required.");
  const permitted = options.can
    ? await options.can({ action, user: options.user, thread, reply })
    : action === "remove"
      ? thread?.author.id === options.user.id
      : action === "removeReply"
        ? reply?.author.id === options.user.id
        : true;
  if (!permitted) throw new Error("You do not have permission to change this comment.");
}
function commentBlockPosition(editor: Editor, from: number, useSelectedNode: boolean): number {
  if (useSelectedNode && editor.state.selection instanceof NodeSelection) return from;
  const position = editor.state.doc.resolve(from);
  for (let depth = position.depth; depth > 0; depth--) {
    const node = position.node(depth);
    if (node.isBlock && ("folioBlockId" in node.attrs || node.isTextblock))
      return position.before(depth);
  }
  return from;
}
/** Capture before opening an external form; block IDs preserve whole-block moves. */
export function getFolioCommentAnchor(
  editor: Editor | null,
  kind: "text" | "block" = "text",
): FolioCommentAnchor | null {
  if (!editor || editor.isDestroyed) return null;
  const { from, to } = editor.state.selection;
  if (kind === "text" && from === to) return null;
  const position = commentBlockPosition(editor, from, kind === "block");
  const block = editor.state.doc.nodeAt(position);
  if (!block) return null;
  const blockId =
    typeof block.attrs.folioBlockId === "string" ? block.attrs.folioBlockId : undefined;
  return kind === "block"
    ? { kind, from: position, to: position + block.nodeSize, blockId }
    : { kind, from, to, ...(to <= position + block.nodeSize ? { blockId } : {}) };
}
export async function createFolioCommentThread(
  editor: Editor | null,
  options: FolioCommentsOptions,
  input: { body: string; kind?: "text" | "block"; anchor?: FolioCommentAnchor },
): Promise<FolioCommentThread> {
  const body = bodyText(input.body);
  const anchor = input.anchor ?? getFolioCommentAnchor(editor, input.kind);
  if (
    !editor ||
    editor.isDestroyed ||
    !anchor ||
    anchor.from < 0 ||
    anchor.to <= anchor.from ||
    anchor.to > editor.state.doc.content.size
  )
    throw new Error("Select text or a block to comment on.");
  const document = editor.state.doc;
  await allow(options, "create");
  if (editor.isDestroyed || editor.state.doc !== document)
    throw new Error("The document changed before the comment could be created. Select it again.");
  const anchored = { ...anchor };
  const blockPosition =
    anchor.kind === "block" ? anchor.from : commentBlockPosition(editor, anchor.from, false);
  const block = editor.state.doc.nodeAt(blockPosition);
  if (
    !anchored.blockId &&
    block &&
    anchor.to <= blockPosition + block.nodeSize &&
    editor.isEditable &&
    "folioBlockId" in block.attrs
  ) {
    anchored.blockId =
      typeof block.attrs.folioBlockId === "string" ? block.attrs.folioBlockId : createCommentId();
    editor.view.dispatch(
      editor.state.tr
        .setNodeMarkup(blockPosition, undefined, {
          ...block.attrs,
          folioBlockId: anchored.blockId,
        })
        .setMeta("addToHistory", false),
    );
  }
  const date = new Date().toISOString();
  const thread: FolioCommentThread = {
    id: createCommentId(),
    body,
    anchor: anchored,
    author: { ...options.user },
    createdAt: date,
    updatedAt: date,
    replies: [],
    resolved: false,
  };
  await options.store.create(thread);
  return thread;
}
export async function replyToFolioComment(
  options: FolioCommentsOptions,
  id: string,
  body: string,
): Promise<void> {
  const value = bodyText(body);
  const thread = threadFor(options, id);
  await allow(options, "reply", thread);
  if (threadFor(options, id).resolved) throw new Error("Reopen this thread before replying.");
  await options.store.reply(id, {
    id: createCommentId(),
    body: value,
    author: { ...options.user },
    createdAt: new Date().toISOString(),
  });
}
export async function resolveFolioComment(
  options: FolioCommentsOptions,
  id: string,
  resolved = true,
): Promise<void> {
  const thread = threadFor(options, id);
  await allow(options, resolved ? "resolve" : "reopen", thread);
  await options.store.setResolved(id, resolved);
}
export async function removeFolioComment(options: FolioCommentsOptions, id: string): Promise<void> {
  const thread = threadFor(options, id);
  await allow(options, "remove", thread);
  await options.store.remove(id);
}
export async function removeFolioCommentReply(
  options: FolioCommentsOptions,
  id: string,
  replyId: string,
): Promise<void> {
  const thread = threadFor(options, id);
  const reply = thread.replies.find((entry) => entry.id === replyId);
  if (!reply) return;
  await allow(options, "removeReply", thread, reply);
  if (!options.store.removeReply)
    throw new Error("This comment store cannot remove individual replies.");
  await options.store.removeReply(id, replyId);
}
export function selectFolioCommentThread(editor: Editor | null, id: string): boolean {
  if (!editor || editor.isDestroyed) return false;
  const anchor = folioCommentsPluginKey.getState(editor.state)?.anchors.get(id)?.anchor;
  if (!anchor || anchor.orphaned) return false;
  return anchor.kind === "block"
    ? editor.commands.setNodeSelection(anchor.from)
    : editor.commands.setTextSelection({ from: anchor.from, to: anchor.to });
}
