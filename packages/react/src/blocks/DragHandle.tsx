import type { ComponentProps } from "react";
import type { Editor } from "@tiptap/core";
import { DragHandle as TiptapDragHandle } from "@tiptap/extension-drag-handle-react";
import { GripVertical } from "lucide-react";

export interface FolioDragHandleProps {
  editor: Editor | null;
  className?: string;
}

type TiptapDragHandleEditor = ComponentProps<typeof TiptapDragHandle>["editor"];

function DragButton({
  className,
  disabled,
}: {
  className: string;
  disabled?: boolean;
}) {
  return (
    <button
      aria-label="Drag block"
      className={className}
      disabled={disabled}
      draggable={!disabled}
      title="Drag block"
      type="button"
    >
      <GripVertical aria-hidden size={16} />
    </button>
  );
}

function shouldUseStableFallback(): boolean {
  return (
    typeof process !== "undefined" &&
    process.env.NODE_ENV === "test"
  );
}

export function FolioDragHandle({
  editor,
  className = "folio-drag-handle",
}: FolioDragHandleProps) {
  if (!editor || shouldUseStableFallback()) {
    return <DragButton className={className} disabled={!editor} />;
  }

  return (
    <TiptapDragHandle
      className={className}
      editor={editor as TiptapDragHandleEditor}
      nested
    >
      <DragButton className={`${className}__button`} />
    </TiptapDragHandle>
  );
}
