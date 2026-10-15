import "@testing-library/jest-dom/vitest";
import { useRef } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FolioFloatingPortal,
  FolioUIProvider,
  isFolioEditorUIElement,
  useFolioUIContext,
} from "..";

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

function flushFrame() {
  act(() => vi.advanceTimersByTime(16));
}

function fixture(
  options: {
    coordinateSpace?: "editor" | "viewport";
    preserveSelection?: boolean;
    inline?: boolean;
  } = {},
) {
  const ancestor = document.createElement("section");
  const root = document.createElement("div");
  const editorDOM = document.createElement("div");
  const toolbar = document.createElement("div");
  const destination = document.createElement("div");
  root.className = "folio-editor";
  root.setAttribute("data-folio-editor-owner", "editor-one");
  root.style.cssText =
    "width:600px;height:300px;box-sizing:border-box;font-family:Georgia;font-size:18px;line-height:1.8;color:rgb(10, 20, 30);direction:rtl;--folio-color-bg:rgb(30, 40, 50);--folio-accent:purple";
  editorDOM.className = "ProseMirror";
  editorDOM.textContent = "Selected text";
  toolbar.className = "folio-editor-actions";
  root.append(toolbar, editorDOM);
  ancestor.append(root);
  document.body.append(ancestor, destination);
  const geometry = {
    x: 100,
    y: 200,
    scaleX: 1,
    scaleY: 1,
    portalX: 0,
    portalY: 0,
    portalScaleX: 1,
    portalScaleY: 1,
    borderX: 2,
    borderY: 4,
    scrollX: 0,
    scrollY: 0,
    clientWidth: 596,
    clientHeight: 292,
  };
  const nativeRect = HTMLElement.prototype.getBoundingClientRect;
  const measure = vi
    .spyOn(HTMLElement.prototype, "getBoundingClientRect")
    .mockImplementation(function (this: HTMLElement) {
      if (this === root)
        return new DOMRect(geometry.x, geometry.y, 600 * geometry.scaleX, 300 * geometry.scaleY);
      if (this.classList.contains("folio-ui-portal"))
        return new DOMRect(
          geometry.portalX,
          geometry.portalY,
          100 * geometry.portalScaleX,
          100 * geometry.portalScaleY,
        );
      return nativeRect.call(this);
    });
  Object.defineProperties(root, {
    offsetWidth: { configurable: true, get: () => 600 },
    offsetHeight: { configurable: true, get: () => 300 },
    clientWidth: { configurable: true, get: () => geometry.clientWidth },
    clientHeight: { configurable: true, get: () => geometry.clientHeight },
    clientLeft: { configurable: true, get: () => geometry.borderX },
    clientTop: { configurable: true, get: () => geometry.borderY },
    scrollLeft: { configurable: true, get: () => geometry.scrollX },
    scrollTop: { configurable: true, get: () => geometry.scrollY },
  });
  const rootRef = { current: root as HTMLElement | null };
  const interaction = vi.fn();
  function Harness({
    ownerId = "editor-one",
    container = options.inline ? null : destination,
    space = options.coordinateSpace ?? "editor",
  }: {
    ownerId?: string;
    container?: HTMLElement | null;
    space?: "editor" | "viewport";
  }) {
    return (
      <FolioUIProvider
        ownerId={ownerId}
        rootRef={rootRef}
        portalContainer={container}
        onInteraction={interaction}
      >
        <FolioFloatingPortal coordinateSpace={space} preserveSelection={options.preserveSelection}>
          <div className="custom-menu" style={{ position: "absolute", left: 20, top: 30 }}>
            <button type="button">Action</button>
            <label>
              Upload
              <input aria-label="File" type="file" />
            </label>
            <input aria-label="URL" />
            <select aria-label="Choice">
              <option>One</option>
            </select>
            <button draggable type="button">
              Drag
            </button>
            <div contentEditable suppressContentEditableWarning>
              Editable control
            </div>
          </div>
        </FolioFloatingPortal>
      </FolioUIProvider>
    );
  }
  const view = render(<Harness />);
  return {
    ...view,
    root,
    ancestor,
    editorDOM,
    toolbar,
    destination,
    geometry,
    rootRef,
    interaction,
    measure,
    canvas: () => destination.querySelector<HTMLElement>(".folio-ui-portal__canvas")!,
    rerender: (props: Parameters<typeof Harness>[0] = {}) => view.rerender(<Harness {...props} />),
  };
}

describe("external floating UI", () => {
  it("retains editor coordinates, theme, owner identity and independent pointer targets", () => {
    const view = fixture();
    expect(view.destination).toContainElement(screen.getByRole("button", { name: "Action" }));
    expect(view.canvas()).toHaveStyle({
      left: "102px",
      top: "204px",
      width: "596px",
      height: "292px",
      transform: "none",
      visibility: "visible",
      pointerEvents: "none",
      background: "transparent",
    });
    expect(view.canvas()).toHaveStyle({
      fontFamily: "Georgia",
      fontSize: "18px",
      lineHeight: "1.8",
      color: "rgb(10, 20, 30)",
      direction: "rtl",
    });
    expect(view.canvas().style.getPropertyValue("--folio-accent")).toBe("purple");
    expect(view.canvas().firstElementChild).toHaveStyle({
      display: "contents",
      pointerEvents: "auto",
    });
    expect(isFolioEditorUIElement(screen.getByText("Action"), "editor-one")).toBe(true);
    expect(isFolioEditorUIElement(view.editorDOM.firstChild, "editor-one")).toBe(true);
    expect(isFolioEditorUIElement(screen.getByText("Action"), "editor-two")).toBe(false);
    expect(isFolioEditorUIElement(window, "editor-one")).toBe(false);
  });

  it("maps root scaling, borders and internal scroll through a transformed portal destination", () => {
    const view = fixture();
    Object.assign(view.geometry, {
      scaleX: 2,
      scaleY: 1.5,
      portalX: 40,
      portalY: 60,
      portalScaleX: 0.5,
      portalScaleY: 2,
      borderX: 3,
      scrollX: 10,
      scrollY: 20,
    });
    act(() => window.dispatchEvent(new Event("resize")));
    flushFrame();
    expect(view.canvas()).toHaveStyle({ left: "92px", top: "58px", transform: "scale(4, 0.75)" });
    view.geometry.portalY = 20;
    act(() => view.destination.dispatchEvent(new Event("scroll")));
    flushFrame();
    expect(view.canvas()).toHaveStyle({ top: "78px" });
  });

  it("gives full-screen dialogs an actual viewport-sized fixed containing block", () => {
    const view = fixture({ coordinateSpace: "viewport" });
    expect(view.canvas()).toHaveStyle({
      left: "0px",
      top: "0px",
      width: `${window.innerWidth}px`,
      height: `${window.innerHeight}px`,
      transform: "scale(1, 1)",
    });
    Object.assign(view.geometry, {
      scaleX: 2,
      scaleY: 2,
      portalX: 40,
      portalY: 60,
      portalScaleX: 0.5,
      portalScaleY: 2,
    });
    act(() => window.dispatchEvent(new Event("resize")));
    flushFrame();
    expect(view.canvas()).toHaveStyle({ left: "-80px", top: "-30px", transform: "scale(2, 0.5)" });
  });

  it("follows committed layout and coalesces scroll, resize and observed element updates", () => {
    const view = fixture();
    flushFrame();
    const observer = ResizeObserverMock.instances[0]!;
    expect(observer.targets).toEqual(
      new Set([view.root, view.destination, view.editorDOM, view.toolbar]),
    );
    vi.mocked(window.requestAnimationFrame).mockClear();
    view.geometry.y += 40;
    act(() => {
      view.editorDOM.dispatchEvent(new Event("scroll"));
      window.dispatchEvent(new Event("resize"));
      ResizeObserverMock.resize(view.root);
    });
    expect(window.requestAnimationFrame).toHaveBeenCalledOnce();
    expect(view.canvas()).toHaveStyle({ top: "204px" });
    flushFrame();
    expect(view.canvas()).toHaveStyle({ top: "244px" });
    view.geometry.y += 20;
    view.rerender();
    expect(view.canvas()).toHaveStyle({ top: "264px" });
  });

  it("updates changed theme properties and removes stale root overrides", async () => {
    const view = fixture();
    flushFrame();
    await act(async () => {
      view.root.style.setProperty("--folio-accent", "orange");
      view.root.style.fontFamily = "Verdana";
    });
    flushFrame();
    expect(view.canvas().style.getPropertyValue("--folio-accent")).toBe("orange");
    expect(view.canvas()).toHaveStyle({ fontFamily: "Verdana" });
    await act(async () => {
      view.root.style.removeProperty("--folio-accent");
    });
    flushFrame();
    expect(view.canvas().style.getPropertyValue("--folio-accent")).toBe("");
  });

  it("refreshes observer targets and hides detached editor geometry", () => {
    const view = fixture();
    const nextDOM = document.createElement("div");
    nextDOM.className = "ProseMirror";
    view.editorDOM.replaceWith(nextDOM);
    view.rerender();
    const observer = ResizeObserverMock.instances[0]!;
    expect(observer.targets.has(nextDOM)).toBe(true);
    expect(observer.targets.has(view.editorDOM)).toBe(false);
    view.root.remove();
    act(() => window.dispatchEvent(new Event("resize")));
    flushFrame();
    expect(view.canvas()).toHaveStyle({ visibility: "hidden" });
    view.ancestor.append(view.root);
    view.rerender();
    expect(view.canvas()).toHaveStyle({ visibility: "visible" });
  });

  it("preserves pointer selections while allowing inputs, labels, editable controls and native drag", () => {
    const view = fixture();
    const range = document.createRange();
    range.selectNodeContents(view.editorDOM);
    document.getSelection()!.removeAllRanges();
    document.getSelection()!.addRange(range);
    expect(fireEvent.mouseDown(screen.getByRole("button", { name: "Action" }))).toBe(false);
    expect(document.getSelection()!.toString()).toBe("Selected text");
    expect(view.interaction).toHaveBeenCalled();
    expect(fireEvent.mouseDown(screen.getByLabelText("URL"))).toBe(true);
    expect(fireEvent.mouseDown(screen.getByLabelText("Choice"))).toBe(true);
    expect(fireEvent.mouseDown(screen.getByText("Upload"))).toBe(true);
    expect(fireEvent.mouseDown(screen.getByText("Editable control"))).toBe(true);
    expect(fireEvent.mouseDown(screen.getByRole("button", { name: "Drag" }))).toBe(true);
    expect(fireEvent.mouseDown(screen.getByRole("button", { name: "Action" }), { button: 2 })).toBe(
      true,
    );
    act(() => screen.getByLabelText("URL").focus());
    expect(document.activeElement).toBe(screen.getByLabelText("URL"));
    expect(view.interaction.mock.calls.some(([event]) => event.type === "focusin")).toBe(true);
  });

  it("can leave pointer focus to a custom component", () => {
    fixture({ preserveSelection: false });
    expect(fireEvent.mouseDown(screen.getByRole("button", { name: "Action" }))).toBe(true);
  });

  it("distinguishes nested editor ownership", () => {
    const view = fixture();
    const nested = document.createElement("div");
    nested.setAttribute("data-folio-editor-owner", "nested");
    const button = document.createElement("button");
    nested.append(button);
    view.canvas().append(nested);
    expect(isFolioEditorUIElement(button, "editor-one")).toBe(false);
    expect(isFolioEditorUIElement(button, "nested")).toBe(true);
    expect(isFolioEditorUIElement(null, "editor-one")).toBe(false);
    view.interaction.mockClear();
    expect(fireEvent.mouseDown(button)).toBe(true);
    expect(view.interaction).not.toHaveBeenCalled();
  });

  it("removes portals, pending work, observers and document subscriptions on unmount", () => {
    const view = fixture();
    const observer = ResizeObserverMock.instances[0]!;
    view.unmount();
    expect(view.destination).toBeEmptyDOMElement();
    expect(observer.disconnect).toHaveBeenCalledOnce();
    expect(window.cancelAnimationFrame).toHaveBeenCalledOnce();
    const reads = view.measure.mock.calls.length;
    vi.mocked(window.requestAnimationFrame).mockClear();
    act(() => {
      window.dispatchEvent(new Event("resize"));
      view.root.dispatchEvent(new Event("scroll"));
      ResizeObserverMock.resize(view.root);
    });
    flushFrame();
    expect(window.requestAnimationFrame).not.toHaveBeenCalled();
    expect(view.measure.mock.calls).toHaveLength(reads);
  });

  it("leaves inline UI unchanged without an external destination or provider", () => {
    const view = fixture({ inline: true });
    expect(view.destination).toBeEmptyDOMElement();
    expect(screen.getByRole("button", { name: "Action" })).toBeInTheDocument();
    expect(document.querySelector(".folio-ui-portal")).toBeNull();
    expect(ResizeObserverMock.instances).toHaveLength(0);
    view.unmount();
    render(
      <FolioFloatingPortal>
        <span>Standalone</span>
      </FolioFloatingPortal>,
    );
    expect(screen.getByText("Standalone")).toBeInTheDocument();
  });

  it("exposes the provider to custom slots and waits for parent host refs on first mount", () => {
    const destination = document.createElement("div");
    document.body.append(destination);
    function Slot() {
      return <span>{useFolioUIContext()?.ownerId}</span>;
    }
    function Harness() {
      const ref = useRef<HTMLDivElement>(null);
      return (
        <FolioUIProvider ownerId="custom-owner" rootRef={ref} portalContainer={destination}>
          <div ref={ref}>
            <FolioFloatingPortal>
              <Slot />
            </FolioFloatingPortal>
          </div>
        </FolioUIProvider>
      );
    }
    render(<Harness />);
    expect(screen.getByText("custom-owner")).toBeInTheDocument();
    flushFrame();
    expect(ResizeObserverMock.instances[0]!.targets.size).toBeGreaterThan(1);
  });

  it("server-renders inline markup even if a DOM container was passed, without measuring", () => {
    const destination = document.createElement("div");
    const root = document.createElement("div");
    const measure = vi.spyOn(root, "getBoundingClientRect").mockImplementation(() => {
      throw new Error("SSR must not measure");
    });
    const html = renderToString(
      <FolioUIProvider ownerId="server" rootRef={{ current: root }} portalContainer={destination}>
        <FolioFloatingPortal>
          <button>Server action</button>
        </FolioFloatingPortal>
      </FolioUIProvider>,
    );
    expect(html).toBe("<button>Server action</button>");
    expect(destination).toBeEmptyDOMElement();
    expect(measure).not.toHaveBeenCalled();
  });

  it("hydrates server markup before moving it to the requested portal destination", async () => {
    const host = document.createElement("div");
    const destination = document.createElement("div");
    document.body.append(host, destination);
    const tree = (
      <FolioUIProvider ownerId="hydrated" rootRef={{ current: host }} portalContainer={destination}>
        <FolioFloatingPortal>
          <button>Hydrated action</button>
        </FolioFloatingPortal>
      </FolioUIProvider>
    );
    host.innerHTML = renderToString(tree);
    const recoverable = vi.fn();
    let root: ReturnType<typeof hydrateRoot>;
    await act(async () => {
      root = hydrateRoot(host, tree, { onRecoverableError: recoverable });
    });
    expect(recoverable).not.toHaveBeenCalled();
    expect(host).not.toContainElement(screen.getByText("Hydrated action"));
    expect(destination).toContainElement(screen.getByText("Hydrated action"));
    await act(async () => root!.unmount());
    expect(destination).toBeEmptyDOMElement();
  });
});
