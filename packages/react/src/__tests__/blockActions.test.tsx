import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Editor, Extension } from "@tiptap/core";
import type { JSONContent } from "@tiptap/core";
import { NodeSelection, Plugin } from "@tiptap/pm/state";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultTiptapExtensions } from "@futelab/folio-core/browser";
import { getSelectedBlockLink } from "../blocks/blockActions";
import { BlockActionMenu, resolveBlockMenuLabels } from "../blocks/BlockActionMenu";
import {
  createBlockSelectionPlugin,
  setBlockSelection,
  convertSelectedBlocks,
} from "../blocks/blockSelection";

const editors: Editor[] = [];
const paragraph = (text: string, attrs?: Record<string, unknown>): JSONContent => ({
  type: "paragraph",
  attrs,
  content: [{ type: "text", text }],
});
beforeEach(() => {
  vi.spyOn(window, "scrollBy").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  editors.splice(0).forEach((editor) => editor.destroy());
  document.body.replaceChildren();
  vi.restoreAllMocks();
});
function createEditor(
  content: JSONContent[] = [paragraph("Linked"), paragraph("After")],
  rejectWrites = false,
) {
  const element = document.createElement("div");
  document.body.append(element);
  const editor = new Editor({
    element,
    extensions: [
      ...createDefaultTiptapExtensions(),
      Extension.create({
        name: "testSelection",
        addProseMirrorPlugins: () => [
          createBlockSelectionPlugin(),
          ...(rejectWrites
            ? [new Plugin({ filterTransaction: (transaction) => !transaction.docChanged })]
            : []),
        ],
      }),
    ],
    content: { type: "doc", content },
  });
  editors.push(editor);
  return editor;
}

describe("persistent block links", () => {
  it("assigns an identity only to the selected block once, with its own undo boundary", async () => {
    const editor = createEditor();
    editor.commands.setTextSelection(7);
    editor.commands.insertContent(" typed");
    const beforeLink = editor.getJSON();
    setBlockSelection(editor, 0);
    const first = await getSelectedBlockLink(editor);
    const id = editor.state.doc.firstChild!.attrs.folioBlockId;
    expect(new URL(first).hash).toBe(`#folio-block-${id}`);
    expect(editor.state.doc.child(1).attrs.folioBlockId).toBeNull();
    const linked = editor.getJSON();
    expect(await getSelectedBlockLink(editor)).toBe(first);
    expect(editor.getJSON()).toEqual(linked);
    expect(editor.view.dom.querySelector(`[id="folio-block-${id}"]`)).toBeTruthy();
    expect(editor.commands.undo()).toBe(true);
    expect(editor.getJSON()).toEqual(beforeLink);
    expect(editor.commands.undo()).toBe(true);
    expect(editor.getText()).toContain("Linked");
    expect(editor.getText()).not.toContain("typed");
  });
  it("preserves an existing block anchor after conversion to a heading", async () => {
    const editor = createEditor([paragraph("Linked", { folioBlockId: "stable" })]);
    setBlockSelection(editor, 0);
    expect(convertSelectedBlocks(editor, "heading", { level: 2 })).toBe(true);
    expect(editor.view.dom.querySelector("h2[id]")).toBeTruthy();
    const alias = editor.view.dom.querySelector("#folio-block-stable[data-folio-block-anchor]");
    expect(alias).toBeTruthy();
    expect(alias?.getAttribute("contenteditable")).toBe("false");
  });
  it("resolves a nested selected node using its own identity and document context", async () => {
    const editor = createEditor([
      {
        type: "callout",
        attrs: { tone: "warning", folioBlockId: "outer" },
        content: [paragraph("Inner", { folioBlockId: "inner" })],
      },
    ]);
    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, 1)));
    const resolve = vi.fn(
      (context) => `https://docs.example/${context.documentId}#${context.anchorId}`,
    );
    expect(await getSelectedBlockLink(editor, "document-a", resolve)).toBe(
      "https://docs.example/document-a#folio-block-inner",
    );
    expect(resolve).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: "document-a",
        blockId: "inner",
        anchorId: "folio-block-inner",
        node: expect.objectContaining({ type: "paragraph" }),
      }),
    );
    expect(editor.state.doc.firstChild!.attrs.folioBlockId).toBe("outer");
  });
  it("allows existing links in read-only mode, refuses assignment, multiple blocks, and filtered writes", async () => {
    const linked = createEditor([paragraph("Linked", { folioBlockId: "existing" })]);
    setBlockSelection(linked, 0);
    linked.setEditable(false);
    expect(new URL(await getSelectedBlockLink(linked)).hash).toBe("#folio-block-existing");
    const plain = createEditor();
    setBlockSelection(plain, 0);
    plain.setEditable(false);
    await expect(getSelectedBlockLink(plain)).rejects.toThrow(/persistent link/);
    plain.setEditable(true);
    setBlockSelection(plain, 0, plain.state.doc.firstChild!.nodeSize);
    await expect(getSelectedBlockLink(plain)).rejects.toThrow(/Select one block/);
    const guarded = createEditor(undefined, true);
    setBlockSelection(guarded, 0);
    const resolver = vi.fn(() => "https://example.com");
    await expect(getSelectedBlockLink(guarded, undefined, resolver)).rejects.toThrow(
      /could not be saved/,
    );
    expect(resolver).not.toHaveBeenCalled();
    expect(guarded.state.doc.firstChild!.attrs.folioBlockId).toBeNull();
  });
  it("uses authored heading anchors without rewriting their attributes", async () => {
    const editor = createEditor([
      {
        type: "heading",
        attrs: { level: 2, id: "authored", "data-toc-id": "authored" },
        content: [{ type: "text", text: "Heading" }],
      },
    ]);
    setBlockSelection(editor, 0);
    editor.setEditable(false);
    const before = editor.getJSON();
    expect(new URL(await getSelectedBlockLink(editor)).hash).toBe("#authored");
    expect(editor.getJSON()).toEqual(before);
  });
});

describe("standalone block menu write guards", () => {
  it("reacts to editable changes and disables every writing control while copying remains available", () => {
    const editor = createEditor();
    const action = vi.fn();
    render(
      <BlockActionMenu
        editor={editor}
        open
        anchor={editor.view.dom}
        labels={resolveBlockMenuLabels()}
        selectionCount={1}
        canCopyLink
        canMoveUp
        canMoveDown
        canConvert={() => true}
        onAction={action}
        onClose={() => {}}
      />,
    );
    expect(screen.getByRole("menuitem", { name: "Duplicate blocks" })).toBeEnabled();
    act(() => editor.setEditable(false));
    for (const name of ["Duplicate blocks", "Delete blocks", "Move block up", "Move block down"])
      expect(screen.getByRole("menuitem", { name })).toBeDisabled();
    for (const name of ["Turn into", "Text color", "Background color"])
      expect(screen.getByRole("combobox", { name })).toBeDisabled();
    fireEvent.click(screen.getByRole("menuitem", { name: "Duplicate blocks" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Text color" }), {
      target: { value: "#c53030" },
    });
    expect(action).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("menuitem", { name: "Copy blocks" }));
    expect(action).toHaveBeenCalledWith("copy", undefined);
    act(() => editor.setEditable(true));
    expect(screen.getByRole("menuitem", { name: "Duplicate blocks" })).toBeEnabled();
  });
});
