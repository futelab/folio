import "@testing-library/jest-dom/vitest";
import type { Editor } from "@tiptap/core";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TableControls } from "../tables/TableControls";

class ResizeObserverMock {
  static instances: ResizeObserverMock[] = [];
  readonly targets = new Set<Element>();
  constructor(private readonly callback: ResizeObserverCallback) {
    ResizeObserverMock.instances.push(this);
  }
  observe = vi.fn((element: Element) => {
    this.targets.add(element);
  });
  unobserve = vi.fn((element: Element) => {
    this.targets.delete(element);
  });
  disconnect = vi.fn(() => {
    this.targets.clear();
  });
  static resize(target: Element) {
    for (const observer of ResizeObserverMock.instances) {
      if (observer.targets.has(target))
        observer.callback(
          [{ target, contentRect: target.getBoundingClientRect() } as ResizeObserverEntry],
          observer as unknown as ResizeObserver,
        );
    }
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  ResizeObserverMock.instances = [];
  vi.stubGlobal("ResizeObserver", ResizeObserverMock);
});
afterEach(() => {
  cleanup();
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function fixture() {
  const root = document.createElement("div");
  const controlsHost = document.createElement("div");
  const editorDOM = document.createElement("div");
  const scrollContainer = document.createElement("div");
  const table = document.createElement("table");
  root.className = "folio-editor";
  editorDOM.className = "ProseMirror";
  scrollContainer.append(table);
  editorDOM.append(scrollContainer);
  root.append(controlsHost, editorDOM);
  document.body.append(root);
  const geometry = { x: 80, y: 120, width: 300, height: 100, layerX: 40, layerY: 20, scale: 1 };
  const nativeRect = HTMLElement.prototype.getBoundingClientRect;
  const nativeWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetWidth")!.get!;
  const nativeHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight")!.get!;
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
    this: HTMLElement,
  ) {
    if (this === root) return new DOMRect(40, 20, 600, 500);
    if (this === table) {
      // The geometry follows committed DOM, just like a toolbar changing document
      // flow in the browser. During render the new attribute is not committed yet.
      const expanded =
        controlsHost.querySelector(".folio-editor-actions")?.getAttribute("data-expanded") ===
        "true";
      return new DOMRect(
        geometry.x,
        geometry.y + (expanded ? 64 : 0),
        geometry.width,
        geometry.height,
      );
    }
    if (this.classList.contains("folio-table-controls"))
      return new DOMRect(
        geometry.layerX,
        geometry.layerY,
        600 * geometry.scale,
        500 * geometry.scale,
      );
    return nativeRect.call(this);
  });
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(function (
    this: HTMLElement,
  ) {
    return this.classList.contains("folio-table-controls") ? 600 : nativeWidth.call(this);
  });
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (
    this: HTMLElement,
  ) {
    return this.classList.contains("folio-table-controls") ? 500 : nativeHeight.call(this);
  });
  const listeners = new Map<string, Set<() => void>>();
  const editor = {
    isEditable: true,
    view: { dom: editorDOM },
    on: vi.fn((event: string, callback: () => void) => {
      const handlers = listeners.get(event) ?? new Set<() => void>();
      handlers.add(callback);
      listeners.set(event, handlers);
    }),
    off: vi.fn((event: string, callback: () => void) => {
      listeners.get(event)?.delete(callback);
    }),
  };
  function Harness({
    expanded = false,
    target = table,
  }: {
    expanded?: boolean;
    target?: HTMLElement | null;
  }) {
    return (
      <>
        <div className="folio-editor-actions" data-expanded={String(expanded)} />
        <TableControls
          editor={editor as unknown as Editor}
          editorRoot={root}
          onAddColumn={vi.fn()}
          onAddRow={vi.fn()}
          table={target}
        />
      </>
    );
  }
  const view = render(<Harness />, { container: controlsHost });
  const buttons = () => ({
    row: screen.getByRole<HTMLButtonElement>("button", { name: "Add table row" }),
    column: screen.getByRole<HTMLButtonElement>("button", { name: "Add table column" }),
  });
  return {
    ...view,
    root,
    table,
    editorDOM,
    scrollContainer,
    geometry,
    editor,
    listeners,
    buttons,
    rerender: (props: { expanded?: boolean; target?: HTMLElement | null }) =>
      view.rerender(<Harness {...props} />),
    transaction: () => {
      for (const callback of listeners.get("transaction") ?? []) callback();
    },
  };
}

function flushFrame() {
  act(() => {
    vi.advanceTimersByTime(32);
  });
}
function coordinates(button: HTMLElement) {
  return [Number.parseFloat(button.style.left), Number.parseFloat(button.style.top)];
}

describe("table control geometry", () => {
  it("measures the committed toolbar layout before positioning controls", () => {
    const view = fixture();
    expect(coordinates(view.buttons().row)).toEqual([190, 208]);
    expect(coordinates(view.buttons().column)).toEqual([348, 150]);
    view.rerender({ expanded: true });
    expect(coordinates(view.buttons().row)).toEqual([190, 272]);
    expect(coordinates(view.buttons().column)).toEqual([348, 214]);
    view.rerender({ expanded: false });
    expect(coordinates(view.buttons().row)).toEqual([190, 208]);
    expect(coordinates(view.buttons().column)).toEqual([348, 150]);
  });

  it("follows table growth and upstream content or actionbar layout without React updates", () => {
    const view = fixture();
    view.geometry.height = 180;
    act(() => ResizeObserverMock.resize(view.table));
    flushFrame();
    expect(coordinates(view.buttons().row)).toEqual([190, 288]);
    expect(coordinates(view.buttons().column)).toEqual([348, 190]);
    view.geometry.y += 48;
    act(() => ResizeObserverMock.resize(view.editorDOM));
    flushFrame();
    expect(coordinates(view.buttons().row)).toEqual([190, 336]);
    view.geometry.y += 32;
    const actionbar = view.root.querySelector(".folio-editor-actions")!;
    act(() => ResizeObserverMock.resize(actionbar));
    flushFrame();
    expect(coordinates(view.buttons().row)).toEqual([190, 368]);
    view.geometry.x += 12;
    act(() => ResizeObserverMock.resize(view.root));
    flushFrame();
    expect(coordinates(view.buttons().column)).toEqual([360, 270]);
  });

  it("responds to captured nested scroll, viewport resize, and editor transactions", () => {
    const view = fixture();
    view.geometry.x -= 30;
    act(() => view.scrollContainer.dispatchEvent(new Event("scroll")));
    flushFrame();
    expect(coordinates(view.buttons().column)).toEqual([318, 150]);
    expect(coordinates(view.buttons().row)).toEqual([160, 208]);
    view.geometry.width = 400;
    act(() => window.dispatchEvent(new Event("resize")));
    flushFrame();
    expect(coordinates(view.buttons().column)).toEqual([418, 150]);
    expect(coordinates(view.buttons().row)).toEqual([210, 208]);
    view.geometry.height = 160;
    act(() => view.transaction());
    flushFrame();
    expect(coordinates(view.buttons().row)).toEqual([210, 268]);
  });

  it("uses the overlay coordinate system when its origin and scale differ from the root", () => {
    const view = fixture();
    Object.assign(view.geometry, {
      x: 152,
      y: 276,
      width: 600,
      height: 200,
      layerX: 52,
      layerY: 36,
      scale: 2,
    });
    act(() => window.dispatchEvent(new Event("resize")));
    flushFrame();
    expect(coordinates(view.buttons().row)).toEqual([200, 228]);
    expect(coordinates(view.buttons().column)).toEqual([358, 170]);
  });

  it("does not rewrite unchanged position styles on observer or transaction notifications", () => {
    const view = fixture();
    const observer = new MutationObserver(() => undefined);
    observer.observe(view.root.querySelector(".folio-table-controls")!, {
      subtree: true,
      attributes: true,
      attributeFilter: ["style"],
    });
    act(() => {
      ResizeObserverMock.resize(view.table);
      view.transaction();
    });
    flushFrame();
    expect(observer.takeRecords()).toHaveLength(0);
    observer.disconnect();
  });

  it("hides detached targets and removes observers, event subscriptions, and pending frames", () => {
    const view = fixture();
    const { row, column } = view.buttons();
    view.table.remove();
    act(() => ResizeObserverMock.resize(view.root));
    flushFrame();
    expect(row).not.toBeVisible();
    expect(column).not.toBeVisible();
    act(() => view.transaction());
    const observers = [...ResizeObserverMock.instances];
    const rectSpy = vi.mocked(view.table.getBoundingClientRect);
    view.unmount();
    const reads = rectSpy.mock.calls.length;
    act(() => {
      window.dispatchEvent(new Event("resize"));
      view.scrollContainer.dispatchEvent(new Event("scroll"));
      view.transaction();
    });
    flushFrame();
    expect(rectSpy.mock.calls).toHaveLength(reads);
    expect(view.listeners.get("transaction")?.size ?? 0).toBe(0);
    expect(observers.every((observer) => observer.disconnect.mock.calls.length > 0)).toBe(true);
  });

  it("removes writing controls when the same editor becomes read-only", () => {
    const view = fixture();
    expect(view.buttons().row).toBeVisible();
    view.editor.isEditable = false;
    view.rerender({});
    expect(screen.queryByRole("button", { name: "Add table row" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add table column" })).not.toBeInTheDocument();
    expect(view.listeners.get("transaction")?.size ?? 0).toBe(0);
    act(() => {
      view.transaction();
      window.dispatchEvent(new Event("resize"));
    });
    flushFrame();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
