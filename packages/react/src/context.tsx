import { createContext, useContext } from "react";
import type { Editor } from "@tiptap/core";

export interface FolioEditorContextValue {
  editor: Editor | null;
}

export const FolioEditorContext = createContext<FolioEditorContextValue>({
  editor: null,
});

export function useFolioEditorContext(): FolioEditorContextValue {
  return useContext(FolioEditorContext);
}
