import type { CSSProperties } from "react";
import type { DragEvent } from "react";
import type { MouseEvent } from "react";
import { GripVertical, Plus } from "lucide-react";

export interface BlockSideControlsProps {
  className?: string;
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
  style,
  visible,
  onAddBlock,
  onDragBlockEnd,
  onDragBlockStart,
}: BlockSideControlsProps) {
  if (!visible) return null;

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
        aria-label="Add block below"
        className="folio-block-side-controls__button"
        onClick={onAddBlock}
        onMouseDown={preserveEditorFocus}
        title="Add block below"
        type="button"
      >
        <Plus aria-hidden size={16} />
      </button>
      <button
        aria-label="Drag block"
        className="folio-block-side-controls__button"
        draggable
        onDragEnd={onDragBlockEnd}
        onDragStart={onDragBlockStart}
        title="Drag block"
        type="button"
      >
        <GripVertical aria-hidden size={16} />
      </button>
    </div>
  );
}
