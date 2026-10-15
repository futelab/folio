import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import type { Editor } from "@tiptap/core";
import { Plus } from "lucide-react";
import type { FolioMessages } from "../i18n";
import { resolveFolioMessages } from "../i18n";

export interface TableControlsProps {
  editor: Editor | null;
  editorRoot: HTMLElement | null;
  messages?: FolioMessages;
  table: HTMLElement | null;
  onAddColumn: () => void;
  onAddRow: () => void;
}

const useClientLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

function positionButton(button: HTMLButtonElement, left: number, top: number) {
  const nextLeft = `${left}px`;
  const nextTop = `${top}px`;
  if (button.style.left !== nextLeft) button.style.left = nextLeft;
  if (button.style.top !== nextTop) button.style.top = nextTop;
}

export function focusTableCell(editor: Editor | null, table: HTMLElement | null): boolean {
  const firstCell = table?.querySelector("th, td");

  if (!editor || !firstCell || !editor.view.dom.contains(firstCell)) {
    return false;
  }

  try {
    const position = editor.view.posAtDOM(firstCell, 0) + 1;

    return editor.chain().focus().setTextSelection(position).run();
  } catch {
    editor.commands.focus();
    return false;
  }
}

export function TableControls({
  editor,
  editorRoot,
  messages,
  onAddColumn,
  onAddRow,
  table,
}: TableControlsProps) {
  const editable = Boolean(editor?.isEditable);
  const layerRef = useRef<HTMLDivElement>(null);
  const columnRef = useRef<HTMLButtonElement>(null);
  const rowRef = useRef<HTMLButtonElement>(null);
  const updatePosition = useCallback(() => {
    const layer = layerRef.current;
    const column = columnRef.current;
    const row = rowRef.current;
    if (!layer || !column || !row) return;

    if (!editable || !editor?.isEditable || !table || !editorRoot?.contains(table)) {
      layer.style.visibility = "hidden";
      return;
    }

    const tableRect = table.getBoundingClientRect();
    if (!tableRect.width || !tableRect.height) {
      layer.style.visibility = "hidden";
      return;
    }

    // The overlay is the buttons' actual containing block. Its viewport rect also
    // accounts for editor borders, padding and scrolling inside the editor itself.
    const layerRect = layer.getBoundingClientRect();
    const layerStyle = layer.ownerDocument.defaultView?.getComputedStyle(layer);
    const width = Number.parseFloat(layerStyle?.width ?? "") || layer.offsetWidth;
    const height = Number.parseFloat(layerStyle?.height ?? "") || layer.offsetHeight;
    const scaleX = width ? layerRect.width / width || 1 : 1;
    const scaleY = height ? layerRect.height / height || 1 : 1;
    positionButton(
      column,
      (tableRect.right - layerRect.left) / scaleX + 8,
      (tableRect.top + tableRect.height / 2 - layerRect.top) / scaleY,
    );
    positionButton(
      row,
      (tableRect.left + tableRect.width / 2 - layerRect.left) / scaleX,
      (tableRect.bottom - layerRect.top) / scaleY + 8,
    );
    if (layer.style.visibility !== "visible") layer.style.visibility = "visible";
  }, [editable, editor, editorRoot, table]);

  // React can insert table actions above the document in the same commit. Measure
  // after every commit so those layout changes are reflected before the first paint.
  useClientLayoutEffect(updatePosition);

  useClientLayoutEffect(() => {
    const ownerWindow = editorRoot?.ownerDocument.defaultView;
    if (!editable || !editor || !table || !editorRoot || !ownerWindow) return;

    let frame: number | undefined;
    const schedulePosition = () => {
      if (frame !== undefined) return;
      frame = ownerWindow.requestAnimationFrame(() => {
        frame = undefined;
        updatePosition();
      });
    };
    const observer = ownerWindow.ResizeObserver
      ? new ownerWindow.ResizeObserver(updatePosition)
      : undefined;
    const observed = new Set<Element>([table, editorRoot]);
    for (const selector of [".ProseMirror", ".folio-editor-actions"]) {
      const element = editorRoot.querySelector(selector);
      if (element) observed.add(element);
    }
    for (const element of observed) observer?.observe(element);
    ownerWindow.addEventListener("scroll", schedulePosition, true);
    ownerWindow.addEventListener("resize", schedulePosition);
    editor.on("transaction", schedulePosition);

    return () => {
      observer?.disconnect();
      ownerWindow.removeEventListener("scroll", schedulePosition, true);
      ownerWindow.removeEventListener("resize", schedulePosition);
      editor.off("transaction", schedulePosition);
      if (frame !== undefined) ownerWindow.cancelAnimationFrame(frame);
    };
  }, [editable, editor, editorRoot, table, updatePosition]);

  if (!editable || !table || !editorRoot) return null;

  const labels = resolveFolioMessages({ messages }).ui.tableControls;

  return (
    <div
      ref={layerRef}
      className="folio-table-controls"
      data-testid="folio-table-controls"
      style={{ visibility: "hidden" }}
    >
      <button
        ref={columnRef}
        aria-label={labels.addColumnAriaLabel}
        className="folio-table-controls__button folio-table-controls__button--column"
        onClick={onAddColumn}
        onMouseDown={(event) => event.preventDefault()}
        style={{ transform: "translateY(-50%)" }}
        title={labels.addColumnTitle}
        type="button"
      >
        <Plus aria-hidden size={14} />
      </button>
      <button
        ref={rowRef}
        aria-label={labels.addRowAriaLabel}
        className="folio-table-controls__button folio-table-controls__button--row"
        onClick={onAddRow}
        onMouseDown={(event) => event.preventDefault()}
        style={{ transform: "translateX(-50%)" }}
        title={labels.addRowTitle}
        type="button"
      >
        <Plus aria-hidden size={14} />
      </button>
    </div>
  );
}
