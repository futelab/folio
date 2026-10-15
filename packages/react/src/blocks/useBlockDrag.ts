import { useCallback, useEffect, useRef, useState } from "react";
import type { DragEvent, RefObject } from "react";
import type { Editor } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import {
  getLayoutDropTarget,
  getLayoutBlockPosition,
  getTopLevelBlocks,
  scrollBlockDrag,
  type BlockPosition,
} from "./blockDrag";
import { BlockSelection, getSelectedBlocks, clearBlockSelection } from "./blockSelection";
import { moveBlockRange } from "./blockLayout";

interface DragSession {
  source: BlockPosition;
  sources: BlockPosition[];
  range: { from: number; to: number };
  document: Editor["state"]["doc"];
  preview: HTMLElement;
  point?: { x: number; y: number };
  frame?: number;
  cancelled: boolean;
}

function createPreview(editor: Editor, sources: HTMLElement[]): HTMLElement {
  const source = sources[0]!;
  const ownerDocument = source.ownerDocument;
  const preview = ownerDocument.createElement("div");
  preview.className = "folio-editor folio-block-drag-preview";
  preview.setAttribute("aria-hidden", "true");
  preview.inert = true;
  const style = ownerDocument.defaultView!.getComputedStyle(editor.view.dom);
  const rootStyle = ownerDocument.defaultView!.getComputedStyle(
    editor.view.dom.closest(".folio-editor") ?? editor.view.dom,
  );
  for (const property of Array.from(rootStyle)) {
    if (property.startsWith("--folio-"))
      preview.style.setProperty(property, rootStyle.getPropertyValue(property));
  }
  preview.style.font = style.font;
  preview.style.color = style.color;
  preview.style.width = `${Math.min(source.getBoundingClientRect().width, 720)}px`;
  const content = ownerDocument.createElement("div");
  content.className = "folio-block-drag-preview__content";
  for (const source of sources) {
    const clone = source.cloneNode(true) as HTMLElement;
    // Preserve the rendered appearance without creating another .ProseMirror
    // surface or inheriting editable/node-view behavior in the preview.
    const originals = [source, ...source.querySelectorAll<HTMLElement>("*")];
    const copies = [clone, ...clone.querySelectorAll<HTMLElement>("*")];
    originals.forEach((original, index) => {
      const computed = ownerDocument.defaultView!.getComputedStyle(original);
      for (const property of [
        "display",
        "box-sizing",
        "width",
        "height",
        "min-width",
        "max-width",
        "min-height",
        "max-height",
        "font",
        "color",
        "background-color",
        "padding",
        "margin",
        "border",
        "border-radius",
        "line-height",
        "text-align",
        "list-style",
        "white-space",
        "gap",
        "align-items",
        "vertical-align",
        "border-collapse",
        "border-spacing",
        "table-layout",
        "object-fit",
        "grid-template-columns",
        "grid-column",
        "flex",
      ])
        copies[index]!.style.setProperty(property, computed.getPropertyValue(property));
    });
    clone.removeAttribute("id");
    clone.removeAttribute("data-folio-drag-source");
    for (const element of clone.querySelectorAll("[id], [contenteditable], [autofocus]")) {
      element.removeAttribute("id");
      element.removeAttribute("contenteditable");
      element.removeAttribute("autofocus");
    }
    content.append(clone);
  }
  preview.append(content);
  ownerDocument.body.append(preview);
  return preview;
}

export function useBlockDrag(
  editor: Editor | null,
  rootRef: RefObject<HTMLDivElement | null>,
  writable: boolean,
  documentId?: string,
) {
  const sessionRef = useRef<DragSession | null>(null);
  const [sourceKey] = useState(() => new PluginKey<DecorationSet>("folioBlockDragSource"));
  const indicatorRef = useRef<HTMLDivElement>(null);
  const [draggedBlock, setDraggedBlock] = useState<HTMLElement | null>(null);

  const hideIndicator = useCallback(() => {
    if (indicatorRef.current) indicatorRef.current.style.visibility = "hidden";
  }, []);

  const clearVisuals = useCallback(() => {
    const session = sessionRef.current;
    if (session) {
      if (editor && !editor.isDestroyed && sourceKey.getState(editor.state)?.find().length) {
        editor.view.dispatch(editor.state.tr.setMeta(sourceKey, null));
      }
      for (const source of session.sources)
        if (!editor || editor.isDestroyed || !editor.view.dom.contains(source.element))
          source.element.removeAttribute("data-folio-drag-source");
      session.preview.remove();
      if (session.frame !== undefined) {
        session.source.element.ownerDocument.defaultView?.cancelAnimationFrame(session.frame);
        session.frame = undefined;
      }
      session.point = undefined;
    }
    hideIndicator();
    setDraggedBlock(null);
  }, [editor, hideIndicator, sourceKey]);

  const end = useCallback(() => {
    clearVisuals();
    sessionRef.current = null;
  }, [clearVisuals]);

  const cancel = useCallback(() => {
    // Keep a cancelled session until dragend/drop, so a stale native drop cannot
    // fall through to ProseMirror and insert a second copy of the block's text.
    if (sessionRef.current) sessionRef.current.cancelled = true;
    clearVisuals();
  }, [clearVisuals]);

  const updateIndicator = useCallback(() => {
    const session = sessionRef.current;
    const indicator = indicatorRef.current;
    const layer = indicator?.parentElement;
    if (
      !session?.point ||
      session.cancelled ||
      !indicator ||
      !layer ||
      !editor ||
      editor.isDestroyed
    ) {
      hideIndicator();
      return;
    }
    const target = getLayoutDropTarget(editor, session.range, session.point);
    if (!target) {
      hideIndicator();
      return;
    }
    const rect = layer.getBoundingClientRect();
    const style = layer.ownerDocument.defaultView!.getComputedStyle(layer);
    const scaleX = rect.width / (Number.parseFloat(style.width) || layer.offsetWidth) || 1;
    const scaleY = rect.height / (Number.parseFloat(style.height) || layer.offsetHeight) || 1;
    indicator.style.left = `${(target.left - rect.left) / scaleX}px`;
    indicator.style.top = `${(target.top - rect.top) / scaleY}px`;
    indicator.style.width = `${target.width / scaleX}px`;
    indicator.dataset.dropContainer = target.containerType;
    indicator.style.visibility = "visible";
  }, [editor, hideIndicator]);

  const start = useCallback(
    (event: DragEvent<HTMLButtonElement>, block: HTMLElement | null) => {
      const root = rootRef.current;
      const hovered = getLayoutBlockPosition(editor, block);
      if (!writable || !editor || !root || !hovered) {
        event.preventDefault();
        return;
      }
      end();
      const selected = getSelectedBlocks(editor);
      const inSelection =
        editor.state.selection instanceof BlockSelection &&
        selected.some(({ node, pos }) => hovered.pos >= pos && hovered.pos < pos + node.nodeSize);
      const sources = inSelection
        ? getTopLevelBlocks(editor).filter(({ pos }) => selected.some((item) => item.pos === pos))
        : [hovered];
      if (!sources.length) {
        event.preventDefault();
        return;
      }
      if (!inSelection) clearBlockSelection(editor);
      const source = sources[0]!;
      const last = sources.at(-1)!;
      const preview = createPreview(
        editor,
        sources.map(({ element }) => element),
      );
      sessionRef.current = {
        source,
        sources,
        range: { from: source.pos, to: last.pos + last.node.nodeSize },
        document: editor.state.doc,
        preview,
        cancelled: false,
      };
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("application/x-folio-block", "move");
      event.dataTransfer.setData(
        "text/plain",
        sources.map(({ node }) => node.textContent).join("\n\n"),
      );
      event.dataTransfer.setDragImage?.(preview, 12, 12);
      event.stopPropagation();
      editor.view.dispatch(editor.state.tr.setMeta(sourceKey, sources));
      setDraggedBlock(source.element);
    },
    [editor, end, rootRef, sourceKey, writable],
  );

  useEffect(() => {
    const root = rootRef.current;
    const ownerDocument = root?.ownerDocument;
    const ownerWindow = ownerDocument?.defaultView;
    if (!editor || !writable || !root || !ownerDocument || !ownerWindow) {
      end();
      return;
    }
    editor.registerPlugin(
      new Plugin<DecorationSet>({
        key: sourceKey,
        state: {
          init: () => DecorationSet.empty,
          apply: (transaction, decorations) => {
            const sources = transaction.getMeta(sourceKey) as BlockPosition[] | null | undefined;
            if (sources === null) return DecorationSet.empty;
            if (sources)
              return DecorationSet.create(
                transaction.doc,
                sources.map((source) =>
                  Decoration.node(source.pos, source.pos + source.node.nodeSize, {
                    "data-folio-drag-source": "true",
                  }),
                ),
              );
            return decorations.map(transaction.mapping, transaction.doc);
          },
        },
        props: { decorations: (state) => sourceKey.getState(state) },
      }),
    );
    const isValid = () => {
      const session = sessionRef.current;
      return Boolean(
        session &&
        !session.cancelled &&
        !editor.isDestroyed &&
        editor.isEditable &&
        editor.state.doc === session.document &&
        session.sources.every(({ element }) => editor.view.dom.contains(element)),
      );
    };
    const acceptsPoint = (event: globalThis.DragEvent) => {
      if (!(event.target instanceof Node) || !root.contains(event.target)) return false;
      const element = event.target instanceof Element ? event.target : event.target.parentElement;
      if (element?.closest(".folio-editor") !== root) return false;
      if (event.target instanceof Element && event.target.closest(".folio-editor-actions"))
        return false;
      const rect = editor.view.dom.getBoundingClientRect();
      return event.clientY >= rect.top - 16;
    };
    const tick = () => {
      const session = sessionRef.current;
      if (!session) return;
      session.frame = undefined;
      if (!isValid()) {
        cancel();
        return;
      }
      if (!session.point) return;
      scrollBlockDrag(root, session.point.y);
      updateIndicator();
      session.frame = ownerWindow.requestAnimationFrame(tick);
    };
    const onDragOver = (event: globalThis.DragEvent) => {
      const session = sessionRef.current;
      if (!session) return;
      event.preventDefault();
      event.stopPropagation();
      if (!isValid() || !acceptsPoint(event)) {
        session.point = undefined;
        hideIndicator();
        if (event.dataTransfer) event.dataTransfer.dropEffect = "none";
        return;
      }
      session.point = { x: event.clientX, y: event.clientY };
      if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
      updateIndicator();
      if (session.frame === undefined) session.frame = ownerWindow.requestAnimationFrame(tick);
    };
    const onDrop = (event: globalThis.DragEvent) => {
      const session = sessionRef.current;
      if (!session) {
        if (Array.from(event.dataTransfer?.types ?? []).includes("application/x-folio-block")) {
          event.preventDefault();
          event.stopPropagation();
        }
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const target =
        isValid() && acceptsPoint(event)
          ? getLayoutDropTarget(editor, session.range, { x: event.clientX, y: event.clientY })
          : null;
      // Remove the source marker before dispatching a document transaction.
      const range = session.range;
      end();
      if (target) moveBlockRange(editor, range, target);
    };
    const onDragLeave = (event: globalThis.DragEvent) => {
      if (!sessionRef.current) return;
      if (event.target !== root && event.target !== ownerDocument.documentElement) return;
      if (!(event.relatedTarget instanceof Node) || !root.contains(event.relatedTarget)) {
        sessionRef.current.point = undefined;
        hideIndicator();
      }
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape" && sessionRef.current) {
        event.preventDefault();
        event.stopPropagation();
        cancel();
      }
    };
    const onTransaction = () => {
      if (sessionRef.current && !sessionRef.current.cancelled && !isValid()) cancel();
    };
    const onVisibilityChange = () => {
      if (ownerDocument.hidden) cancel();
    };
    ownerDocument.addEventListener("dragover", onDragOver, true);
    ownerDocument.addEventListener("drop", onDrop, true);
    ownerDocument.addEventListener("dragend", end, true);
    ownerDocument.addEventListener("dragleave", onDragLeave, true);
    ownerDocument.addEventListener("keydown", onKeyDown, true);
    ownerDocument.addEventListener("visibilitychange", onVisibilityChange);
    ownerWindow.addEventListener("blur", cancel);
    editor.on("transaction", onTransaction);
    return () => {
      ownerDocument.removeEventListener("dragover", onDragOver, true);
      ownerDocument.removeEventListener("drop", onDrop, true);
      ownerDocument.removeEventListener("dragend", end, true);
      ownerDocument.removeEventListener("dragleave", onDragLeave, true);
      ownerDocument.removeEventListener("keydown", onKeyDown, true);
      ownerDocument.removeEventListener("visibilitychange", onVisibilityChange);
      ownerWindow.removeEventListener("blur", cancel);
      editor.off("transaction", onTransaction);
      end();
      if (!editor.isDestroyed) editor.unregisterPlugin(sourceKey);
    };
  }, [
    cancel,
    editor,
    end,
    hideIndicator,
    rootRef,
    sourceKey,
    updateIndicator,
    writable,
    documentId,
  ]);

  return { draggedBlock, indicatorRef, start, end };
}
