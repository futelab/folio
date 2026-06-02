import type { ComponentProps } from "react";
import type { Editor } from "@tiptap/core";
import { DragHandle as TiptapDragHandle } from "@tiptap/extension-drag-handle-react";
import { GripVertical } from "lucide-react";
import type { FolioMessages } from "../i18n";
import { resolveFolioMessages } from "../i18n";

export interface FolioDragHandleProps {
  editor: Editor | null;
  className?: string;
  messages?: FolioMessages;
}

type TiptapDragHandleEditor = ComponentProps<typeof TiptapDragHandle>["editor"];

function DragButton({
  className,
  disabled,
  label,
}: {
  className: string;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      aria-label={label}
      className={className}
      disabled={disabled}
      draggable={!disabled}
      title={label}
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
  messages,
}: FolioDragHandleProps) {
  const label = resolveFolioMessages({ messages }).ui.blockControls.dragBlock;

  if (!editor || shouldUseStableFallback()) {
    return <DragButton className={className} disabled={!editor} label={label} />;
  }

  return (
    <TiptapDragHandle
      className={className}
      editor={editor as TiptapDragHandleEditor}
      nested
    >
      <DragButton className={`${className}__button`} label={label} />
    </TiptapDragHandle>
  );
}
