import { Editor, Extension, Node as TiptapNode } from "@tiptap/core";
import type { AnyExtension, JSONContent } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultTiptapExtensions } from "@futelab/folio-core/browser";
import {
  getBlockDropTarget,
  getDocumentInsertPosition,
  getEdgeScrollSpeed,
  getTopLevelBlockPosition,
  getTopLevelBlocks,
  moveBlock,
  scrollBlockDrag,
} from "../blocks/blockDrag";

const editors: Editor[] = [];
const paragraph = (text: string): JSONContent => ({
  type: "paragraph",
  content: [{ type: "text", text }],
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
  extraExtensions: AnyExtension[] = [],
) {
  const element = document.createElement("div");
  document.body.append(element);
  const editor = new Editor({
    element,
    extensions: [...createDefaultTiptapExtensions(), ...extraExtensions],
    content: { type: "doc", content },
  });
  editors.push(editor);
  return editor;
}

describe("block movement model", () => {
  it("resolves model positions through root widgets and nested node-view wrappers", () => {
    const wrapped = TiptapNode.create({
      name: "wrappedBlock",
      group: "block",
      content: "inline*",
      renderHTML: () => ["section", { "data-wrapped-block": "" }, 0],
      addNodeView() {
        return () => {
          const dom = document.createElement("section");
          const wrapper = document.createElement("div");
          const contentDOM = document.createElement("p");
          wrapper.append(contentDOM);
          dom.append(wrapper);
          return { dom, contentDOM };
        };
      },
    });
    const widgets = Extension.create({
      name: "rootWidgets",
      addProseMirrorPlugins: () => [
        new Plugin({
          props: {
            decorations: (state) =>
              DecorationSet.create(state.doc, [
                Decoration.widget(0, () => {
                  const widget = document.createElement("span");
                  widget.className = "ProseMirror-gapcursor";
                  return widget;
                }),
              ]),
          },
        }),
      ],
    });
    const editor = createEditor(
      [
        paragraph("First"),
        { type: "wrappedBlock", content: [{ type: "text", text: "Wrapped" }] },
        paragraph("Last"),
      ],
      [wrapped, widgets],
    );
    expect(editor.view.dom.children).toHaveLength(4);
    const blocks = getTopLevelBlocks(editor);
    expect(blocks.map(({ node, pos }) => [node.type.name, pos])).toEqual([
      ["paragraph", 0],
      ["wrappedBlock", editor.state.doc.child(0).nodeSize],
      ["paragraph", editor.state.doc.child(0).nodeSize + editor.state.doc.child(1).nodeSize],
    ]);
    expect(getTopLevelBlockPosition(editor, blocks[1]!.element.querySelector("p"))).toEqual(
      blocks[1],
    );
    expect(
      getTopLevelBlockPosition(
        editor,
        editor.view.dom.querySelector<HTMLElement>(".ProseMirror-gapcursor"),
      ),
    ).toBeNull();
    expect(moveBlock(editor, blocks[1]!.element, blocks[0]!.element, "before", false)).toBe(true);
    expect(editor.state.doc.firstChild?.type.name).toBe("wrappedBlock");
    expect(editor.state.doc.firstChild?.textContent).toBe("Wrapped");
  });

  it.each<JSONContent>([
    {
      type: "callout",
      attrs: { tone: "warning" },
      content: [
        paragraph("Callout title"),
        {
          type: "bulletList",
          content: [{ type: "listItem", content: [paragraph("Nested item")] }],
        },
      ],
    },
    {
      type: "taskList",
      content: [
        { type: "taskItem", attrs: { checked: true }, content: [paragraph("Checked task")] },
      ],
    },
    {
      type: "details",
      attrs: { open: true },
      content: [
        { type: "detailsSummary", content: [{ type: "text", text: "Summary" }] },
        { type: "detailsContent", content: [paragraph("Hidden or expanded content")] },
      ],
    },
    {
      type: "table",
      content: [
        {
          type: "tableRow",
          content: [
            {
              type: "tableHeader",
              attrs: { colspan: 2, colwidth: [120, 180] },
              content: [paragraph("Merged header")],
            },
          ],
        },
        {
          type: "tableRow",
          content: [
            { type: "tableCell", attrs: { colwidth: [120] }, content: [paragraph("A")] },
            { type: "tableCell", attrs: { colwidth: [180] }, content: [paragraph("B")] },
          ],
        },
      ],
    },
    {
      type: "image",
      attrs: {
        src: "/image.png",
        alt: "Alternative text",
        caption: "Caption",
        title: "Image title",
      },
    },
    {
      type: "bookmark",
      attrs: { url: "https://example.com/", title: "Bookmark title", description: "Description" },
    },
  ])("moves the entire $type subtree and attributes without flattening its content", (content) => {
    const editor = createEditor([
      paragraph("Before"),
      content,
      paragraph("After"),
      paragraph("Last"),
    ]);
    const original = editor.state.doc.child(1).toJSON();
    const blocks = getTopLevelBlocks(editor);
    const nestedContent =
      blocks[1]!.element.querySelector<HTMLElement>("p, summary, figcaption, a") ??
      blocks[1]!.element;
    expect(moveBlock(editor, nestedContent, blocks[2]!.element, "after", false)).toBe(true);
    expect(editor.state.doc.childCount).toBe(4);
    expect(editor.state.doc.child(0).textContent).toBe("Before");
    expect(editor.state.doc.child(1).textContent).toBe("After");
    expect(editor.state.doc.child(2).toJSON()).toEqual(original);
    expect(editor.state.doc.child(3).textContent).toBe("Last");
  });

  it("isolates the move from preceding and subsequent typing in undo and redo", () => {
    const editor = createEditor();
    const original = editor.getJSON();
    editor.commands.setTextSelection(6);
    editor.commands.insertContent(" edited");
    const typed = editor.getJSON();
    const update = vi.fn();
    editor.on("update", update);
    const blocks = getTopLevelBlocks(editor);
    expect(moveBlock(editor, blocks[0]!.element, blocks[2]!.element, "after", false)).toBe(true);
    const moved = editor.getJSON();
    expect(update).toHaveBeenCalledTimes(1);
    editor.commands.insertContent("Later ");
    expect(editor.commands.undo()).toBe(true);
    expect(editor.getJSON()).toEqual(moved);
    expect(editor.commands.undo()).toBe(true);
    expect(editor.getJSON()).toEqual(typed);
    expect(editor.commands.undo()).toBe(true);
    expect(editor.getJSON()).toEqual(original);
    expect(editor.commands.redo()).toBe(true);
    expect(editor.getJSON()).toEqual(typed);
    expect(editor.commands.redo()).toBe(true);
    expect(editor.getJSON()).toEqual(moved);
  });

  it("does not dispatch or create history for self, adjacent, detached, or foreign targets", () => {
    const editor = createEditor();
    const foreign = createEditor();
    const blocks = getTopLevelBlocks(editor);
    const transaction = vi.fn();
    editor.on("transaction", transaction);
    const unchanged = editor.getJSON();
    expect(moveBlock(editor, blocks[0]!.element, blocks[0]!.element, "before", false)).toBe(false);
    expect(moveBlock(editor, blocks[0]!.element, blocks[1]!.element, "before", false)).toBe(false);
    expect(moveBlock(editor, blocks[1]!.element, blocks[0]!.element, "after", false)).toBe(false);
    expect(moveBlock(editor, blocks[0]!.element, document.createElement("p"), "after", false)).toBe(
      false,
    );
    expect(
      moveBlock(editor, blocks[0]!.element, getTopLevelBlocks(foreign)[0]!.element, "after", false),
    ).toBe(false);
    expect(editor.getJSON()).toEqual(unchanged);
    expect(transaction).not.toHaveBeenCalled();
    expect(editor.can().undo()).toBe(false);
  });

  it("rejects read-only, destroyed, and absent editors", () => {
    const editor = createEditor();
    const blocks = getTopLevelBlocks(editor);
    const unchanged = editor.getJSON();
    editor.setEditable(false);
    expect(moveBlock(editor, blocks[0]!.element, blocks[2]!.element, "after", false)).toBe(false);
    expect(editor.getJSON()).toEqual(unchanged);
    editor.destroy();
    expect(moveBlock(editor, blocks[0]!.element, blocks[2]!.element, "after", false)).toBe(false);
    expect(getTopLevelBlocks(editor)).toEqual([]);
    expect(getTopLevelBlocks(null)).toEqual([]);
    expect(moveBlock(null, blocks[0]!.element, blocks[2]!.element, "after", false)).toBe(false);
  });

  it("maps upward and downward insertions and rejects every unchanged boundary", () => {
    const editor = createEditor();
    const [first, second, third] = getTopLevelBlocks(editor);
    expect(getDocumentInsertPosition(first!, third!, "after")).toBe(
      second!.node.nodeSize + third!.node.nodeSize,
    );
    expect(getDocumentInsertPosition(third!, first!, "before")).toBe(0);
    expect(getDocumentInsertPosition(first!, first!, "before")).toBeNull();
    expect(getDocumentInsertPosition(first!, first!, "after")).toBeNull();
    expect(getDocumentInsertPosition(first!, second!, "before")).toBeNull();
    expect(getDocumentInsertPosition(second!, first!, "after")).toBeNull();
  });
});

describe("block drop geometry", () => {
  function geometry() {
    const editor = createEditor([
      paragraph("First"),
      paragraph("Tall multiline block"),
      paragraph("Third"),
      paragraph("Last"),
    ]);
    const blocks = getTopLevelBlocks(editor);
    for (const [index, [top, height]] of [
      [10, 30],
      [80, 200],
      [320, 30],
      [400, 30],
    ].entries()) {
      vi.spyOn(blocks[index]!.element, "getBoundingClientRect").mockReturnValue(
        new DOMRect(40, top, 480, height),
      );
    }
    return blocks;
  }

  it("uses full multiline block bounds and places the indicator in the actual block gap", () => {
    const blocks = geometry();
    expect(getBlockDropTarget(blocks, blocks[3]!, 130)).toEqual({
      block: blocks[1],
      placement: "before",
      top: 60,
      left: 40,
      width: 480,
    });
    expect(getBlockDropTarget(blocks, blocks[3]!, 220)).toEqual({
      block: blocks[1],
      placement: "after",
      top: 300,
      left: 40,
      width: 480,
    });
    expect(getBlockDropTarget(blocks, blocks[3]!, 60)?.top).toBe(60);
    expect(getBlockDropTarget(blocks, blocks[3]!, 0)?.top).toBe(10);
    expect(getBlockDropTarget(blocks, blocks[0]!, 500)?.top).toBe(430);
  });

  it("hides unchanged self and adjacent drop targets", () => {
    const blocks = geometry();
    expect(getBlockDropTarget([], blocks[0]!, 10)).toBeNull();
    expect(getBlockDropTarget(blocks, blocks[0]!, 20)).toBeNull();
    expect(getBlockDropTarget(blocks, blocks[0]!, 130)).toBeNull();
    expect(getBlockDropTarget(blocks, blocks[2]!, 220)).toBeNull();
  });
});

describe("block drag edge scrolling", () => {
  it.each([
    [0, 0, 400, -18],
    [32, 0, 400, -9],
    [64, 0, 400, 0],
    [200, 0, 400, 0],
    [336, 0, 400, 0],
    [368, 0, 400, 9],
    [400, 0, 400, 18],
    [-25, 0, 400, 0],
    [425, 0, 400, 0],
    [5, 0, 40, -9],
    [10, 0, 40, 0],
    [0, 0, 0, 0],
  ])("computes bounded speed at pointer %s in viewport %s..%s", (pointer, start, end, expected) => {
    expect(getEdgeScrollSpeed(pointer, start, end)).toBe(expected);
  });

  it("scrolls the innermost available container, then ancestors, then the viewport", () => {
    const outer = document.createElement("div");
    const inner = document.createElement("div");
    const root = document.createElement("div");
    document.body.append(outer);
    outer.append(inner);
    inner.append(root);
    const positions = new Map<HTMLElement, number>([
      [inner, 0],
      [outer, 0],
    ]);
    for (const [element, top, height, max] of [
      [inner, 10, 200, 100],
      [outer, 0, 300, 200],
    ] as const) {
      element.style.overflowY = "auto";
      vi.spyOn(element, "getBoundingClientRect").mockReturnValue(new DOMRect(0, top, 400, height));
      Object.defineProperties(element, {
        clientTop: { value: 2, configurable: true },
        clientHeight: { value: height - 4, configurable: true },
        scrollHeight: { value: height - 4 + max, configurable: true },
        scrollTop: {
          configurable: true,
          get: () => positions.get(element)!,
          set: (value: number) => positions.set(element, Math.min(max, Math.max(0, value))),
        },
      });
    }
    const viewportScroll = vi.spyOn(window, "scrollBy").mockImplementation(() => {});
    expect(scrollBlockDrag(root, 200)).toBe(true);
    expect(positions.get(inner)).toBe(16);
    expect(positions.get(outer)).toBe(0);
    expect(viewportScroll).not.toHaveBeenCalled();
    positions.set(inner, 100);
    expect(scrollBlockDrag(root, 200)).toBe(true);
    expect(positions.get(outer)).toBe(16);
    positions.set(outer, 200);
    expect(scrollBlockDrag(root, 200)).toBe(false);
    expect(viewportScroll).toHaveBeenCalledWith({ top: 16, behavior: "instant" });
    viewportScroll.mockClear();
    expect(scrollBlockDrag(root, 100)).toBe(false);
    expect(viewportScroll).not.toHaveBeenCalled();
    expect(
      scrollBlockDrag(document.implementation.createHTMLDocument().createElement("div"), 200),
    ).toBe(false);
  });
});
