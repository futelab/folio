import type { Editor } from "@tiptap/core";
import { Plus } from "lucide-react";
import type { FolioMessages } from "../i18n";
import { resolveFolioMessages } from "../i18n";
import { FolioDragHandle } from "./DragHandle";

export interface BlockControlsProps {
  editor: Editor | null;
  className?: string;
  messages?: FolioMessages;
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

export function BlockControls({ editor, className, messages }: BlockControlsProps) {
  const labels = resolveFolioMessages({ messages }).ui.blockControls;

  return (
    <div className={className ?? "folio-block-controls"}>
      <button
        aria-label={labels.insertBlock}
        className="folio-block-controls__insert"
        disabled={!editor}
        onClick={() => insertParagraph(editor)}
        title={labels.insertBlock}
        type="button"
      >
        <Plus aria-hidden size={16} />
      </button>
      <FolioDragHandle editor={editor} messages={messages} />
    </div>
  );
}
