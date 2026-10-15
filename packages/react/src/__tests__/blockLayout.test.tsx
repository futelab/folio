import { Editor, Extension } from "@tiptap/core";
import type { JSONContent } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultTiptapExtensions, validateFolioDocument } from "@futelab/folio-core/browser";
import { createBlockSelectionPlugin, setBlockSelection } from "../blocks/blockSelection";
import {
  canMoveBlockRange,
  createColumns,
  getBlockContainers,
  moveBlockRange,
  removeColumns,
  resolveLayoutBlock,
  setColumnWidths,
} from "../blocks/blockLayout";

const editors: Editor[] = [];
const paragraph = (text: string, id?: string): JSONContent => ({
  type: "paragraph",
  attrs: id ? { folioBlockId: id } : undefined,
  content: text ? [{ type: "text", text }] : [],
});
const callout = (content: JSONContent[], id = "container"): JSONContent => ({
  type: "callout",
  attrs: { tone: "warning", folioBlockId: id },
  content,
});
const columns = (): JSONContent => ({
  type: "columns",
  content: [
    { type: "column", attrs: { width: 60 }, content: [paragraph("A", "a")] },
    { type: "column", attrs: { width: 40 }, content: [paragraph("B", "b")] },
  ],
});
beforeAll(() => {
  if (!Range.prototype.getBoundingClientRect)
    Range.prototype.getBoundingClientRect = () => new DOMRect(0, 0, 20, 20);
  if (!Range.prototype.getClientRects)
    Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
});
beforeEach(() => {
  vi.spyOn(window, "scrollBy").mockImplementation(() => {});
});
afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});
function createEditor(
  content: JSONContent[] = [paragraph("A", "a"), paragraph("B", "b"), paragraph("Last")],
) {
  const editor = new Editor({
    extensions: [
      ...createDefaultTiptapExtensions(),
      Extension.create({
        name: "blockSelection",
        addProseMirrorPlugins: () => [createBlockSelectionPlugin()],
      }),
    ],
    content: { type: "doc", content },
  });
  document.body.append(editor.view.dom);
  editors.push(editor);
  return editor;
}
function find(editor: Editor, type: string, index = 0) {
  const found: Array<{ node: ProseMirrorNode; pos: number }> = [];
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === type) found.push({ node, pos });
  });
  return found[index]!;
}
function byId(editor: Editor, id: string) {
  let found: { node: ProseMirrorNode; pos: number } | undefined;
  editor.state.doc.descendants((node, pos) => {
    if (node.attrs.folioBlockId === id) found = { node, pos };
  });
  if (!found) throw new Error(`Missing ${id}`);
  return found;
}
function range(entry: { node: ProseMirrorNode; pos: number }) {
  return { from: entry.pos, to: entry.pos + entry.node.nodeSize };
}

describe("column layout commands", () => {
  it("creates two weighted columns from selected blocks and unwraps them without changing child identities", () => {
    const editor = createEditor();
    const original = editor.getJSON();
    setBlockSelection(editor, 0, editor.state.doc.child(0).nodeSize);
    expect(createColumns(editor, 2, [60, 40])).toBe(true);
    const layout = find(editor, "columns");
    expect(layout.node.childCount).toBe(2);
    expect(layout.node.child(0).attrs.width).toBe(60);
    expect(layout.node.child(1).attrs.width).toBe(40);
    expect(layout.node.child(0).firstChild?.attrs.folioBlockId).toBe("a");
    expect(layout.node.child(1).firstChild?.attrs.folioBlockId).toBe("b");
    expect(validateFolioDocument(editor.getJSON()).valid).toBe(true);
    expect(removeColumns(editor, layout.pos)).toBe(true);
    expect(editor.getJSON()).toEqual(original);
  });
  it("creates three columns with valid empty paragraphs and rejects invalid counts or weights", () => {
    const editor = createEditor();
    const original = editor.getJSON();
    expect(createColumns(editor, -1)).toBe(false);
    expect(createColumns(editor, 4)).toBe(false);
    expect(createColumns(editor, 2, [0, 100])).toBe(false);
    expect(createColumns(editor, 2, [1])).toBe(false);
    expect(editor.getJSON()).toEqual(original);
    expect(createColumns(editor, 3)).toBe(true);
    const layout = find(editor, "columns").node;
    expect(layout.childCount).toBe(3);
    expect(layout.child(2).firstChild?.type.name).toBe("paragraph");
    expect(validateFolioDocument(editor.getJSON()).valid).toBe(true);
  });
  it("updates column widths without changing content/IDs and keeps each update independently undoable", () => {
    const editor = createEditor([columns(), paragraph("Last")]);
    const original = editor.getJSON();
    expect(setColumnWidths(editor, 0, [25, 75])).toBe(true);
    expect(find(editor, "columns").node.child(0).attrs.width).toBe(25);
    expect(byId(editor, "a").node.textContent).toBe("A");
    expect(setColumnWidths(editor, 0, [25, 75])).toBe(false);
    expect(setColumnWidths(editor, 0, [NaN, 1])).toBe(false);
    expect(editor.commands.undo()).toBe(true);
    expect(editor.getJSON()).toEqual(original);
  });
  it("does not silently delete linked structural anchors when removing a layout", () => {
    const content = columns();
    content.attrs = { folioBlockId: "linked-layout" };
    const editor = createEditor([content, paragraph("Last")]);
    const original = editor.getJSON();
    expect(removeColumns(editor, 0)).toBe(false);
    expect(editor.getJSON()).toEqual(original);
    editor.view.dispatch(editor.state.tr.setNodeMarkup(0, undefined, { folioBlockId: null }));
    editor.view.dispatch(
      editor.state.tr.setNodeMarkup(1, undefined, {
        ...editor.state.doc.nodeAt(1)!.attrs,
        folioBlockId: "linked-column",
      }),
    );
    expect(removeColumns(editor, 0)).toBe(false);
  });
});

describe("schema-safe nested block movement", () => {
  it("resolves nested block/container positions without treating table cells as block containers", () => {
    const editor = createEditor([
      columns(),
      callout([paragraph("Nested", "nested")]),
      paragraph("Last"),
    ]);
    const nested = byId(editor, "nested");
    expect(resolveLayoutBlock(editor, nested.pos + 2)?.pos).toBe(nested.pos);
    expect(getBlockContainers(editor).map(({ node }) => node.type.name)).toEqual([
      "doc",
      "column",
      "column",
      "callout",
    ]);
    expect(resolveLayoutBlock(editor, -1)).toBeNull();
  });
  it("moves a full compound block into a callout without flattening it", () => {
    const nested = callout([paragraph("Inner", "inner")], "inner-container");
    const editor = createEditor([
      nested,
      callout([paragraph("Existing")], "outer"),
      paragraph("Last"),
    ]);
    const source = byId(editor, "inner-container"),
      original = source.node.toJSON();
    const destination = byId(editor, "outer");
    expect(canMoveBlockRange(editor, range(source), { parentPos: destination.pos, index: 0 })).toBe(
      true,
    );
    expect(moveBlockRange(editor, range(source), { parentPos: destination.pos, index: 0 })).toBe(
      true,
    );
    expect(byId(editor, "outer").node.firstChild?.toJSON()).toEqual(original);
    expect(validateFolioDocument(editor.getJSON()).valid).toBe(true);
  });
  it("moves the last child out of a callout and preserves the container with a paragraph", () => {
    const editor = createEditor([callout([paragraph("Nested", "nested")]), paragraph("Last")]);
    const source = byId(editor, "nested"),
      original = source.node.toJSON();
    expect(moveBlockRange(editor, range(source), { parentPos: null, index: 2 })).toBe(true);
    const container = byId(editor, "container").node;
    expect(container.attrs.tone).toBe("warning");
    expect(container.firstChild?.type.name).toBe("paragraph");
    expect(container.firstChild?.textContent).toBe("");
    expect(editor.state.doc.lastChild?.toJSON()).toEqual(original);
    expect(validateFolioDocument(editor.getJSON()).valid).toBe(true);
  });
  it("moves between columns and leaves the source column valid with its original width", () => {
    const editor = createEditor([columns(), paragraph("Last")]);
    const source = byId(editor, "a"),
      target = find(editor, "column", 1);
    expect(moveBlockRange(editor, range(source), { parentPos: target.pos, index: 1 })).toBe(true);
    const layout = find(editor, "columns").node;
    expect(layout.child(0).attrs.width).toBe(60);
    expect(layout.child(0).firstChild?.textContent).toBe("");
    expect(layout.child(1).content.childCount).toBe(2);
    expect(layout.child(1).lastChild?.attrs.folioBlockId).toBe("a");
    expect(validateFolioDocument(editor.getJSON()).valid).toBe(true);
  });
  it("moves into and out of detailsContent while keeping fixed summary/open structure", () => {
    const editor = createEditor([
      {
        type: "details",
        attrs: { open: true },
        content: [
          { type: "detailsSummary", content: [{ type: "text", text: "Summary" }] },
          { type: "detailsContent", content: [paragraph("Body", "body")] },
        ],
      },
      paragraph("Last"),
    ]);
    const source = byId(editor, "body");
    expect(moveBlockRange(editor, range(source), { parentPos: null, index: 1 })).toBe(true);
    expect(find(editor, "details").node.attrs.open).toBe(true);
    expect(find(editor, "detailsSummary").node.textContent).toBe("Summary");
    expect(find(editor, "detailsContent").node.firstChild?.type.name).toBe("paragraph");
    const destination = find(editor, "detailsContent");
    expect(
      moveBlockRange(editor, range(byId(editor, "body")), { parentPos: destination.pos, index: 1 }),
    ).toBe(true);
    expect(find(editor, "detailsContent").node.lastChild?.attrs.folioBlockId).toBe("body");
    expect(validateFolioDocument(editor.getJSON()).valid).toBe(true);
  });
  it("wraps blocks entering task lists and preserves checked/nested content when an item moves out", () => {
    const editor = createEditor([
      paragraph("Incoming", "incoming"),
      {
        type: "taskList",
        attrs: { folioBlockId: "tasks" },
        content: [
          {
            type: "taskItem",
            attrs: { checked: true },
            content: [paragraph("Checked", "checked"), callout([paragraph("Nested")], "in-task")],
          },
        ],
      },
      paragraph("Last"),
    ]);
    expect(
      moveBlockRange(editor, range(byId(editor, "incoming")), {
        parentPos: byId(editor, "tasks").pos,
        index: 1,
      }),
    ).toBe(true);
    expect(find(editor, "taskItem", 1).node.firstChild?.attrs.folioBlockId).toBe("incoming");
    const checked = find(editor, "taskItem"),
      original = checked.node.toJSON();
    expect(moveBlockRange(editor, range(checked), { parentPos: null, index: 2 })).toBe(true);
    expect(editor.state.doc.child(2).type.name).toBe("taskList");
    expect(editor.state.doc.child(2).firstChild?.toJSON()).toEqual(original);
    expect(byId(editor, "tasks").node.childCount).toBe(1);
    expect(validateFolioDocument(editor.getJSON()).valid).toBe(true);
  });
  it("rejects structural-slot moves, descendants, task-kind loss, invalid positions, and no-ops", () => {
    const editor = createEditor([
      columns(),
      callout([paragraph("Inside", "inside")]),
      {
        type: "taskList",
        content: [{ type: "taskItem", attrs: { checked: true }, content: [paragraph("Task")] }],
      },
      { type: "bulletList", content: [{ type: "listItem", content: [paragraph("Bullet")] }] },
      paragraph("Last"),
    ]);
    const original = editor.getJSON(),
      transaction = vi.fn();
    editor.on("transaction", transaction);
    expect(
      moveBlockRange(editor, range(find(editor, "column")), { parentPos: null, index: 0 }),
    ).toBe(false);
    expect(
      moveBlockRange(editor, range(byId(editor, "container")), {
        parentPos: byId(editor, "container").pos,
        index: 0,
      }),
    ).toBe(false);
    expect(
      moveBlockRange(editor, range(find(editor, "columns")), {
        parentPos: find(editor, "column").pos,
        index: 0,
      }),
    ).toBe(false);
    expect(
      moveBlockRange(editor, range(find(editor, "taskItem")), {
        parentPos: find(editor, "bulletList").pos,
        index: 0,
      }),
    ).toBe(false);
    expect(moveBlockRange(editor, { from: 2, to: 3 }, { parentPos: null, index: 0 })).toBe(false);
    expect(
      moveBlockRange(editor, range(byId(editor, "inside")), {
        parentPos: byId(editor, "container").pos,
        index: 1,
      }),
    ).toBe(false);
    expect(editor.getJSON()).toEqual(original);
    expect(transaction).not.toHaveBeenCalled();
  });
  it("moves a selected range together and isolates its undo from typing", () => {
    const editor = createEditor([
      paragraph("A", "a"),
      paragraph("B", "b"),
      callout([paragraph("Existing")]),
      paragraph("Last"),
    ]);
    editor.commands.setTextSelection(2);
    editor.commands.insertContent(" edited");
    const typed = editor.getJSON();
    const first = byId(editor, "a"),
      second = byId(editor, "b");
    setBlockSelection(editor, first.pos, second.pos);
    const update = vi.fn();
    editor.on("update", update);
    expect(
      moveBlockRange(
        editor,
        { from: first.pos, to: second.pos + second.node.nodeSize },
        { parentPos: byId(editor, "container").pos, index: 1 },
      ),
    ).toBe(true);
    expect(update).toHaveBeenCalledTimes(1);
    expect(byId(editor, "container").node.childCount).toBe(3);
    expect(editor.commands.undo()).toBe(true);
    expect(editor.getJSON()).toEqual(typed);
    expect(editor.commands.redo()).toBe(true);
    expect(byId(editor, "container").node.childCount).toBe(3);
  });
  it("blocks writes in read-only mode", () => {
    const editor = createEditor([
      columns(),
      callout([paragraph("Nested", "nested")]),
      paragraph("Last"),
    ]);
    const original = editor.getJSON(),
      source = range(byId(editor, "nested"));
    editor.setEditable(false);
    expect(moveBlockRange(editor, source, { parentPos: null, index: 0 })).toBe(false);
    expect(canMoveBlockRange(editor, source, { parentPos: null, index: 0 })).toBe(false);
    expect(createColumns(editor)).toBe(false);
    expect(removeColumns(editor, 0)).toBe(false);
    expect(setColumnWidths(editor, 0, [1, 1])).toBe(false);
    expect(editor.getJSON()).toEqual(original);
  });
});
