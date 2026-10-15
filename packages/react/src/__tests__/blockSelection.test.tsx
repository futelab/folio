import "@testing-library/jest-dom/vitest";
import { Editor, Extension } from "@tiptap/core";
import type { JSONContent } from "@tiptap/core";
import { NodeSelection, Selection, TextSelection } from "@tiptap/pm/state";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultTiptapExtensions, validateFolioDocument } from "@futelab/folio-core/browser";
import {
  BlockSelection,
  blockSelectionPluginKey,
  canConvertSelectedBlocks,
  clearBlockSelection,
  cloneBlocksWithFreshIds,
  convertSelectedBlocks,
  copySelectedBlocks,
  createBlockSelectionPlugin,
  deleteSelectedBlocks,
  duplicateSelectedBlocks,
  getSelectedBlocks,
  getSelectedBlocksContent,
  moveSelectedBlocks,
  setBlockSelection,
} from "../blocks/blockSelection";

const editors: Editor[] = [];
const paragraph = (text: string, attrs?: Record<string, unknown>): JSONContent => ({
  type: "paragraph",
  attrs,
  content: text ? [{ type: "text", text }] : [],
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
  content: JSONContent[] = [paragraph("First"), paragraph("Second"), paragraph("Third")],
) {
  const element = document.createElement("div");
  document.body.append(element);
  const editor = new Editor({
    element,
    extensions: [
      ...createDefaultTiptapExtensions(),
      Extension.create({
        name: "blockSelection",
        addProseMirrorPlugins: () => [createBlockSelectionPlugin()],
      }),
    ],
    content: { type: "doc", content },
  });
  editors.push(editor);
  return editor;
}
function positions(editor: Editor) {
  const result: number[] = [];
  editor.state.doc.forEach((_node, pos) => result.push(pos));
  return result;
}
function select(editor: Editor, first: number, last = first) {
  const blocks = positions(editor);
  expect(setBlockSelection(editor, blocks[first]!, blocks[last]!)).toBe(true);
}

describe("whole-block selection", () => {
  it("shares its Selection class and plugin key across independently evaluated module copies", async () => {
    vi.resetModules();
    const second = await import("../blocks/blockSelection");
    expect(second.BlockSelection).toBe(BlockSelection);
    expect(second.blockSelectionPluginKey).toBe(blockSelectionPluginKey);
    const editor = createEditor();
    expect(second.setBlockSelection(editor, 0)).toBe(true);
    expect(getSelectedBlocks(editor)).toHaveLength(1);
    expect(Selection.fromJSON(editor.state.doc, editor.state.selection.toJSON())).toBeInstanceOf(
      second.BlockSelection,
    );
  });
  it("selects inclusive forward/reversed ranges without changing the document", () => {
    const editor = createEditor();
    const update = vi.fn();
    editor.on("update", update);
    select(editor, 0, 1);
    expect(editor.state.selection).toBeInstanceOf(BlockSelection);
    expect(getSelectedBlocks(editor).map(({ index }) => index)).toEqual([0, 1]);
    expect(blockSelectionPluginKey.getState(editor.state)).toEqual({
      anchorBlock: 0,
      headBlock: positions(editor)[1],
      from: 0,
      to: positions(editor)[2],
    });
    expect(editor.view.dom.querySelectorAll("[data-folio-block-selected]")).toHaveLength(2);
    select(editor, 1, 0);
    expect((editor.state.selection as BlockSelection).anchorBlock).toBe(positions(editor)[1]);
    expect((editor.state.selection as BlockSelection).headBlock).toBe(0);
    expect(update).not.toHaveBeenCalled();
    expect(editor.can().undo()).toBe(false);
  });
  it("distinguishes ordinary cross-paragraph text selection", () => {
    const editor = createEditor();
    editor.commands.setTextSelection({ from: 2, to: positions(editor)[2]! + 2 });
    expect(getSelectedBlocks(editor)).toEqual([]);
    expect(getSelectedBlocksContent(editor)).toBeNull();
    expect(deleteSelectedBlocks(editor)).toBe(false);
  });
  it("copies complete closed subtrees and independent attributes/content", () => {
    const editor = createEditor([
      {
        type: "callout",
        attrs: { tone: "warning", folioBlockId: "callout-a" },
        content: [paragraph("Nested")],
      },
      { type: "image", attrs: { src: "/image.png", caption: "Caption" } },
      paragraph("After"),
    ]);
    select(editor, 0, 1);
    const original = editor.getJSON();
    const slice = getSelectedBlocksContent(editor)!;
    expect([slice.openStart, slice.openEnd]).toEqual([0, 0]);
    expect(slice.content.toJSON()).toEqual(original.content!.slice(0, 2));
    const copied = copySelectedBlocks(editor);
    copied[0]!.attrs!.tone = "changed";
    copied[0]!.content![0]!.content![0]!.text = "Changed copy";
    expect(editor.getJSON()).toEqual(original);
  });
  it("maps reversed selections through insertions, text edits, and partial deletion", () => {
    const editor = createEditor();
    select(editor, 2, 1);
    editor.view.dispatch(
      editor.state.tr.insert(
        0,
        editor.schema.nodes.paragraph!.create(null, editor.schema.text("Inserted")),
      ),
    );
    expect(getSelectedBlocks(editor).map(({ node }) => node.textContent)).toEqual([
      "Second",
      "Third",
    ]);
    expect((editor.state.selection as BlockSelection).anchorBlock).toBeGreaterThan(
      (editor.state.selection as BlockSelection).headBlock,
    );
    editor.view.dispatch(editor.state.tr.insertText(" edited", editor.state.selection.from + 2));
    expect(getSelectedBlocks(editor)).toHaveLength(2);
    const first = getSelectedBlocks(editor)[0]!;
    editor.view.dispatch(editor.state.tr.delete(first.pos, first.pos + first.node.nodeSize));
    expect(getSelectedBlocks(editor).map(({ node }) => node.textContent)).toEqual(["Third"]);
  });
  it("excludes boundary insertions and clears selection when its entire content is removed", () => {
    const editor = createEditor();
    select(editor, 1);
    const added = editor.schema.nodes.paragraph!.create(null, editor.schema.text("Outside"));
    editor.view.dispatch(editor.state.tr.insert(editor.state.selection.from, added));
    editor.view.dispatch(editor.state.tr.insert(editor.state.selection.to, added));
    expect(getSelectedBlocks(editor).map(({ node }) => node.textContent)).toEqual(["Second"]);
    editor.view.dispatch(
      editor.state.tr.delete(editor.state.selection.from, editor.state.selection.to),
    );
    expect(editor.state.selection).not.toBeInstanceOf(BlockSelection);
    expect(blockSelectionPluginKey.getState(editor.state)).toBeNull();
    expect(editor.view.dom.querySelector("[data-folio-block-selected]")).toBeNull();
  });
  it("supports metadata, clear, JSON, and mapped history bookmarks", () => {
    const editor = createEditor();
    editor.view.dispatch(
      editor.state.tr.setMeta(blockSelectionPluginKey, {
        type: "set",
        anchorBlock: positions(editor)[2],
        headBlock: positions(editor)[1],
      }),
    );
    const selection = editor.state.selection;
    expect(selection).toBeInstanceOf(BlockSelection);
    expect(Selection.fromJSON(editor.state.doc, selection.toJSON()).eq(selection)).toBe(true);
    const transaction = editor.state.tr.insert(0, editor.schema.nodes.paragraph!.create());
    expect(
      selection
        .getBookmark()
        .map(transaction.mapping)
        .resolve(transaction.doc)
        .eq(selection.map(transaction.doc, transaction.mapping)),
    ).toBe(true);
    editor.view.dispatch(editor.state.tr.setMeta(blockSelectionPluginKey, { type: "clear" }));
    expect(getSelectedBlocks(editor)).toEqual([]);
    select(editor, 0);
    expect(clearBlockSelection(editor)).toBe(true);
    expect(clearBlockSelection(editor)).toBe(false);
    expect(setBlockSelection(editor, 1)).toBe(false);
    expect(() =>
      Selection.fromJSON(editor.state.doc, { type: "folio-block", anchorBlock: 1, headBlock: 1 }),
    ).toThrow(RangeError);
  });
});

describe("batch block operations", () => {
  it("deletes exact selected blocks and restores a valid paragraph when deleting everything", () => {
    const editor = createEditor();
    select(editor, 0, 1);
    expect(deleteSelectedBlocks(editor)).toBe(true);
    expect(editor.getText()).toBe("Third");
    select(editor, 0);
    expect(deleteSelectedBlocks(editor)).toBe(true);
    expect(editor.state.doc.childCount).toBe(1);
    expect(editor.state.doc.firstChild?.type.name).toBe("paragraph");
    expect(editor.state.doc.firstChild?.content.size).toBe(0);
    expect(validateFolioDocument(editor.getJSON()).valid).toBe(true);
  });
  it("duplicates nested anchors, rebases fragment links, and keeps mention reference IDs", () => {
    const editor = createEditor([
      {
        type: "callout",
        attrs: { tone: "warning", folioBlockId: "old-callout" },
        content: [
          {
            type: "heading",
            attrs: {
              level: 2,
              id: "old-heading",
              "data-toc-id": "old-heading",
              folioBlockId: "old-heading-block",
            },
            content: [{ type: "text", text: "Heading" }],
          },
          {
            type: "paragraph",
            attrs: { folioBlockId: "old-paragraph" },
            content: [
              {
                type: "text",
                text: "Heading link",
                marks: [{ type: "link", attrs: { href: "#old-heading" } }],
              },
              {
                type: "text",
                text: "Block link",
                marks: [{ type: "link", attrs: { href: "#folio-block-old-callout" } }],
              },
              { type: "mention", attrs: { id: "user-42", label: "Alice" } },
            ],
          },
        ],
      },
      {
        type: "bookmark",
        attrs: { url: "#old-heading", title: "Bookmark", folioBlockId: "bookmark-id" },
      },
      paragraph("After"),
    ]);
    select(editor, 0, 1);
    const original = copySelectedBlocks(editor);
    expect(duplicateSelectedBlocks(editor)).toBe(true);
    const copy = copySelectedBlocks(editor),
      callout = copy[0]!,
      heading = callout.content![0]!,
      linked = callout.content![1]!;
    expect(callout.attrs!.folioBlockId).not.toBe("old-callout");
    expect(heading.attrs!.id).not.toBe("old-heading");
    expect(heading.attrs!["data-toc-id"]).toBe(heading.attrs!.id);
    expect(heading.attrs!.folioBlockId).not.toBe("old-heading-block");
    expect(linked.attrs!.folioBlockId).not.toBe("old-paragraph");
    expect(linked.content![0]!.marks![0]!.attrs!.href).toBe(`#${heading.attrs!.id}`);
    expect(linked.content![1]!.marks![0]!.attrs!.href).toBe(
      `#folio-block-${callout.attrs!.folioBlockId}`,
    );
    expect(linked.content![2]!.attrs!.id).toBe("user-42");
    expect(copy[1]!.attrs!.url).toBe(`#${heading.attrs!.id}`);
    expect(editor.getJSON().content!.slice(0, 2)).toEqual(original);
    expect(validateFolioDocument(editor.getJSON()).valid).toBe(true);
  });
  it("leaves ordinary blocks, null IDs, and external references unchanged during cloning", () => {
    const original = [
      paragraph("Ordinary"),
      {
        type: "paragraph",
        content: [
          { type: "mention", attrs: { id: "person-id", label: "Person" } },
          {
            type: "text",
            text: "External",
            marks: [{ type: "link", attrs: { href: "#outside" } }],
          },
        ],
      },
    ];
    expect(cloneBlocksWithFreshIds(original)).toEqual(original);
  });
  it("moves multiple blocks both ways with original order and identities", () => {
    const editor = createEditor([
      paragraph("A"),
      paragraph("B", { folioBlockId: "b" }),
      paragraph("C", { folioBlockId: "c" }),
      paragraph("D"),
      paragraph("E"),
    ]);
    select(editor, 2, 1);
    const selected = copySelectedBlocks(editor);
    expect(moveSelectedBlocks(editor, editor.state.doc.content.size)).toBe(true);
    expect(editor.getText({ blockSeparator: "|" })).toBe("A|D|E|B|C");
    expect(copySelectedBlocks(editor)).toEqual(selected);
    expect((editor.state.selection as BlockSelection).anchorBlock).toBeGreaterThan(
      (editor.state.selection as BlockSelection).headBlock,
    );
    expect(moveSelectedBlocks(editor, 0)).toBe(true);
    expect(editor.getText({ blockSeparator: "|" })).toBe("B|C|A|D|E");
    expect(copySelectedBlocks(editor)).toEqual(selected);
  });
  it("makes invalid, unchanged and whole-document moves genuine no-ops", () => {
    const editor = createEditor();
    select(editor, 0, 1);
    const transaction = vi.fn();
    editor.on("transaction", transaction);
    expect(moveSelectedBlocks(editor, editor.state.selection.from)).toBe(false);
    expect(moveSelectedBlocks(editor, editor.state.selection.to)).toBe(false);
    expect(moveSelectedBlocks(editor, 1)).toBe(false);
    expect(convertSelectedBlocks(editor, "paragraph")).toBe(false);
    expect(canConvertSelectedBlocks(editor, "paragraph")).toBe(false);
    expect(transaction).not.toHaveBeenCalled();
    expect(editor.can().undo()).toBe(false);
    select(editor, 0, 2);
    expect(moveSelectedBlocks(editor, editor.state.doc.content.size)).toBe(false);
  });
  it("allows copying while read-only but prevents all writing commands", () => {
    const editor = createEditor();
    editor.setEditable(false);
    select(editor, 0, 1);
    const original = editor.getJSON(),
      update = vi.fn();
    editor.on("update", update);
    expect(copySelectedBlocks(editor)).toHaveLength(2);
    expect(deleteSelectedBlocks(editor)).toBe(false);
    expect(duplicateSelectedBlocks(editor)).toBe(false);
    expect(convertSelectedBlocks(editor, "heading", { level: 2 })).toBe(false);
    expect(moveSelectedBlocks(editor, editor.state.doc.content.size)).toBe(false);
    expect(editor.getJSON()).toEqual(original);
    expect(update).not.toHaveBeenCalled();
    expect(clearBlockSelection(editor)).toBe(true);
    editor.destroy();
    expect(getSelectedBlocks(editor)).toEqual([]);
    expect(setBlockSelection(editor, 0)).toBe(false);
    expect(deleteSelectedBlocks(null)).toBe(false);
    expect(getSelectedBlocksContent(null)).toBeNull();
  });
  it.each(["delete", "duplicate", "convert", "move"] as const)(
    "gives %s its own undo event between typing events",
    (operation) => {
      const editor = createEditor();
      editor.commands.setTextSelection(6);
      editor.commands.insertContent(" edited");
      const typed = editor.getJSON();
      select(editor, 0, 1);
      const update = vi.fn();
      editor.on("update", update);
      const changed =
        operation === "delete"
          ? deleteSelectedBlocks(editor)
          : operation === "duplicate"
            ? duplicateSelectedBlocks(editor)
            : operation === "convert"
              ? convertSelectedBlocks(editor, "heading", { level: 2 })
              : moveSelectedBlocks(editor, editor.state.doc.content.size);
      expect(changed).toBe(true);
      expect(update).toHaveBeenCalledTimes(1);
      const operated = editor.getJSON();
      editor.view.dispatch(
        editor.state.tr
          .setSelection(TextSelection.create(editor.state.doc, 1))
          .insertText("Later "),
      );
      expect(editor.commands.undo()).toBe(true);
      expect(editor.getJSON()).toEqual(operated);
      expect(editor.commands.undo()).toBe(true);
      expect(editor.getJSON()).toEqual(typed);
      expect(getSelectedBlocks(editor)).toHaveLength(2);
      expect(editor.commands.redo()).toBe(true);
      expect(editor.getJSON()).toEqual(operated);
    },
  );
});

describe("nested node selection menu operations", () => {
  function selectNode(editor: Editor, type: string, text?: string) {
    let position = -1;
    editor.state.doc.descendants((node, pos) => {
      if (
        position < 0 &&
        node.type.name === type &&
        (text === undefined || node.textContent === text)
      )
        position = pos;
    });
    expect(position).toBeGreaterThanOrEqual(0);
    editor.view.dispatch(
      editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, position)),
    );
    return position;
  }
  it("copies and duplicates only the nested block, preserving its container and node selection", () => {
    const editor = createEditor([
      {
        type: "callout",
        attrs: { tone: "warning", folioBlockId: "outer" },
        content: [paragraph("Nested", { folioBlockId: "inner" }), paragraph("Sibling")],
      },
      paragraph("After"),
    ]);
    const position = selectNode(editor, "paragraph", "Nested");
    expect(getSelectedBlocks(editor).map(({ pos, node }) => [pos, node.textContent])).toEqual([
      [position, "Nested"],
    ]);
    const slice = getSelectedBlocksContent(editor)!;
    expect([slice.openStart, slice.openEnd, slice.content.firstChild?.type.name]).toEqual([
      0,
      0,
      "paragraph",
    ]);
    expect(duplicateSelectedBlocks(editor)).toBe(true);
    expect(editor.state.selection).toBeInstanceOf(NodeSelection);
    expect(editor.state.selection.$from.parent.type.name).toBe("callout");
    expect(editor.state.doc.firstChild?.attrs).toMatchObject({
      tone: "warning",
      folioBlockId: "outer",
    });
    expect(editor.state.doc.firstChild?.childCount).toBe(3);
    expect(getSelectedBlocks(editor)[0]!.node.attrs.folioBlockId).not.toBe("inner");
    expect(moveSelectedBlocks(editor, editor.state.doc.content.size)).toBe(false);
    expect(editor.commands.undo()).toBe(true);
    expect(editor.state.doc.firstChild?.childCount).toBe(2);
    expect(getSelectedBlocks(editor)[0]!.node.attrs.folioBlockId).toBe("inner");
  });
  it("converts the nested node in its real parent and retains the selected node", () => {
    const editor = createEditor([
      {
        type: "columns",
        content: [
          {
            type: "column",
            attrs: { width: 60 },
            content: [paragraph("Nested", { folioBlockId: "inner" })],
          },
          { type: "column", attrs: { width: 40 }, content: [paragraph("Other")] },
        ],
      },
      paragraph("After"),
    ]);
    selectNode(editor, "paragraph", "Nested");
    expect(canConvertSelectedBlocks(editor, "heading", { level: 2 })).toBe(true);
    expect(convertSelectedBlocks(editor, "heading", { level: 2 })).toBe(true);
    expect(editor.state.selection).toBeInstanceOf(NodeSelection);
    expect(editor.state.selection.$from.parent.type.name).toBe("column");
    expect(getSelectedBlocks(editor)[0]!.node.attrs).toMatchObject({
      level: 2,
      folioBlockId: "inner",
    });
    expect(editor.state.doc.firstChild?.firstChild?.attrs.width).toBe(60);
    expect(validateFolioDocument(editor.getJSON()).valid).toBe(true);
    expect(editor.commands.undo()).toBe(true);
    expect(getSelectedBlocks(editor)[0]!.node.type.name).toBe("paragraph");
  });
  it.each(["callout", "column", "listItem"])(
    "leaves a schema-valid empty %s after deleting its last content block",
    (parent) => {
      const inner =
        parent === "column"
          ? {
              type: "columns",
              content: [
                { type: "column", content: [paragraph("Delete")] },
                { type: "column", content: [paragraph("Keep")] },
              ],
            }
          : parent === "listItem"
            ? {
                type: "bulletList",
                content: [{ type: "listItem", content: [paragraph("Delete")] }],
              }
            : { type: "callout", attrs: { tone: "warning" }, content: [paragraph("Delete")] };
      const editor = createEditor([inner, paragraph("After")]);
      selectNode(editor, "paragraph", "Delete");
      expect(deleteSelectedBlocks(editor)).toBe(true);
      let container: ProseMirrorNode | undefined;
      editor.state.doc.descendants((node) => {
        if (node.type.name === parent && !container) container = node;
      });
      expect(container!.firstChild?.type.name).toBe("paragraph");
      expect(container!.firstChild?.textContent).toBe("");
      expect(editor.state.selection.$from.parent.type.name).toBe("paragraph");
      expect(validateFolioDocument(editor.getJSON()).valid).toBe(true);
      expect(editor.getText()).toContain("After");
    },
  );
  it("refuses structural selections and conversions that violate list item schema", () => {
    const editor = createEditor([
      {
        type: "columns",
        content: [
          {
            type: "column",
            content: [
              { type: "bulletList", content: [{ type: "listItem", content: [paragraph("Item")] }] },
            ],
          },
          { type: "column", content: [paragraph("Other")] },
        ],
      },
    ]);
    selectNode(editor, "column");
    expect(getSelectedBlocks(editor)).toEqual([]);
    expect(deleteSelectedBlocks(editor)).toBe(false);
    expect(duplicateSelectedBlocks(editor)).toBe(false);
    selectNode(editor, "paragraph", "Item");
    expect(canConvertSelectedBlocks(editor, "heading", { level: 2 })).toBe(false);
    expect(convertSelectedBlocks(editor, "heading", { level: 2 })).toBe(false);
    editor.setEditable(false);
    expect(duplicateSelectedBlocks(editor)).toBe(false);
    expect(deleteSelectedBlocks(editor)).toBe(false);
    expect(copySelectedBlocks(editor)).toHaveLength(1);
  });
});

describe("loss-aware conversions", () => {
  it("preserves text, marks and common IDs when changing paragraph/heading types", () => {
    const editor = createEditor([
      paragraph("A", { folioBlockId: "a" }),
      { type: "paragraph", content: [{ type: "text", text: "Bold", marks: [{ type: "bold" }] }] },
      paragraph("Last"),
    ]);
    select(editor, 0, 1);
    expect(canConvertSelectedBlocks(editor, "heading", { level: 2 })).toBe(true);
    expect(convertSelectedBlocks(editor, "heading", { level: 2 })).toBe(true);
    const selected = copySelectedBlocks(editor);
    expect(selected.map(({ type }) => type)).toEqual(["heading", "heading"]);
    expect(selected[0]!.attrs).toMatchObject({ level: 2, folioBlockId: "a" });
    expect(selected[1]!.content![0]!.marks).toContainEqual({ type: "bold" });
  });
  it.each(["bulletList", "orderedList", "taskList"])(
    "groups paragraphs into one %s and preserves original paragraph IDs",
    (type) => {
      const editor = createEditor([
        paragraph("A", { folioBlockId: "a" }),
        paragraph("B", { folioBlockId: "b" }),
        paragraph("Last"),
      ]);
      select(editor, 0, 1);
      expect(convertSelectedBlocks(editor, type)).toBe(true);
      const [list] = copySelectedBlocks(editor);
      expect(list!.type).toBe(type);
      expect(list!.content!.map((item) => item.content![0]!.attrs!.folioBlockId)).toEqual([
        "a",
        "b",
      ]);
      expect(editor.state.doc.childCount).toBe(2);
      expect(validateFolioDocument(editor.getJSON()).valid).toBe(true);
    },
  );
  it("changes list kind while retaining nested contents and list identity", () => {
    const editor = createEditor([
      {
        type: "orderedList",
        attrs: { start: 4, folioBlockId: "list-a" },
        content: [
          {
            type: "listItem",
            content: [
              paragraph("Item"),
              {
                type: "bulletList",
                content: [{ type: "listItem", content: [paragraph("Nested")] }],
              },
            ],
          },
        ],
      },
      paragraph("Last"),
    ]);
    select(editor, 0);
    const nested = copySelectedBlocks(editor)[0]!.content![0]!.content![1];
    expect(convertSelectedBlocks(editor, "taskList")).toBe(true);
    const [list] = copySelectedBlocks(editor);
    expect(list!.attrs!.folioBlockId).toBe("list-a");
    expect(list!.content![0]!.attrs!.checked).toBe(false);
    expect(list!.content![0]!.content![1]).toEqual(nested);
  });
  it.each(["callout", "blockquote"])(
    "wraps complete composite blocks in %s without flattening",
    (type) => {
      const editor = createEditor([
        {
          type: "callout",
          attrs: { tone: "warning", folioBlockId: "nested" },
          content: [paragraph("Nested")],
        },
        paragraph("After"),
        paragraph("Last"),
      ]);
      select(editor, 0, 1);
      const original = copySelectedBlocks(editor);
      expect(convertSelectedBlocks(editor, type)).toBe(true);
      expect(copySelectedBlocks(editor)[0]!.content).toEqual(original);
      expect(validateFolioDocument(editor.getJSON()).valid).toBe(true);
    },
  );
  it("rejects composite flattening, discarded marks, authored anchors and invalid target attributes", () => {
    const editor = createEditor([
      { type: "callout", attrs: { tone: "warning" }, content: [paragraph("Composite")] },
      { type: "paragraph", content: [{ type: "text", text: "Bold", marks: [{ type: "bold" }] }] },
      {
        type: "heading",
        attrs: { level: 2, id: "author", "data-toc-id": "generated" },
        content: [{ type: "text", text: "Heading" }],
      },
      paragraph("Last"),
    ]);
    const original = editor.getJSON();
    select(editor, 0);
    expect(convertSelectedBlocks(editor, "paragraph")).toBe(false);
    expect(convertSelectedBlocks(editor, "bulletList")).toBe(false);
    select(editor, 1);
    expect(canConvertSelectedBlocks(editor, "codeBlock")).toBe(false);
    expect(convertSelectedBlocks(editor, "codeBlock")).toBe(false);
    expect(convertSelectedBlocks(editor, "heading", { level: 99 })).toBe(false);
    expect(convertSelectedBlocks(editor, "heading", { unknown: "value" })).toBe(false);
    select(editor, 2);
    expect(convertSelectedBlocks(editor, "paragraph")).toBe(false);
    expect(editor.getJSON()).toEqual(original);
  });
});
