import "@testing-library/jest-dom/vitest";
import { useEffect } from "react";
import { Editor, getSchema } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { Doc } from "yjs";
import { createDefaultTiptapExtensions } from "@futelab/folio-core/browser";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createFolioCollaborationExtensions,
  createFolioCollaborationRoom,
  initializeFolioCollaboration,
  withoutFolioHistory,
} from "..";
import type { FolioCollaborationOptions } from "..";
import { useFolioEditor } from "../../useFolioEditor";

const editors: Editor[] = [];
const documents: Doc[] = [];
const rooms: ReturnType<typeof createFolioCollaborationRoom>[] = [];
const content = {
  type: "doc" as const,
  content: [{ type: "paragraph", content: [{ type: "text", text: "Shared" }] }],
};
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
  rooms.splice(0).forEach((room) => room.destroy());
  documents.splice(0).forEach((document) => document.destroy());
  document.body.replaceChildren();
  vi.restoreAllMocks();
});
function roomFixture() {
  const room = createFolioCollaborationRoom();
  rooms.push(room);
  initializeFolioCollaboration(room.document, getSchema(createDefaultTiptapExtensions()), content);
  const peer = () => {
    const document = new Doc();
    documents.push(document);
    return { document, provider: room.createProvider(document) };
  };
  return { room, left: peer(), right: peer() };
}
function createEditor(collaboration: FolioCollaborationOptions, editable = true) {
  const element = document.createElement("div");
  document.body.append(element);
  const editor = new Editor({
    element,
    editable,
    extensions: [
      ...withoutFolioHistory(createDefaultTiptapExtensions()),
      ...createFolioCollaborationExtensions(collaboration),
    ],
  });
  editors.push(editor);
  return editor;
}

describe("Yjs collaboration", () => {
  it("creates initialized peers without requiring a transport package and disposes its own documents", () => {
    const room = createFolioCollaborationRoom({ initialValue: content });
    rooms.push(room);
    const peer = room.createPeer();
    const editor = createEditor(peer);
    expect(editor.getText()).toBe("Shared");
    expect(() => room.destroy()).not.toThrow();
    expect(peer.document.isDestroyed).toBe(true);
    expect(room.document.isDestroyed).toBe(true);
    expect(() => room.createPeer()).toThrow("closed");
  });
  it("reports failed asynchronous connections and releases provider listeners", async () => {
    const document = new Doc();
    documents.push(document);
    const error = new Error("Transport unavailable");
    const onError = vi.fn();
    const status = vi.fn();
    const provider = {
      connect: vi.fn().mockRejectedValue(error),
      disconnect: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    };
    const editor = createEditor({ document, provider, onError, onStatusChange: status });
    await waitFor(() => expect(onError).toHaveBeenCalledWith(error));
    expect(status).toHaveBeenCalledWith("error");
    editor.destroy();
    expect(provider.off).toHaveBeenCalledTimes(2);
    expect(provider.disconnect).toHaveBeenCalledOnce();
    expect(document.isDestroyed).toBe(false);
  });
  it("cleans a provider immediately when an editor is destroyed before its create event", () => {
    const { left } = roomFixture();
    const connect = vi.spyOn(left.provider, "connect");
    const disconnect = vi.spyOn(left.provider, "disconnect");
    const editor = createEditor(left);
    expect(connect).toHaveBeenCalledOnce();
    editor.destroy();
    expect(disconnect).toHaveBeenCalledOnce();
  });
  it("initializes once and synchronizes two real editors without flattening JSON", async () => {
    const { room, left, right } = roomFixture();
    expect(
      initializeFolioCollaboration(room.document, getSchema(createDefaultTiptapExtensions()), {
        type: "doc",
        content: [{ type: "paragraph" }],
      }),
    ).toBe(false);
    const a = createEditor(left);
    const b = createEditor(right);
    await waitFor(() => expect(a.getText()).toBe("Shared"));
    await waitFor(() => expect(b.getText()).toBe("Shared"));
    a.commands.setTextSelection(7);
    a.commands.insertContent(" from A");
    expect(b.getText()).toBe("Shared from A");
    b.commands.setTextSelection(1);
    b.commands.insertContent("B: ");
    expect(a.getJSON()).toEqual(b.getJSON());
    expect(a.getText()).toBe("B: Shared from A");
    expect(a.extensionManager.extensions.some((extension) => extension.name === "undoRedo")).toBe(
      false,
    );
  });

  it("undoes only the local author's edits and keeps remote edits", async () => {
    const { left, right } = roomFixture();
    const a = createEditor(left);
    const b = createEditor(right);
    await waitFor(() => expect(b.getText()).toBe("Shared"));
    a.commands.setTextSelection(7);
    a.commands.insertContent(" A");
    b.commands.setTextSelection(1);
    b.commands.insertContent("B ");
    expect(a.commands.undo()).toBe(true);
    expect(a.getText()).toBe("B Shared");
    expect(b.getText()).toBe("B Shared");
    expect(a.commands.redo()).toBe(true);
    expect(b.getText()).toBe("B Shared A");
    expect(b.commands.undo()).toBe(true);
    expect(a.getText()).toBe("Shared A");
  });

  it("allows remote transactions in readonly mode but blocks local commands and local undo", async () => {
    const { left, right } = roomFixture();
    const a = createEditor(left);
    const b = createEditor(right);
    await waitFor(() => expect(b.getText()).toBe("Shared"));
    b.commands.insertContent("Local ");
    b.setEditable(false);
    const before = b.getJSON();
    b.commands.insertContent("Blocked ");
    expect(b.getJSON()).toEqual(before);
    expect(b.commands.undo()).toBe(false);
    a.commands.setTextSelection(a.state.doc.content.size - 1);
    a.commands.insertContent(" Remote");
    expect(b.getJSON()).toEqual(a.getJSON());
    expect(b.getText()).toContain("Remote");
  });

  it("publishes awareness identity and relative selections and cleans up provider state", async () => {
    const { left, right } = roomFixture();
    const status = vi.fn();
    const disconnect = vi.spyOn(left.provider, "disconnect");
    const a = createEditor({
      ...left,
      user: { id: "alice", name: "Alice", color: "#aabbcc" },
      onStatusChange: status,
    });
    const b = createEditor({ ...right, user: { id: "bob", name: "Bob", color: "#334455" } });
    await waitFor(() => expect(b.getText()).toBe("Shared"));
    a.commands.setTextSelection({ from: 1, to: 4 });
    a.view.dom.focus();
    a.view.dispatch(a.state.tr);
    await waitFor(() =>
      expect(right.provider.awareness.getStates().get(left.document.clientID)?.cursor).toBeTruthy(),
    );
    expect(right.provider.awareness.getStates().get(left.document.clientID)?.user.name).toBe(
      "Alice",
    );
    await waitFor(() =>
      expect(b.view.dom.querySelector(".folio-collaboration-selection")).not.toBeNull(),
    );
    expect(status).toHaveBeenCalledWith("synced");
    a.destroy();
    expect(disconnect).toHaveBeenCalledOnce();
    expect(right.provider.awareness.getStates().has(left.document.clientID)).toBe(false);
    expect(left.document.isDestroyed).toBe(false);
  });

  it("merges offline edits after reconnect and supports host-owned connections", async () => {
    const { left, right } = roomFixture();
    left.provider.connect?.();
    right.provider.connect?.();
    const disconnect = vi.spyOn(left.provider, "disconnect");
    const a = createEditor({ ...left, manageConnection: false });
    const b = createEditor(right);
    await waitFor(() => expect(b.getText()).toBe("Shared"));
    left.provider.disconnect?.();
    expect(right.provider.awareness.getStates().has(left.document.clientID)).toBe(false);
    a.commands.insertContent("Offline ");
    b.commands.setTextSelection(7);
    b.commands.insertContent(" Online");
    expect(a.getText()).not.toBe(b.getText());
    left.provider.connect?.();
    expect(a.getJSON()).toEqual(b.getJSON());
    expect(right.provider.awareness.getStates().has(left.document.clientID)).toBe(true);
    disconnect.mockClear();
    a.destroy();
    expect(disconnect).not.toHaveBeenCalled();
  });

  it("keeps the hook bound to Y.Doc, observes readonly remote updates, and replaces document identity", async () => {
    const { left, right } = roomFixture();
    const change = vi.fn();
    let current: Editor | null = null;
    function Harness({
      readonly = false,
      value = content,
      shared = left,
    }: {
      readonly?: boolean;
      value?: typeof content;
      shared?: typeof left;
    }) {
      const editor = useFolioEditor({
        collaboration: shared,
        editable: !readonly,
        value,
        onChange: change,
      });
      useEffect(() => {
        current = editor;
      }, [editor]);
      return <EditorContent editor={editor} />;
    }
    const view = render(<Harness />);
    const b = createEditor(right);
    await waitFor(() => expect(current?.getText()).toBe("Shared"));
    const a = current!;
    view.rerender(
      <Harness
        readonly
        value={{
          ...content,
          content: [{ type: "paragraph", content: [{ type: "text", text: "Do not replace" }] }],
        }}
      />,
    );
    await waitFor(() => expect(current?.isEditable).toBe(false));
    expect(current).toBe(a);
    expect(a.getText()).toBe("Shared");
    change.mockClear();
    act(() => {
      b.commands.setTextSelection(7);
      b.commands.insertContent(" Remote");
    });
    expect(a.getText()).toBe("Shared Remote");
    expect(change).toHaveBeenCalled();
    const next = roomFixture().left;
    view.rerender(<Harness shared={next} />);
    await waitFor(() => expect(current).not.toBe(a));
    await waitFor(() => expect(current?.getText()).toBe("Shared"));
  });
});
