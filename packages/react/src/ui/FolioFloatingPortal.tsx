import { useCallback, useEffect, useLayoutEffect, useRef, useSyncExternalStore } from "react";
import type { CSSProperties, MouseEvent, ReactNode } from "react";
import { createPortal } from "react-dom";
import { isFolioEditorUIElement, useFolioUIContext } from "./FolioUIContext";

export interface FolioFloatingPortalProps {
  children: ReactNode;
  className?: string;
  /** Dialogs use the viewport; menus retain their editor-relative coordinates. */
  coordinateSpace?: "editor" | "viewport";
  /** Keeps pointer-operated actions from collapsing the editor's selection. */
  preserveSelection?: boolean;
}

const useBrowserLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;
const subscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;
const probeStyle: CSSProperties = {
  position: "fixed",
  left: 0,
  top: 0,
  width: 100,
  height: 100,
  margin: 0,
  padding: 0,
  border: 0,
  boxSizing: "border-box",
  overflow: "visible",
  pointerEvents: "none",
  zIndex: 1000,
};
const canvasStyle: CSSProperties = {
  position: "absolute",
  left: 0,
  top: 0,
  margin: 0,
  padding: 0,
  border: 0,
  background: "transparent",
  boxSizing: "border-box",
  overflow: "visible",
  pointerEvents: "none",
  transformOrigin: "0 0",
  visibility: "hidden",
};
const inheritedProperties = [
  "font-family",
  "font-size",
  "font-style",
  "font-weight",
  "font-variant",
  "line-height",
  "letter-spacing",
  "color",
  "color-scheme",
  "direction",
  "text-align",
  "text-transform",
  "writing-mode",
];

function setStyle(element: HTMLElement, name: string, value: string) {
  if (element.style.getPropertyValue(name) !== value) element.style.setProperty(name, value);
}

function borderBoxSize(
  element: HTMLElement,
  style: CSSStyleDeclaration,
  dimension: "width" | "height",
) {
  const size = Number.parseFloat(style.getPropertyValue(dimension));
  if (!Number.isFinite(size))
    return dimension === "width" ? element.offsetWidth : element.offsetHeight;
  if (style.boxSizing === "border-box") return size;
  const sides = dimension === "width" ? ["left", "right"] : ["top", "bottom"];
  return sides.reduce(
    (total, side) =>
      total +
      (Number.parseFloat(style.getPropertyValue(`padding-${side}`)) || 0) +
      (Number.parseFloat(style.getPropertyValue(`border-${side}-width`)) || 0),
    size,
  );
}

/**
 * Mirrors the editor's coordinate system in an external DOM destination.
 * The destination may be positioned, scrolled, or scaled; an unstyled fixed
 * probe measures its actual containing block rather than assuming document.body.
 */
export function FolioFloatingPortal({
  children,
  className,
  coordinateSpace = "editor",
  preserveSelection = true,
}: FolioFloatingPortalProps) {
  const context = useFolioUIContext();
  const hydrated = useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
  const container = context?.portalContainer;
  const probeRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const refreshRef = useRef<(() => void) | null>(null);
  const customPropertiesRef = useRef(new Set<string>());

  const position = useCallback(() => {
    const probe = probeRef.current;
    const canvas = canvasRef.current;
    const root = context?.rootRef.current;
    if (!probe || !canvas) return;
    const ownerWindow = probe.ownerDocument.defaultView;
    if (
      !root?.isConnected ||
      !probe.isConnected ||
      root.ownerDocument !== probe.ownerDocument ||
      !ownerWindow
    ) {
      setStyle(canvas, "visibility", "hidden");
      return;
    }
    const rect = root.getBoundingClientRect();
    const probeRect = probe.getBoundingClientRect();
    const rootStyle = ownerWindow.getComputedStyle(root);
    const rootWidth = borderBoxSize(root, rootStyle, "width");
    const rootHeight = borderBoxSize(root, rootStyle, "height");
    const portalScaleX = probeRect.width / 100;
    const portalScaleY = probeRect.height / 100;
    const rootScaleX = rect.width / rootWidth;
    const rootScaleY = rect.height / rootHeight;
    if (
      [portalScaleX, portalScaleY, rootScaleX, rootScaleY].some(
        (value) => !Number.isFinite(value) || value <= 0,
      )
    ) {
      setStyle(canvas, "visibility", "hidden");
      return;
    }
    const viewport = coordinateSpace === "viewport";
    const x = viewport ? 0 : rect.left + (root.clientLeft - root.scrollLeft) * rootScaleX;
    const y = viewport ? 0 : rect.top + (root.clientTop - root.scrollTop) * rootScaleY;
    const scaleX = (viewport ? 1 : rootScaleX) / portalScaleX;
    const scaleY = (viewport ? 1 : rootScaleY) / portalScaleY;
    setStyle(canvas, "left", `${(x - probeRect.left) / portalScaleX}px`);
    setStyle(canvas, "top", `${(y - probeRect.top) / portalScaleY}px`);
    setStyle(canvas, "width", `${viewport ? ownerWindow.innerWidth : root.clientWidth}px`);
    setStyle(canvas, "height", `${viewport ? ownerWindow.innerHeight : root.clientHeight}px`);
    // Viewport dialogs need an explicit viewport-sized fixed containing block,
    // even when their destination itself happens to be unscaled.
    setStyle(
      canvas,
      "transform",
      !viewport && scaleX === 1 && scaleY === 1 ? "none" : `scale(${scaleX}, ${scaleY})`,
    );
    for (const property of inheritedProperties)
      setStyle(canvas, property, rootStyle.getPropertyValue(property));
    const properties = new Set<string>();
    for (const property of Array.from(rootStyle))
      if (property.startsWith("--folio-")) {
        properties.add(property);
        setStyle(canvas, property, rootStyle.getPropertyValue(property));
      }
    for (const property of customPropertiesRef.current)
      if (!properties.has(property)) canvas.style.removeProperty(property);
    customPropertiesRef.current = properties;
    setStyle(canvas, "visibility", "visible");
  }, [context?.rootRef, coordinateSpace]);

  useBrowserLayoutEffect(() => {
    const probe = probeRef.current;
    const ownerWindow = probe?.ownerDocument.defaultView;
    if (!container || !probe || !ownerWindow || !context) return;
    const view = ownerWindow;
    let frame: number | null = null;
    let disposed = false;
    const animationFrame = typeof view.requestAnimationFrame === "function";
    const schedule = () => {
      if (disposed || frame !== null) return;
      const update = () => {
        frame = null;
        if (!disposed) refresh();
      };
      frame = animationFrame ? view.requestAnimationFrame(update) : view.setTimeout(update, 16);
    };
    const observer =
      typeof view.ResizeObserver === "function" ? new view.ResizeObserver(schedule) : null;
    const mutations =
      typeof view.MutationObserver === "function" ? new view.MutationObserver(schedule) : null;
    const observed = new Set<Element>();
    let ancestors = new Set<Element>();
    function refresh() {
      const root = context!.rootRef.current;
      const targets = new Set<Element>([container!]);
      if (root) {
        targets.add(root);
        for (const selector of [".ProseMirror", ".folio-editor-actions"]) {
          const element = root.querySelector(selector);
          if (element) targets.add(element);
        }
      }
      for (const element of observed)
        if (!targets.has(element)) {
          observer?.unobserve(element);
          observed.delete(element);
        }
      for (const element of targets)
        if (!observed.has(element)) {
          observer?.observe(element);
          observed.add(element);
        }
      const nextAncestors = new Set<Element>();
      for (const start of [root, container])
        for (
          let element: HTMLElement | null = start ?? null;
          element;
          element = element.parentElement
        )
          nextAncestors.add(element);
      if (
        nextAncestors.size !== ancestors.size ||
        [...nextAncestors].some((element) => !ancestors.has(element))
      ) {
        mutations?.disconnect();
        for (const element of nextAncestors)
          mutations?.observe(element, {
            attributes: true,
            attributeFilter: ["class", "style", "dir"],
          });
        ancestors = nextAncestors;
      }
      position();
    }
    refreshRef.current = refresh;
    const options = { capture: true, passive: true };
    probe.ownerDocument.addEventListener("scroll", schedule, options);
    view.addEventListener("scroll", schedule, options);
    view.addEventListener("resize", schedule, options);
    view.visualViewport?.addEventListener("resize", schedule, options);
    view.visualViewport?.addEventListener("scroll", schedule, options);
    // Parent host refs may attach after this child layout effect on first mount.
    schedule();
    return () => {
      disposed = true;
      if (frame !== null) {
        if (animationFrame) view.cancelAnimationFrame(frame);
        else view.clearTimeout(frame);
      }
      observer?.disconnect();
      mutations?.disconnect();
      probe.ownerDocument.removeEventListener("scroll", schedule, true);
      view.removeEventListener("scroll", schedule, true);
      view.removeEventListener("resize", schedule, true);
      view.visualViewport?.removeEventListener("resize", schedule, true);
      view.visualViewport?.removeEventListener("scroll", schedule, true);
      refreshRef.current = null;
    };
  }, [container, context?.rootRef, hydrated, position]);

  useBrowserLayoutEffect(() => {
    refreshRef.current?.();
  });

  function preserveFocus(event: MouseEvent<HTMLDivElement>) {
    if (!context || !isFolioEditorUIElement(event.target, context.ownerId)) return;
    context?.onInteraction?.(event.nativeEvent);
    if (!preserveSelection || event.button !== 0 || event.defaultPrevented) return;
    const target = event.target as Element;
    if (
      typeof target.closest !== "function" ||
      target.closest(
        'input, textarea, select, label, [contenteditable]:not([contenteditable="false"]), [draggable="true"]',
      )
    )
      return;
    event.preventDefault();
  }

  if (!hydrated || !container || !context) return <>{children}</>;
  return createPortal(
    <div
      className="folio-ui-portal"
      data-folio-editor-owner={context.ownerId}
      ref={probeRef}
      style={probeStyle}
    >
      <div
        className={["folio-editor", "folio-ui-portal__canvas", className].filter(Boolean).join(" ")}
        data-folio-coordinate-space={coordinateSpace}
        ref={canvasRef}
        style={canvasStyle}
        onFocusCapture={(event) => {
          if (isFolioEditorUIElement(event.target, context.ownerId))
            context.onInteraction?.(event.nativeEvent);
        }}
        onPointerDownCapture={(event) => {
          if (isFolioEditorUIElement(event.target, context.ownerId))
            context.onInteraction?.(event.nativeEvent);
        }}
        onMouseDownCapture={preserveFocus}
      >
        <div style={{ display: "contents", pointerEvents: "auto" }}>{children}</div>
      </div>
    </div>,
    container,
  );
}
