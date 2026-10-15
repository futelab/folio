import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type { Editor } from "@tiptap/core";
import {
  BlockSelection,
  clearBlockSelection,
  createBlockSelectionPlugin,
  setBlockSelection,
  blockSelectionPluginKey,
} from "./blockSelection";
import { getTopLevelBlocks, scrollBlockDrag } from "./blockDrag";
import { isFolioEditorUIElement } from "../ui";

export function useBlockSelection(
  editor: Editor | null,
  rootRef: RefObject<HTMLDivElement | null>,
  ownerId: string,
  enabled: boolean,
) {
  const marqueeRef = useRef<HTMLDivElement>(null);
  const [selecting, setSelecting] = useState(false);
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    editor.registerPlugin(createBlockSelectionPlugin());
    const root = rootRef.current;
    const document = root?.ownerDocument;
    const window = document?.defaultView;
    if (!root || !document || !window)
      return () => {
        if (!editor.isDestroyed) editor.unregisterPlugin(blockSelectionPluginKey);
      };
    let drag:
      | {
          x: number;
          y: number;
          anchor: number;
          pointerId: number;
          document: typeof editor.state.doc;
        }
      | undefined;
    let frame: number | undefined;
    let point: { x: number; y: number } | undefined;
    const nearest = (y: number) => {
      const blocks = getTopLevelBlocks(editor);
      let nearest = blocks[0],
        distance = Infinity;
      for (const block of blocks) {
        const rect = block.element.getBoundingClientRect();
        const next = Math.max(rect.top - y, y - rect.bottom, 0);
        if (next < distance) {
          nearest = block;
          distance = next;
        }
        if (next === 0) break;
      }
      return nearest;
    };
    const move = () => {
      frame = undefined;
      if (!drag || !point || editor.isDestroyed) return;
      const block = nearest(point.y);
      if (block) setBlockSelection(editor, drag.anchor, block.pos);
      const marquee = marqueeRef.current;
      if (marquee) {
        marquee.style.left = `${Math.min(point.x, drag.x)}px`;
        marquee.style.top = `${Math.min(point.y, drag.y)}px`;
        marquee.style.width = `${Math.max(2, Math.abs(point.x - drag.x))}px`;
        marquee.style.height = `${Math.max(2, Math.abs(point.y - drag.y))}px`;
      }
      if (scrollBlockDrag(root, point.y)) frame = window.requestAnimationFrame(move);
    };
    const onDown = (event: PointerEvent) => {
      if (!enabled || event.button !== 0 || editor.isDestroyed) return;
      const element = event.target instanceof Element ? event.target : null;
      if (
        element?.closest(".folio-block-selection-gutter")?.closest("[data-folio-editor-owner]") ===
        root
      ) {
        const content = editor.view.dom.getBoundingClientRect();
        if (event.clientY < content.top || event.clientY > content.bottom) return;
        const block = nearest(event.clientY);
        if (!block) return;
        event.preventDefault();
        const anchor =
          event.shiftKey && editor.state.selection instanceof BlockSelection
            ? editor.state.selection.anchorBlock
            : block.pos;
        setBlockSelection(editor, anchor, block.pos);
        editor.view.dom.focus({ preventScroll: true });
        drag = {
          x: event.clientX,
          y: event.clientY,
          anchor,
          pointerId: event.pointerId,
          document: editor.state.doc,
        };
        point = { x: event.clientX, y: event.clientY };
        setSelecting(true);
      } else if (
        !isFolioEditorUIElement(event.target, ownerId) ||
        (event.target instanceof Node && editor.view.dom.contains(event.target))
      ) {
        if (editor.state.selection instanceof BlockSelection) clearBlockSelection(editor);
      }
    };
    const onMove = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      event.preventDefault();
      point = { x: event.clientX, y: event.clientY };
      if (frame === undefined) frame = window.requestAnimationFrame(move);
    };
    const end = () => {
      drag = undefined;
      point = undefined;
      setSelecting(false);
      if (frame !== undefined) {
        window.cancelAnimationFrame(frame);
        frame = undefined;
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && drag) {
        event.preventDefault();
        end();
      }
    };
    const onTransaction = () => {
      if (
        drag &&
        (!(editor.state.selection instanceof BlockSelection) || editor.state.doc !== drag.document)
      )
        end();
    };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("pointermove", onMove, true);
    document.addEventListener("pointerup", end, true);
    document.addEventListener("pointercancel", end, true);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("blur", end);
    editor.on("transaction", onTransaction);
    return () => {
      end();
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("pointermove", onMove, true);
      document.removeEventListener("pointerup", end, true);
      document.removeEventListener("pointercancel", end, true);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("blur", end);
      editor.off("transaction", onTransaction);
      if (!editor.isDestroyed) editor.unregisterPlugin(blockSelectionPluginKey);
    };
  }, [editor, rootRef, ownerId, enabled]);
  return { selecting, marqueeRef };
}
