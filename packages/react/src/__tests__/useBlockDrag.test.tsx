import "@testing-library/jest-dom/vitest";
import { useRef } from "react";
import type { ReactNode } from "react";
import { Editor } from "@tiptap/core";
import type { JSONContent } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import { NodeSelection } from "@tiptap/pm/state";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultTiptapExtensions } from "@futelab/folio-core/browser";
import { useBlockDrag } from "../blocks/useBlockDrag";
import { getSelectedBlocks, setBlockSelection } from "../blocks/blockSelection";

const editors: Editor[] = [];
const frames = new Map<number, FrameRequestCallback>();
let nextFrame = 0;

beforeAll(() => {
  if (!Range.prototype.getBoundingClientRect)
    Range.prototype.getBoundingClientRect = () => new DOMRect(40, 100, 100, 20);
  if (!Range.prototype.getClientRects)
    Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
});

beforeEach(() => {
  frames.clear();
  nextFrame = 0;
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    const id = ++nextFrame;
    frames.set(id, callback);
    return id;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
    frames.delete(id);
  });
  vi.spyOn(window, "scrollBy").mockImplementation(() => {});
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
    this: HTMLElement,
  ) {
    if (this.classList.contains("ProseMirror")) return new DOMRect(40, 100, 400, 220);
    if (this.dataset.testid?.endsWith("-layer")) return new DOMRect(20, 60, 400, 300);
    if (this.parentElement?.classList.contains("ProseMirror")) {
      const index = Array.from(this.parentElement.children).indexOf(this);
      return new DOMRect(40, 100 + index * 70, 400, 40);
    }
    return new DOMRect(20, 60, 400, 300);
  });
});

afterEach(() => {
  cleanup();
  for (const editor of editors.splice(0)) editor.destroy();
  document.body.replaceChildren();
  frames.clear();
  vi.restoreAllMocks();
});

function createEditor(content?: JSONContent) {
  const editor = new Editor({
    extensions: createDefaultTiptapExtensions(),
    content: content ?? "<p>First</p><p>Second</p><p>Third</p>",
  });
  editors.push(editor);
  return editor;
}

function transfer() {
  const values = new Map<string, string>();
  return {
    effectAllowed: "none",
    dropEffect: "none",
    files: [],
    get types() {
      return [...values.keys()];
    },
    setData: vi.fn((type: string, value: string) => values.set(type, value)),
    getData: vi.fn((type: string) => values.get(type) ?? ""),
    clearData: vi.fn(() => values.clear()),
    setDragImage: vi.fn(),
  };
}

function layoutRect(element: HTMLElement, rect: DOMRect) {
  // Define an own method: spying on an inherited prototype mock would reuse
  // the same mock and accidentally replace geometry for every element.
  Object.defineProperty(element, "getBoundingClientRect", {
    configurable: true,
    value: () => rect,
  });
}

interface HarnessProps {
  editor: Editor | null;
  writable?: boolean;
  documentId?: string;
  name?: string;
  children?: ReactNode;
  sourceSelector?: string;
}

function Harness({
  editor,
  writable = true,
  documentId = "a",
  name = "source",
  children,
  sourceSelector,
}: HarnessProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const { start, indicatorRef } = useBlockDrag(editor, rootRef, writable, documentId);
  return (
    <div className="folio-editor" data-testid={`${name}-root`} ref={rootRef}>
      <button
        data-testid={`${name}-handle`}
        draggable
        onDragStart={(event) =>
          start(
            event,
            (sourceSelector
              ? editor?.view.dom.querySelector<HTMLElement>(sourceSelector)
              : editor?.view.dom.firstElementChild) as HTMLElement | null,
          )
        }
        type="button"
      >
        Drag block
      </button>
      <div className="folio-editor-actions" data-testid={`${name}-actions`}>
        Actions
      </div>
      <div data-testid={`${name}-drop-zone`} />
      <EditorContent editor={editor} />
      {children}
      <div data-testid={`${name}-layer`} style={{ width: 400, height: 300 }}>
        <div
          aria-hidden="true"
          data-testid={`${name}-indicator`}
          ref={indicatorRef}
          style={{ visibility: "hidden" }}
        />
      </div>
    </div>
  );
}

function dispatchDrag(
  target: EventTarget,
  type: string,
  dataTransfer: ReturnType<typeof transfer>,
  y = 275,
  x = 70,
) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    dataTransfer: { value: dataTransfer },
    clientX: { value: x },
    clientY: { value: y },
  });
  act(() => target.dispatchEvent(event));
  return event;
}

function begin(editor: Editor, name = "source") {
  const dataTransfer = transfer();
  const source = editor.view.dom.firstElementChild as HTMLElement;
  fireEvent.dragStart(screen.getByTestId(`${name}-handle`), { dataTransfer });
  dispatchDrag(editor.view.dom.lastElementChild!, "dragover", dataTransfer);
  return { dataTransfer, source };
}

function expectCleared(source: HTMLElement, name = "source") {
  expect(source).not.toHaveAttribute("data-folio-drag-source");
  expect(document.querySelector(".folio-block-drag-preview")).toBeNull();
  expect(screen.getByTestId(`${name}-indicator`)).toHaveStyle({ visibility: "hidden" });
  expect(frames.size).toBe(0);
}

describe("block drag sessions", () => {
  it("drags a selected group as one preview, transaction and undo step", () => {
    const editor = createEditor();
    render(<Harness editor={editor} />);
    const original = editor.getJSON();
    act(() => setBlockSelection(editor, 0, editor.state.doc.child(0).nodeSize));
    const { dataTransfer } = begin(editor);
    expect(editor.view.dom.querySelectorAll("[data-folio-drag-source]")).toHaveLength(2);
    expect(document.querySelector(".folio-block-drag-preview")).toHaveTextContent("FirstSecond");
    expect(dataTransfer.getData("text/plain")).toBe("First\n\nSecond");
    const update = vi.fn();
    editor.on("update", update);
    dispatchDrag(editor.view.dom.lastElementChild!, "drop", dataTransfer);
    expect(editor.getText({ blockSeparator: "|" })).toBe("Third|First|Second");
    expect(getSelectedBlocks(editor)).toHaveLength(2);
    expect(update).toHaveBeenCalledOnce();
    expect(editor.view.dom.querySelector("[data-folio-drag-source]")).toBeNull();
    act(() => {
      editor.commands.undo();
    });
    expect(editor.getJSON()).toEqual(original);
  });

  it("cancels every selected source marker and animation when a grouped document changes", () => {
    const editor = createEditor();
    render(<Harness editor={editor} />);
    act(() => setBlockSelection(editor, 0, editor.state.doc.child(0).nodeSize));
    const { dataTransfer, source } = begin(editor);
    act(() => {
      editor.commands.setTextSelection(2);
      editor.commands.insertContent("Changed ");
    });
    const changed = editor.getJSON();
    expectCleared(source);
    expect(editor.view.dom.querySelector("[data-folio-drag-source]")).toBeNull();
    expect(
      dispatchDrag(editor.view.dom.lastElementChild!, "drop", dataTransfer).defaultPrevented,
    ).toBe(true);
    expect(editor.getJSON()).toEqual(changed);
  });

  it("indents a block into a callout and shows a container-width insertion guide", () => {
    const editor = createEditor({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Incoming" }] },
        {
          type: "callout",
          attrs: { tone: "warning" },
          content: [{ type: "paragraph", content: [{ type: "text", text: "Existing" }] }],
        },
        { type: "paragraph", content: [{ type: "text", text: "Last" }] },
      ],
    });
    render(<Harness editor={editor} />);
    const container = editor.view.dom.querySelector<HTMLElement>(".folio-callout")!;
    const existing = container.querySelector("p")!;
    layoutRect(container, new DOMRect(80, 160, 300, 160));
    layoutRect(existing, new DOMRect(100, 190, 260, 40));
    const { dataTransfer } = begin(editor);
    dispatchDrag(existing, "dragover", dataTransfer, 220, 150);
    expect(screen.getByTestId("source-indicator")).toHaveStyle({
      left: "60px",
      top: "170px",
      width: "300px",
      visibility: "visible",
    });
    expect(screen.getByTestId("source-indicator")).toHaveAttribute(
      "data-drop-container",
      "callout",
    );
    dispatchDrag(existing, "drop", dataTransfer, 220, 150);
    expect(editor.state.doc.firstChild?.type.name).toBe("callout");
    expect(editor.state.doc.firstChild?.lastChild?.textContent).toBe("Incoming");
    expect(editor.state.doc.firstChild?.attrs.tone).toBe("warning");
  });

  it("moves a selected nested block out through the document rail without dragging its container", () => {
    const editor = createEditor({
      type: "doc",
      content: [
        {
          type: "callout",
          attrs: { tone: "warning" },
          content: [
            {
              type: "paragraph",
              attrs: { folioBlockId: "nested" },
              content: [{ type: "text", text: "Nested" }],
            },
          ],
        },
        { type: "paragraph", content: [{ type: "text", text: "Second" }] },
        { type: "paragraph", content: [{ type: "text", text: "Third" }] },
      ],
    });
    render(<Harness editor={editor} sourceSelector=".folio-callout p" />);
    const container = editor.view.dom.querySelector<HTMLElement>(".folio-callout")!;
    layoutRect(container, new DOMRect(80, 100, 300, 80));
    const nested = container.querySelector("p")!;
    act(() =>
      editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, 1))),
    );
    const dataTransfer = transfer();
    fireEvent.dragStart(screen.getByTestId("source-handle"), { dataTransfer });
    expect(nested).toHaveAttribute("data-folio-drag-source", "true");
    expect(container).not.toHaveAttribute("data-folio-drag-source");
    dispatchDrag(editor.view.dom.lastElementChild!, "dragover", dataTransfer, 275, 50);
    expect(screen.getByTestId("source-indicator")).toHaveAttribute("data-drop-container", "doc");
    dispatchDrag(editor.view.dom.lastElementChild!, "drop", dataTransfer, 275, 50);
    expect(editor.state.doc.firstChild?.type.name).toBe("callout");
    expect(editor.state.doc.firstChild?.firstChild?.textContent).toBe("");
    expect(editor.state.doc.lastChild?.attrs.folioBlockId).toBe("nested");
  });

  it("chooses the horizontally targeted column and preserves both column widths", () => {
    const editor = createEditor({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Incoming" }] },
        {
          type: "columns",
          content: [
            {
              type: "column",
              attrs: { width: 60 },
              content: [{ type: "paragraph", content: [{ type: "text", text: "Left" }] }],
            },
            {
              type: "column",
              attrs: { width: 40 },
              content: [{ type: "paragraph", content: [{ type: "text", text: "Right" }] }],
            },
          ],
        },
        { type: "paragraph", content: [{ type: "text", text: "Last" }] },
      ],
    });
    render(<Harness editor={editor} />);
    const columns = editor.view.dom.querySelectorAll<HTMLElement>(".folio-column");
    layoutRect(columns[0]!, new DOMRect(80, 160, 160, 180));
    layoutRect(columns[1]!, new DOMRect(280, 160, 160, 180));
    layoutRect(columns[0]!.querySelector("p")!, new DOMRect(90, 180, 140, 40));
    const right = columns[1]!.querySelector("p")!;
    layoutRect(right, new DOMRect(290, 180, 140, 40));
    const { dataTransfer } = begin(editor);
    dispatchDrag(right, "dragover", dataTransfer, 230, 320);
    expect(screen.getByTestId("source-indicator")).toHaveStyle({
      left: "260px",
      width: "160px",
      visibility: "visible",
    });
    expect(screen.getByTestId("source-indicator")).toHaveAttribute("data-drop-container", "column");
    dispatchDrag(right, "drop", dataTransfer, 230, 320);
    const layout = editor.state.doc.firstChild!;
    expect(layout.child(0).attrs.width).toBe(60);
    expect(layout.child(1).attrs.width).toBe(40);
    expect(layout.child(0).textContent).toBe("Left");
    expect(layout.child(1).textContent).toBe("RightIncoming");
  });
  it("previews the actual source block and commits one valid internal drop", () => {
    const editor = createEditor();
    render(<Harness editor={editor} />);
    const { dataTransfer, source } = begin(editor);
    const preview = document.querySelector<HTMLElement>(".folio-block-drag-preview")!;
    expect(preview).toHaveTextContent("First");
    expect(preview).toHaveAttribute("aria-hidden", "true");
    expect(preview.inert).toBe(true);
    expect(dataTransfer.setDragImage).toHaveBeenCalledWith(preview, 12, 12);
    expect(dataTransfer.getData("application/x-folio-block")).toBe("move");
    expect(dataTransfer.getData("text/plain")).toBe("First");
    expect(source).toHaveAttribute("data-folio-drag-source", "true");
    expect(screen.getByTestId("source-indicator")).toHaveStyle({
      visibility: "visible",
      left: "20px",
      top: "220px",
      width: "400px",
    });
    expect(frames.size).toBe(1);
    const [frameId, callback] = [...frames.entries()][0]!;
    frames.delete(frameId);
    act(() => callback(16));
    expect(frames.size).toBe(1);
    const update = vi.fn();
    editor.on("update", update);
    expect(
      dispatchDrag(editor.view.dom.lastElementChild!, "drop", dataTransfer).defaultPrevented,
    ).toBe(true);
    expect(editor.getText({ blockSeparator: "|" })).toBe("Second|Third|First");
    expect(update).toHaveBeenCalledTimes(1);
    expectCleared(source);
  });

  it("cancels on Escape and consumes a stale drop without duplicating text", () => {
    const editor = createEditor();
    render(<Harness editor={editor} />);
    const original = editor.getJSON();
    const { dataTransfer, source } = begin(editor);
    const key = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    act(() => document.dispatchEvent(key));
    expect(key.defaultPrevented).toBe(true);
    expectCleared(source);
    expect(
      dispatchDrag(editor.view.dom.lastElementChild!, "drop", dataTransfer).defaultPrevented,
    ).toBe(true);
    expect(editor.getJSON()).toEqual(original);
    expect(editor.can().undo()).toBe(false);
  });

  it("rejects a drop into another editor, then lets ordinary external text drops propagate", () => {
    const editor = createEditor();
    const other = createEditor();
    render(
      <>
        <Harness editor={editor} />
        <Harness editor={other} name="other" />
      </>,
    );
    const original = editor.getJSON();
    const otherOriginal = other.getJSON();
    const { dataTransfer, source } = begin(editor);
    expect(
      dispatchDrag(other.view.dom.lastElementChild!, "drop", dataTransfer).defaultPrevented,
    ).toBe(true);
    expect(editor.getJSON()).toEqual(original);
    expect(other.getJSON()).toEqual(otherOriginal);
    expectCleared(source);
    const external = transfer();
    external.setData("text/plain", "External text");
    const reachedTarget = vi.fn();
    const dropZone = screen.getByTestId("other-drop-zone");
    dropZone.addEventListener("drop", reachedTarget);
    expect(dispatchDrag(dropZone, "drop", external).defaultPrevented).toBe(false);
    expect(reachedTarget).toHaveBeenCalledOnce();
  });

  it("rejects drops into a nested editor instead of reordering its parent document", () => {
    const editor = createEditor();
    const nested = createEditor();
    render(
      <Harness editor={editor}>
        <Harness editor={nested} name="nested" />
      </Harness>,
    );
    const original = editor.getJSON();
    const nestedOriginal = nested.getJSON();
    const { dataTransfer, source } = begin(editor);
    dispatchDrag(nested.view.dom.lastElementChild!, "dragover", dataTransfer);
    expect(screen.getByTestId("source-indicator")).toHaveStyle({ visibility: "hidden" });
    expect(
      dispatchDrag(nested.view.dom.lastElementChild!, "drop", dataTransfer).defaultPrevented,
    ).toBe(true);
    expect(editor.getJSON()).toEqual(original);
    expect(nested.getJSON()).toEqual(nestedOriginal);
    expectCleared(source);
  });

  it("cancels a pending drag when the document changes but not when only selection changes", () => {
    const editor = createEditor();
    render(<Harness editor={editor} />);
    const { dataTransfer, source } = begin(editor);
    act(() => editor.commands.setTextSelection(2));
    expect(source).toHaveAttribute("data-folio-drag-source", "true");
    expect(frames.size).toBe(1);
    act(() => editor.commands.insertContent("Changed "));
    const changed = editor.getJSON();
    expectCleared(source);
    expect(
      dispatchDrag(editor.view.dom.lastElementChild!, "drop", dataTransfer).defaultPrevented,
    ).toBe(true);
    expect(editor.getJSON()).toEqual(changed);
  });

  it.each(["documentId", "editor"] as const)(
    "clears the drag on %s replacement and rejects its stale payload",
    (replacement) => {
      const editor = createEditor();
      const view = render(<Harness editor={editor} />);
      const { dataTransfer, source } = begin(editor);
      const nextEditor = replacement === "editor" ? createEditor() : editor;
      view.rerender(<Harness editor={nextEditor} documentId="b" />);
      const unchanged = nextEditor.getJSON();
      expectCleared(source);
      expect(
        dispatchDrag(screen.getByTestId("source-drop-zone"), "drop", dataTransfer).defaultPrevented,
      ).toBe(true);
      expect(nextEditor.getJSON()).toEqual(unchanged);
    },
  );

  it("clears a drag in read-only mode and rejects its stale payload after editing resumes", () => {
    const editor = createEditor();
    const view = render(<Harness editor={editor} />);
    const { dataTransfer, source } = begin(editor);
    view.rerender(<Harness editor={editor} writable={false} />);
    expectCleared(source);
    const blocked = transfer();
    expect(
      fireEvent.dragStart(screen.getByTestId("source-handle"), { dataTransfer: blocked }),
    ).toBe(false);
    expect(blocked.setDragImage).not.toHaveBeenCalled();
    view.rerender(<Harness editor={editor} />);
    const unchanged = editor.getJSON();
    expect(
      dispatchDrag(screen.getByTestId("source-drop-zone"), "drop", dataTransfer).defaultPrevented,
    ).toBe(true);
    expect(editor.getJSON()).toEqual(unchanged);
  });

  it("removes preview, markers, animation work and document listeners on unmount", () => {
    const editor = createEditor();
    const view = render(<Harness editor={editor} />);
    const { source, dataTransfer } = begin(editor);
    view.unmount();
    expect(source).not.toHaveAttribute("data-folio-drag-source");
    expect(document.querySelector(".folio-block-drag-preview")).toBeNull();
    expect(frames.size).toBe(0);
    const escape = new KeyboardEvent("keydown", { key: "Escape", cancelable: true });
    document.dispatchEvent(escape);
    expect(escape.defaultPrevented).toBe(false);
    expect(dispatchDrag(document.body, "drop", dataTransfer).defaultPrevented).toBe(false);
    act(() => editor.commands.insertContent("After unmount "));
    expect(frames.size).toBe(0);
    expect(document.querySelector(".folio-block-drag-preview")).toBeNull();
  });

  it("stops all visual work on dragend and does not intercept later ordinary drops", () => {
    const editor = createEditor();
    render(<Harness editor={editor} />);
    const { dataTransfer, source } = begin(editor);
    dispatchDrag(document, "dragend", dataTransfer);
    expectCleared(source);
    const external = transfer();
    external.setData("text/plain", "External text");
    expect(
      dispatchDrag(screen.getByTestId("source-drop-zone"), "drop", external).defaultPrevented,
    ).toBe(false);
  });

  it("cancels on window blur and never accepts toolbar drops", () => {
    const editor = createEditor();
    render(<Harness editor={editor} />);
    const original = editor.getJSON();
    const { source, dataTransfer } = begin(editor);
    expect(
      dispatchDrag(screen.getByTestId("source-actions"), "dragover", dataTransfer).defaultPrevented,
    ).toBe(true);
    expect(screen.getByTestId("source-indicator")).toHaveStyle({ visibility: "hidden" });
    act(() => window.dispatchEvent(new Event("blur")));
    expectCleared(source);
    expect(
      dispatchDrag(screen.getByTestId("source-actions"), "drop", dataTransfer).defaultPrevented,
    ).toBe(true);
    expect(editor.getJSON()).toEqual(original);
  });
});
