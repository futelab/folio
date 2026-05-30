import { EditorContent } from "@tiptap/react";
import { FolioEditorContext } from "./context";
import { useFolioEditor } from "./useFolioEditor";
import type { UseFolioEditorOptions } from "./useFolioEditor";

export interface FolioEditorClassNames {
  root?: string;
  content?: string;
}

export interface FolioEditorProps extends UseFolioEditorOptions {
  className?: string;
  classNames?: FolioEditorClassNames;
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
        <EditorContent
          className={classNames("folio-editor__content", props.classNames?.content)}
          editor={editor}
        />
      </div>
    </FolioEditorContext.Provider>
  );
}
