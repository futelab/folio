import type { Editor } from "@tiptap/core";
import { Plus } from "lucide-react";
import { FolioDragHandle } from "./DragHandle";

export interface BlockControlsProps {
  editor: Editor | null;
  className?: string;
}

function insertParagraph(editor: Editor | null): boolean {
  try {
    if (!editor) return false;

    const chain = editor.chain().focus().insertContent({ type: "paragraph" });
    const result = chain.run();

    return typeof result === "boolean" ? result : false;
  } catch {
    return false;
  }
}

export function BlockControls({ editor, className }: BlockControlsProps) {
  return (
    <div className={className ?? "folio-block-controls"}>
      <button
        aria-label="Insert block"
        className="folio-block-controls__insert"
        disabled={!editor}
        onClick={() => insertParagraph(editor)}
        title="Insert block"
        type="button"
      >
        <Plus aria-hidden size={16} />
      </button>
      <FolioDragHandle editor={editor} />
    </div>
  );
}
