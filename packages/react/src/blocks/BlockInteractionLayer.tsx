import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import type { DragEvent, MouseEvent } from "react";
import type { FolioMessages } from "../i18n";
import { BlockSideControls } from "./BlockSideControls";
import { getBlockAnchor } from "./blockDom";

export interface BlockInteractionLayerProps {
  activeBlock: HTMLElement | null;
  editorRoot: HTMLElement | null;
  className?: string;
  messages?: FolioMessages;
  sideControlsClassName?: string;
  onDragBlockEnd?: () => void;
  onDragBlockStart?: (event: DragEvent<HTMLButtonElement>) => void;
  onOpenBlockMenu: () => void;
  onOpenBlockActions?: (event: MouseEvent<HTMLButtonElement>) => void;
}

function classNames(...values: Array<string | undefined>): string {
  return values.filter(Boolean).join(" ");
}

const useBrowserLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function BlockInteractionLayer({
  activeBlock,
  editorRoot,
  className,
  messages,
  sideControlsClassName,
  onDragBlockEnd,
  onDragBlockStart,
  onOpenBlockMenu,
  onOpenBlockActions,
}: BlockInteractionLayerProps) {
  const layerRef = useRef<HTMLDivElement>(null);
  const observeRef = useRef<(() => void) | null>(null);
  const position = useCallback(() => {
    const layer = layerRef.current;
    const controls = layer?.querySelector<HTMLElement>(".folio-block-side-controls");
    if (!layer || !controls) return;
    const hide = () => {
      if (controls.style.visibility !== "hidden") controls.style.visibility = "hidden";
    };
    if (
      !editorRoot ||
      !activeBlock ||
      !layer.isConnected ||
      !editorRoot.isConnected ||
      !activeBlock.isConnected ||
      !editorRoot.contains(activeBlock)
    ) {
      hide();
      return;
    }

    const overlayRect = layer.getBoundingClientRect();
    const anchor = getBlockAnchor(activeBlock);
    const blockRect = activeBlock.getBoundingClientRect();
    const controlsRect = controls.getBoundingClientRect();
    const scaleX = overlayRect.width / layer.offsetWidth;
    const scaleY = overlayRect.height / layer.offsetHeight;
    if (
      !Number.isFinite(scaleX) ||
      scaleX <= 0 ||
      !Number.isFinite(scaleY) ||
      scaleY <= 0 ||
      overlayRect.width <= 0 ||
      controlsRect.width <= 0 ||
      controlsRect.height <= 0 ||
      anchor.rect.height <= 0
    ) {
      hide();
      return;
    }

    // Absolute offsets use the overlay's padding edge, in unscaled CSS pixels.
    // Its rect already accounts for ancestor borders and scroll offsets.
    // Media uses its first controls-height row, so captions and tall images
    // cannot pull the grip down. Short images still center on their visible area.
    const anchorHeight =
      anchor.alignment === "start"
        ? Math.min(controlsRect.height, anchor.rect.height)
        : anchor.rect.height;
    const top =
      (anchor.rect.top + anchorHeight / 2 - overlayRect.top) / scaleY -
      layer.clientTop +
      layer.scrollTop -
      controlsRect.height / scaleY / 2;
    const anchorLeft =
      (blockRect.left - overlayRect.left) / scaleX - layer.clientLeft + layer.scrollLeft;
    const controlsWidth = controlsRect.width / scaleX;
    if (!Number.isFinite(top) || !Number.isFinite(anchorLeft)) {
      hide();
      return;
    }
    const topStyle = `${top}px`;
    const leftStyle = `calc(${anchorLeft}px - ${controlsWidth}px - var(--folio-block-controls-gap, 8px))`;
    if (controls.style.top !== topStyle) controls.style.top = topStyle;
    if (controls.style.left !== leftStyle) controls.style.left = leftStyle;
    if (controls.style.visibility !== "visible") controls.style.visibility = "visible";
  }, [activeBlock, editorRoot]);

  useBrowserLayoutEffect(() => {
    const layer = layerRef.current;
    const view = layer?.ownerDocument.defaultView;
    if (!layer || !view || !activeBlock || !editorRoot) return;
    const ownerWindow = view;
    const root = editorRoot;
    const block = activeBlock;

    let disposed = false;
    let frame: number | null = null;
    const useAnimationFrame = typeof ownerWindow.requestAnimationFrame === "function";

    function schedule() {
      if (disposed || frame !== null) return;
      const update = () => {
        frame = null;
        if (!disposed) position();
      };
      frame = useAnimationFrame
        ? ownerWindow.requestAnimationFrame(update)
        : ownerWindow.setTimeout(update, 16);
    }

    const observer =
      typeof ownerWindow.ResizeObserver === "function"
        ? new ownerWindow.ResizeObserver(schedule)
        : null;
    const observed = new Set<HTMLElement>();
    function observe() {
      if (!observer) return;
      const targets = new Set(
        [
          block,
          root,
          root.querySelector<HTMLElement>(".ProseMirror"),
          root.querySelector<HTMLElement>(".folio-editor-actions"),
        ].filter((element): element is HTMLElement => element !== null),
      );
      for (const element of observed)
        if (!targets.has(element)) {
          observer.unobserve(element);
          observed.delete(element);
        }
      for (const element of targets)
        if (!observed.has(element)) {
          observer.observe(element);
          observed.add(element);
        }
    }

    observeRef.current = observe;
    const scrollOptions = { capture: true, passive: true };
    layer.ownerDocument.addEventListener("scroll", schedule, scrollOptions);
    ownerWindow.addEventListener("scroll", schedule, scrollOptions);
    ownerWindow.addEventListener("resize", schedule, scrollOptions);

    return () => {
      disposed = true;
      if (frame !== null) {
        if (useAnimationFrame) ownerWindow.cancelAnimationFrame(frame);
        else ownerWindow.clearTimeout(frame);
      }
      observer?.disconnect();
      layer.ownerDocument.removeEventListener("scroll", schedule, true);
      ownerWindow.removeEventListener("scroll", schedule, true);
      ownerWindow.removeEventListener("resize", schedule, true);
      observeRef.current = null;
    };
  }, [activeBlock, editorRoot, position]);

  // Parent commits can move content without changing the active block's identity.
  useBrowserLayoutEffect(() => {
    observeRef.current?.();
    position();
  });

  return (
    <div className={classNames("folio-block-interaction-layer", className)} ref={layerRef}>
      <BlockSideControls
        className={sideControlsClassName}
        messages={messages}
        onAddBlock={onOpenBlockMenu}
        onOpenBlockActions={onOpenBlockActions}
        onDragBlockEnd={onDragBlockEnd}
        onDragBlockStart={onDragBlockStart}
        style={{ visibility: "hidden" }}
        visible={Boolean(activeBlock && editorRoot)}
      />
    </div>
  );
}
