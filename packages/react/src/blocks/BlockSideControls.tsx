import type { CSSProperties } from "react";
import type { DragEvent } from "react";
import type { MouseEvent } from "react";
import { GripVertical, Plus } from "lucide-react";
import type { FolioMessages } from "../i18n";
import { resolveFolioMessages } from "../i18n";

export interface BlockSideControlsProps {
  className?: string;
  messages?: FolioMessages;
  style?: CSSProperties;
  visible: boolean;
  onAddBlock: () => void;
  onDragBlockEnd?: () => void;
  onDragBlockStart?: (event: DragEvent<HTMLButtonElement>) => void;
}

function classNames(...values: Array<string | undefined>): string {
  return values.filter(Boolean).join(" ");
}

export function BlockSideControls({
  className,
  messages,
  style,
  visible,
  onAddBlock,
  onDragBlockEnd,
  onDragBlockStart,
}: BlockSideControlsProps) {
  if (!visible) return null;

  const labels = resolveFolioMessages({ messages }).ui.blockControls;

  function preserveEditorFocus(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
  }

  return (
    <div
      className={classNames("folio-block-side-controls", className)}
      data-testid="folio-block-side-controls"
      style={style}
    >
      <button
        aria-label={labels.addBlockBelow}
        className="folio-block-side-controls__button"
        onClick={onAddBlock}
        onMouseDown={preserveEditorFocus}
        title={labels.addBlockBelow}
        type="button"
      >
        <Plus aria-hidden size={16} />
      </button>
      <button
        aria-label={labels.dragBlock}
        className="folio-block-side-controls__button"
        draggable
        onDragEnd={onDragBlockEnd}
        onDragStart={onDragBlockStart}
        title={labels.dragBlock}
        type="button"
      >
        <GripVertical aria-hidden size={16} />
      </button>
    </div>
  );
}
