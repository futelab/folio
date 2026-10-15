import "@testing-library/jest-dom/vitest";
import { useRef } from "react";
import type { ReactNode } from "react";
import { Editor } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultTiptapExtensions } from "@futelab/folio-core/browser";
import { useBlockDrag } from "../blocks/useBlockDrag";

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

function createEditor() {
  const editor = new Editor({
    extensions: createDefaultTiptapExtensions(),
    content: "<p>First</p><p>Second</p><p>Third</p>",
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

interface HarnessProps {
  editor: Editor | null;
  writable?: boolean;
  documentId?: string;
  name?: string;
  children?: ReactNode;
}

function Harness({
  editor,
  writable = true,
  documentId = "a",
  name = "source",
  children,
}: HarnessProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const { start, indicatorRef } = useBlockDrag(editor, rootRef, writable, documentId);
  return (
    <div className="folio-editor" data-testid={`${name}-root`} ref={rootRef}>
      <button
        data-testid={`${name}-handle`}
        draggable
        onDragStart={(event) =>
          start(event, editor?.view.dom.firstElementChild as HTMLElement | null)
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
) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    dataTransfer: { value: dataTransfer },
    clientX: { value: 70 },
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
