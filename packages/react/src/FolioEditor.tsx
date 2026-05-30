import { EditorContent } from "@tiptap/react";
import { BlockControls } from "./blocks/BlockControls";
import { FolioEditorContext } from "./context";
import { BubbleToolbar } from "./menus/BubbleToolbar";
import { SlashMenu } from "./menus/SlashMenu";
import { useFolioEditor } from "./useFolioEditor";
import type { UseFolioEditorOptions } from "./useFolioEditor";

export interface FolioEditorClassNames {
  root?: string;
  content?: string;
  blockControls?: string;
  bubbleToolbar?: string;
  slashMenu?: string;
}

export interface FolioEditorProps extends UseFolioEditorOptions {
  className?: string;
  classNames?: FolioEditorClassNames;
  initialSlashQuery?: string;
}

function classNames(...values: Array<string | undefined>): string {
  return values.filter(Boolean).join(" ");
}

export function FolioEditor(props: FolioEditorProps) {
  const editor = useFolioEditor(props);

  return (
    <FolioEditorContext.Provider value={{ editor }}>
      <div
        className={classNames("folio-editor", props.className, props.classNames?.root)}
        data-testid="folio-editor"
      >
        <BlockControls
          className={classNames(
            "folio-editor__block-controls",
            props.classNames?.blockControls,
          )}
          editor={editor}
        />
        <EditorContent
          className={classNames("folio-editor__content", props.classNames?.content)}
          editor={editor}
        />
        <BubbleToolbar
          className={classNames(
            "folio-editor__bubble-toolbar",
            props.classNames?.bubbleToolbar,
          )}
          editor={editor}
        />
        <SlashMenu
          className={classNames("folio-editor__slash-menu", props.classNames?.slashMenu)}
          editor={editor}
          query={props.initialSlashQuery}
        />
      </div>
    </FolioEditorContext.Provider>
  );
}
