import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BlockInteractionLayer } from "../blocks/BlockInteractionLayer";
import { BlockSideControls } from "../blocks/BlockSideControls";

class ResizeObserverMock {
  static instances: ResizeObserverMock[] = [];
  readonly targets = new Set<Element>();
  constructor(private readonly callback: ResizeObserverCallback) {
    ResizeObserverMock.instances.push(this);
  }
  observe = vi.fn((element: Element) => this.targets.add(element));
  unobserve = vi.fn((element: Element) => this.targets.delete(element));
  disconnect = vi.fn(() => this.targets.clear());
  static resize(target: Element) {
    for (const observer of ResizeObserverMock.instances)
      if (observer.targets.has(target))
        observer.callback(
          [{ target } as ResizeObserverEntry],
          observer as unknown as ResizeObserver,
        );
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  ResizeObserverMock.instances = [];
  vi.stubGlobal("ResizeObserver", ResizeObserverMock);
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) =>
    window.setTimeout(() => callback(0), 16),
  );
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation((frame) =>
    window.clearTimeout(frame),
  );
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
  const block = document.createElement("p");
  root.className = "folio-editor";
  editorDOM.className = "ProseMirror";
  scrollContainer.append(block);
  editorDOM.append(scrollContainer);
  root.append(controlsHost, editorDOM);
  document.body.append(root);
  const geometry = {
    x: 120,
    y: 180,
    height: 32,
    layerX: 40,
    layerY: 100,
    scaleX: 1,
    scaleY: 1,
    borderX: 0,
    borderY: 0,
    scrollX: 0,
    scrollY: 0,
    layerWidth: 600,
    layerHeight: 300,
  };
  const nativeRect = HTMLElement.prototype.getBoundingClientRect;
  const rectSpy = vi
    .spyOn(HTMLElement.prototype, "getBoundingClientRect")
    .mockImplementation(function (this: HTMLElement) {
      if (this === root) return new DOMRect(10, 20, 900, 900);
      if (this === block) {
        // Read the committed toolbar DOM so a measurement performed during render
        // would still see the previous layout and fail the toolbar regression.
        const expanded =
          controlsHost.querySelector(".folio-editor-actions")?.getAttribute("data-expanded") ===
          "true";
        return new DOMRect(geometry.x, geometry.y + (expanded ? 64 : 0), 300, geometry.height);
      }
      if (this.classList.contains("folio-block-interaction-layer"))
        return new DOMRect(
          geometry.layerX,
          geometry.layerY,
          geometry.layerWidth * geometry.scaleX,
          geometry.layerHeight * geometry.scaleY,
        );
      if (this.classList.contains("folio-block-side-controls"))
        return new DOMRect(0, 0, 49 * geometry.scaleX, 24 * geometry.scaleY);
      return nativeRect.call(this);
    });
  const metrics = {
    offsetWidth: () => geometry.layerWidth,
    offsetHeight: () => geometry.layerHeight,
    clientLeft: () => geometry.borderX,
    clientTop: () => geometry.borderY,
    scrollLeft: () => geometry.scrollX,
    scrollTop: () => geometry.scrollY,
  };
  for (const [property, read] of Object.entries(metrics)) {
    const owner = property.startsWith("offset") ? HTMLElement.prototype : Element.prototype;
    const native = Object.getOwnPropertyDescriptor(owner, property)!.get!;
    vi.spyOn(HTMLElement.prototype, property as keyof typeof metrics, "get").mockImplementation(
      function (this: HTMLElement) {
        return this.classList.contains("folio-block-interaction-layer")
          ? read()
          : native.call(this);
      },
    );
  }
  function Harness({
    expanded = false,
    target = block,
  }: {
    expanded?: boolean;
    target?: HTMLElement | null;
  }) {
    return (
      <>
        <div className="folio-editor-actions" data-expanded={String(expanded)} />
        <BlockInteractionLayer
          activeBlock={target}
          editorRoot={root}
          onOpenBlockMenu={vi.fn()}
          sideControlsClassName="custom-controls"
        />
      </>
    );
  }
  const view = render(<Harness />, { container: controlsHost });
  return {
    ...view,
    root,
    block,
    editorDOM,
    scrollContainer,
    geometry,
    rectSpy,
    controls: () => screen.getByTestId("folio-block-side-controls"),
    rerender: (props: { expanded?: boolean; target?: HTMLElement | null }) =>
      view.rerender(<Harness {...props} />),
  };
}

function flushFrame() {
  act(() => vi.advanceTimersByTime(16));
}

describe("block handle geometry", () => {
  it("measures the committed toolbar layout and actual overlay origin on every commit", () => {
    const view = fixture();
    expect(view.controls()).toHaveStyle({ top: "84px", visibility: "visible" });
    expect(view.controls().style.left).toBe(
      "calc(80px - 49px - var(--folio-block-controls-gap, 8px))",
    );
    view.rerender({ expanded: true });
    expect(view.controls()).toHaveStyle({ top: "148px" });
    view.rerender({ expanded: false });
    expect(view.controls()).toHaveStyle({ top: "84px" });
  });

  it("converts scaled viewport coordinates through the overlay border and internal scroll", () => {
    const view = fixture();
    Object.assign(view.geometry, {
      x: 200,
      y: 200,
      scaleX: 2,
      scaleY: 2,
      borderX: 3,
      borderY: 4,
      scrollX: 5,
      scrollY: 30,
    });
    act(() => window.dispatchEvent(new Event("resize")));
    flushFrame();
    expect(view.controls()).toHaveStyle({ top: "72px" });
    expect(view.controls().style.left).toBe(
      "calc(82px - 49px - var(--folio-block-controls-gap, 8px))",
    );
  });

  it("keeps the handle outside indented text while centering on its first line", () => {
    const view = fixture();
    view.block.textContent = "Indented first line";
    vi.spyOn(document, "createRange").mockReturnValue({
      selectNodeContents: vi.fn(),
      getClientRects: () => [new DOMRect(160, 184, 100, 20)],
      detach: vi.fn(),
    } as unknown as Range);
    view.rerender({});
    expect(view.controls()).toHaveStyle({ top: "82px" });
    expect(view.controls().style.left).toBe(
      "calc(80px - 49px - var(--folio-block-controls-gap, 8px))",
    );
  });

  it("coalesces captured nested scrolling, viewport resize and observed content changes", () => {
    const view = fixture();
    const actionbar = view.root.querySelector(".folio-editor-actions")!;
    const observed = ResizeObserverMock.instances[0]!;
    expect(observed.targets).toEqual(new Set([view.block, view.root, view.editorDOM, actionbar]));
    const frames = vi.mocked(window.requestAnimationFrame);
    frames.mockClear();
    view.geometry.y += 48;
    act(() => {
      view.scrollContainer.dispatchEvent(new Event("scroll"));
      window.dispatchEvent(new Event("resize"));
      ResizeObserverMock.resize(view.editorDOM);
      ResizeObserverMock.resize(actionbar);
    });
    expect(frames).toHaveBeenCalledTimes(1);
    expect(view.controls()).toHaveStyle({ top: "84px" });
    flushFrame();
    expect(view.controls()).toHaveStyle({ top: "132px" });
    view.geometry.x += 40;
    act(() => ResizeObserverMock.resize(view.root));
    flushFrame();
    expect(view.controls().style.left).toBe(
      "calc(120px - 49px - var(--folio-block-controls-gap, 8px))",
    );
    view.geometry.y += 20;
    act(() => ResizeObserverMock.resize(view.block));
    flushFrame();
    expect(view.controls()).toHaveStyle({ top: "152px" });
  });

  it("reconciles replaced observed elements without requiring a new active block", () => {
    const view = fixture();
    const observed = ResizeObserverMock.instances[0]!;
    const nextEditorDOM = document.createElement("div");
    nextEditorDOM.className = "ProseMirror";
    view.editorDOM.replaceWith(nextEditorDOM);
    nextEditorDOM.append(view.scrollContainer);
    view.rerender({});
    expect(observed.targets.has(view.editorDOM)).toBe(false);
    expect(observed.targets.has(nextEditorDOM)).toBe(true);
    expect(observed.unobserve).toHaveBeenCalledWith(view.editorDOM);
  });

  it("does not rewrite unchanged styles after resize notifications", () => {
    const view = fixture();
    const mutations = new MutationObserver(() => undefined);
    mutations.observe(view.controls(), { attributes: true, attributeFilter: ["style"] });
    act(() => ResizeObserverMock.resize(view.root));
    flushFrame();
    expect(mutations.takeRecords()).toHaveLength(0);
    mutations.disconnect();
  });

  it("hides invalid or detached layouts while preserving the public controls DOM and classes", () => {
    const view = fixture();
    view.geometry.layerHeight = 0;
    view.rerender({});
    expect(view.controls()).toHaveClass("custom-controls");
    expect(view.controls()).not.toBeVisible();
    view.geometry.layerHeight = 300;
    view.rerender({});
    expect(view.controls()).toBeVisible();
    view.block.remove();
    act(() => ResizeObserverMock.resize(view.root));
    flushFrame();
    expect(view.controls()).not.toBeVisible();
    view.rerender({ target: null });
    expect(screen.queryByTestId("folio-block-side-controls")).not.toBeInTheDocument();
  });

  it("cleans up queued frames, captured event listeners, and observers", () => {
    const view = fixture();
    act(() => window.dispatchEvent(new Event("resize")));
    const observer = ResizeObserverMock.instances[0]!;
    view.unmount();
    expect(window.cancelAnimationFrame).toHaveBeenCalledTimes(1);
    expect(observer.disconnect).toHaveBeenCalledOnce();
    const reads = view.rectSpy.mock.calls.length;
    vi.mocked(window.requestAnimationFrame).mockClear();
    act(() => {
      window.dispatchEvent(new Event("resize"));
      window.dispatchEvent(new Event("scroll"));
      view.scrollContainer.dispatchEvent(new Event("scroll"));
    });
    flushFrame();
    expect(window.requestAnimationFrame).not.toHaveBeenCalled();
    expect(view.rectSpy.mock.calls).toHaveLength(reads);
  });

  it("renders on the server without measuring DOM", () => {
    const root = document.createElement("div");
    const block = document.createElement("p");
    root.append(block);
    const measure = vi.spyOn(block, "getBoundingClientRect").mockImplementation(() => {
      throw new Error("Server rendering must not measure layout");
    });
    const html = renderToString(
      <BlockInteractionLayer activeBlock={block} editorRoot={root} onOpenBlockMenu={vi.fn()} />,
    );
    expect(html).toContain("folio-block-side-controls");
    expect(html).toContain("visibility:hidden");
    expect(measure).not.toHaveBeenCalled();
  });
});

it("preserves add-button focus handling without canceling native handle dragging", () => {
  const onDragStart = vi.fn();
  const onDragEnd = vi.fn();
  render(
    <BlockSideControls
      visible
      onAddBlock={vi.fn()}
      onDragBlockStart={onDragStart}
      onDragBlockEnd={onDragEnd}
    />,
  );
  const drag = screen.getByRole("button", { name: "Drag block" });
  const add = screen.getByRole("button", { name: "Add block below" });
  expect(drag).toHaveClass("folio-block-side-controls__button--drag");
  expect(drag).toHaveAttribute("draggable", "true");
  expect(fireEvent.mouseDown(add)).toBe(false);
  expect(fireEvent.mouseDown(drag)).toBe(true);
  expect(fireEvent.dragStart(drag)).toBe(true);
  expect(onDragStart).toHaveBeenCalledOnce();
  expect(onDragStart.mock.calls[0]![0].defaultPrevented).toBe(false);
  fireEvent.dragEnd(drag);
  expect(onDragEnd).toHaveBeenCalledOnce();
});
