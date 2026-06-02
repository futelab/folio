import type { CSSProperties } from "react";
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

function getTableControlsStyle(
  table: HTMLElement | null,
  editorRoot: HTMLElement | null,
): { column: CSSProperties; row: CSSProperties } | undefined {
  if (!table || !editorRoot) return undefined;

  const tableRect = table.getBoundingClientRect();
  const rootRect = editorRoot.getBoundingClientRect();

  return {
    column: {
      left: tableRect.right - rootRect.left + 8,
      top: tableRect.top - rootRect.top + tableRect.height / 2,
      transform: "translateY(-50%)",
    },
    row: {
      left: tableRect.left - rootRect.left + tableRect.width / 2,
      top: tableRect.bottom - rootRect.top + 8,
      transform: "translateX(-50%)",
    },
  };
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
  const style = getTableControlsStyle(table, editorRoot);

  if (!editor || !style) return null;

  const labels = resolveFolioMessages({ messages }).ui.tableControls;

  return (
    <div className="folio-table-controls" data-testid="folio-table-controls">
      <button
        aria-label={labels.addColumnAriaLabel}
        className="folio-table-controls__button folio-table-controls__button--column"
        onClick={onAddColumn}
        style={style.column}
        title={labels.addColumnTitle}
        type="button"
      >
        <Plus aria-hidden size={14} />
      </button>
      <button
        aria-label={labels.addRowAriaLabel}
        className="folio-table-controls__button folio-table-controls__button--row"
        onClick={onAddRow}
        style={style.row}
        title={labels.addRowTitle}
        type="button"
      >
        <Plus aria-hidden size={14} />
      </button>
    </div>
  );
}
