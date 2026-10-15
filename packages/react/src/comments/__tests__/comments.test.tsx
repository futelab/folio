import "@testing-library/jest-dom/vitest";
import { Editor, getSchema } from "@tiptap/core";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Doc } from "yjs";
import { createDefaultTiptapExtensions } from "@futelab/folio-core/browser";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createFolioCommentsExtension,
  createFolioCommentThread,
  createMemoryCommentStore,
  FolioCommentsPanel,
  folioCommentsPluginKey,
  getFolioCommentAnchor,
  removeFolioComment,
  removeFolioCommentReply,
  replyToFolioComment,
  resolveFolioComment,
  selectFolioCommentThread,
} from "..";
import type { FolioCommentsOptions } from "..";
import { moveBlock } from "../../blocks/blockDrag";
import {
  createFolioCollaborationExtensions,
  createFolioCollaborationRoom,
  initializeFolioCollaboration,
  withoutFolioHistory,
} from "../../collaboration";

const editors: Editor[] = [];
const destroyers: Array<() => void> = [];
const alice = { id: "alice", name: "Alice" };
const bob = { id: "bob", name: "Bob" };
beforeAll(() => {
  if (!Range.prototype.getClientRects)
    Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
  if (!Range.prototype.getBoundingClientRect)
    Range.prototype.getBoundingClientRect = () => new DOMRect(0, 0, 100, 20);
});
beforeEach(() => {
  vi.spyOn(window, "scrollBy").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  editors.splice(0).forEach((editor) => editor.destroy());
  destroyers.splice(0).forEach((destroy) => destroy());
  document.body.replaceChildren();
  vi.restoreAllMocks();
});
function fixture(options: Partial<FolioCommentsOptions> = {}) {
  const store = options.store ?? createMemoryCommentStore();
  const comments: FolioCommentsOptions = { store, user: alice, ...options };
  const element = document.createElement("div");
  document.body.append(element);
  const editor = new Editor({
    element,
    extensions: [...createDefaultTiptapExtensions(), createFolioCommentsExtension(comments)],
    content: "<p>First paragraph</p><p>Second paragraph</p>",
  });
  editors.push(editor);
  editor.commands.setTextSelection({ from: 1, to: 6 });
  return { store, comments, editor };
}
async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("comment stores and permissions", () => {
  it("creates immutable snapshots and supports replies, resolve/reopen and removal", async () => {
    const { store, comments, editor } = fixture();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    const initial = store.getSnapshot();
    const thread = await createFolioCommentThread(editor, comments, { body: "  Review this  " });
    await settle();
    expect(store.getSnapshot()).not.toBe(initial);
    expect(store.getSnapshot()).toBe(store.getSnapshot());
    expect(store.getSnapshot()[0]!.body).toBe("Review this");
    expect(Object.isFrozen(store.getSnapshot()[0]!.anchor)).toBe(true);
    await replyToFolioComment({ ...comments, user: bob }, thread.id, "Reply from Bob");
    expect(store.getSnapshot()[0]!.replies[0]!.author).toEqual(bob);
    await resolveFolioComment(comments, thread.id);
    expect(store.getSnapshot()[0]!.resolved).toBe(true);
    await expect(replyToFolioComment(comments, thread.id, "Late reply")).rejects.toThrow("Reopen");
    await resolveFolioComment(comments, thread.id, false);
    expect(store.getSnapshot()[0]!.resolved).toBe(false);
    const replyId = store.getSnapshot()[0]!.replies[0]!.id;
    await expect(removeFolioCommentReply(comments, thread.id, replyId)).rejects.toThrow(
      "permission",
    );
    await removeFolioCommentReply({ ...comments, user: bob }, thread.id, replyId);
    expect(store.getSnapshot()[0]!.replies).toHaveLength(0);
    await expect(removeFolioComment({ ...comments, user: bob }, thread.id)).rejects.toThrow(
      "permission",
    );
    await removeFolioComment({ ...comments, user: bob, can: async () => true }, thread.id);
    expect(store.getSnapshot()).toHaveLength(0);
    expect(listener).toHaveBeenCalled();
    unsubscribe();
  });

  it("rejects empty input and denied asynchronous permission without changing the document", async () => {
    const { store, comments, editor } = fixture();
    const before = editor.getJSON();
    await expect(createFolioCommentThread(editor, comments, { body: "   " })).rejects.toThrow(
      "1 to 10000",
    );
    await expect(
      createFolioCommentThread(editor, { ...comments, can: async () => false }, { body: "Denied" }),
    ).rejects.toThrow("permission");
    expect(editor.getJSON()).toEqual(before);
    expect(store.getSnapshot()).toHaveLength(0);
    expect(getFolioCommentAnchor(editor)).toEqual({
      kind: "text",
      from: 1,
      to: 6,
      blockId: undefined,
    });
    expect(editor.getJSON()).toEqual(before);
  });

  it("rejects a stale selection after asynchronous permission and propagates persistence failures", async () => {
    const { comments, editor } = fixture();
    let approve: (allowed: boolean) => void = () => {};
    const pending = createFolioCommentThread(
      editor,
      {
        ...comments,
        can: () =>
          new Promise<boolean>((resolve) => {
            approve = resolve;
          }),
      },
      { body: "Pending" },
    );
    editor.commands.insertContent("Changed");
    approve(true);
    await expect(pending).rejects.toThrow("document changed");
    editor.commands.setTextSelection({ from: 1, to: 3 });
    const create = vi.fn().mockRejectedValue(new Error("Storage offline"));
    await expect(
      createFolioCommentThread(
        editor,
        { ...comments, store: { ...comments.store, create } },
        { body: "Keep my draft" },
      ),
    ).rejects.toThrow("Storage offline");
  });
});

describe("comment anchors and decorations", () => {
  it("anchors the current nested paragraph instead of its enclosing quote or column", async () => {
    const { comments, editor } = fixture();
    editor.commands.setContent("<blockquote><p>Nested text</p></blockquote><p>After</p>");
    editor.commands.setTextSelection({ from: 2, to: 8 });
    const thread = await createFolioCommentThread(editor, comments, {
      body: "This paragraph",
      kind: "block",
    });
    await settle();
    expect(thread.anchor.from).toBe(1);
    expect(editor.state.doc.nodeAt(thread.anchor.from)?.type.name).toBe("paragraph");
    expect(editor.state.doc.firstChild?.attrs.folioBlockId).toBeNull();
    expect(editor.view.dom.querySelector(`[data-folio-comment-id="${thread.id}"]`)?.tagName).toBe(
      "P",
    );
  });
  it("maps a text anchor after edits and persists its new location outside document JSON", async () => {
    const { store, comments, editor } = fixture();
    const thread = await createFolioCommentThread(editor, comments, { body: "First word" });
    await settle();
    expect(editor.can().undo()).toBe(false);
    expect(
      editor.view.dom.querySelector(`[data-folio-comment-id="${thread.id}"]`)?.textContent,
    ).toBe("First");
    editor.commands.insertContentAt(1, "New ");
    await settle();
    expect(store.getSnapshot()[0]!.anchor).toMatchObject({ from: 5, to: 10, orphaned: false });
    expect(selectFolioCommentThread(editor, thread.id)).toBe(true);
    expect(
      editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to),
    ).toBe("First");
    expect(JSON.stringify(editor.getJSON())).not.toContain("First word");
    await resolveFolioComment(comments, thread.id);
    await settle();
    expect(editor.view.dom.querySelector("[data-folio-comment-id]")).toBeNull();
    await resolveFolioComment(comments, thread.id, false);
    await settle();
    expect(editor.view.dom.querySelector("[data-folio-comment-id]")).not.toBeNull();
  });

  it.each(["block", "text"] as const)(
    "keeps a %s anchor on the same block after reorder",
    async (kind) => {
      const { store, comments, editor } = fixture();
      const thread = await createFolioCommentThread(editor, comments, { body: "Track this", kind });
      await settle();
      const source = editor.view.dom.firstElementChild as HTMLElement;
      const target = editor.view.dom.lastElementChild as HTMLElement;
      expect(moveBlock(editor, source, target, "after", false)).toBe(true);
      await settle();
      const anchor = store.getSnapshot()[0]!.anchor;
      expect(anchor.orphaned).toBe(false);
      expect(anchor.from).toBeGreaterThan(10);
      expect(selectFolioCommentThread(editor, thread.id)).toBe(true);
      expect(editor.state.doc.textBetween(anchor.from, anchor.to)).toContain("First");
    },
  );

  it("retains a discussion when its original content is deleted and cleans subscriptions", async () => {
    const { store, comments, editor } = fixture();
    const thread = await createFolioCommentThread(editor, comments, { body: "Keep discussion" });
    await settle();
    editor.commands.deleteRange({ from: 1, to: 6 });
    await settle();
    expect(store.getSnapshot()[0]!.anchor.orphaned).toBe(true);
    expect(selectFolioCommentThread(editor, thread.id)).toBe(false);
    expect(editor.view.dom.querySelector("[data-folio-comment-id]")).toBeNull();
    editor.destroy();
    await replyToFolioComment(comments, thread.id, "Still available");
    await settle();
    expect(store.getSnapshot()[0]!.replies).toHaveLength(1);
  });

  it("maps relative text positions through another author's Yjs edit", async () => {
    const room = createFolioCollaborationRoom();
    const a = new Doc();
    const b = new Doc();
    destroyers.push(() => {
      room.destroy();
      a.destroy();
      b.destroy();
    });
    initializeFolioCollaboration(room.document, getSchema(createDefaultTiptapExtensions()), {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Shared text" }] }],
    });
    const store = createMemoryCommentStore();
    const comments = { store, user: alice };
    const create = (document: Doc) => {
      const element = window.document.createElement("div");
      window.document.body.append(element);
      const editor = new Editor({
        element,
        extensions: [
          ...withoutFolioHistory(createDefaultTiptapExtensions()),
          ...createFolioCollaborationExtensions({
            document,
            provider: room.createProvider(document),
          }),
          createFolioCommentsExtension(comments),
        ],
      });
      editors.push(editor);
      return editor;
    };
    const left = create(a);
    const right = create(b);
    await waitFor(() => expect(right.getText()).toBe("Shared text"));
    left.commands.setTextSelection({ from: 1, to: 7 });
    const thread = await createFolioCommentThread(left, comments, { body: "Shared word" });
    await settle();
    right.commands.insertContentAt(1, "Other ");
    await settle();
    const mapped = folioCommentsPluginKey.getState(left.state)!.anchors.get(thread.id)!.anchor;
    expect(left.state.doc.textBetween(mapped.from, mapped.to)).toBe("Shared");
    expect(mapped.orphaned).toBe(false);
  });
});

describe("comments side panel", () => {
  it("creates a thread, replies, resolves/reopens and removes it through accessible controls", async () => {
    const { store, comments, editor } = fixture();
    render(<FolioCommentsPanel editor={editor} options={comments} />);
    fireEvent.change(screen.getByLabelText("Comment text"), { target: { value: "Please review" } });
    fireEvent.click(screen.getByRole("button", { name: "Comment on selection" }));
    await waitFor(() => expect(store.getSnapshot()).toHaveLength(1));
    fireEvent.change(screen.getByLabelText("Reply"), { target: { value: "Done" } });
    fireEvent.click(screen.getByRole("button", { name: "Reply" }));
    await screen.findByText("Done");
    fireEvent.click(screen.getByRole("button", { name: "Resolve" }));
    await screen.findByText("Resolved");
    expect(screen.queryByLabelText("Reply")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reopen" }));
    await screen.findByLabelText("Reply");
    fireEvent.click(screen.getByRole("button", { name: /^Remove$/ }));
    await screen.findByText("No comments yet");
  });

  it("shows persistence errors while retaining the user's draft", async () => {
    const { comments, editor } = fixture();
    const fail = {
      ...comments,
      store: {
        ...comments.store,
        create: async () => {
          throw new Error("Quota reached");
        },
      },
    };
    render(<FolioCommentsPanel editor={editor} options={fail} />);
    fireEvent.change(screen.getByLabelText("Comment text"), {
      target: { value: "Do not lose me" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Comment on selection" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Quota reached");
    expect(screen.getByLabelText("Comment text")).toHaveValue("Do not lose me");
  });
});
