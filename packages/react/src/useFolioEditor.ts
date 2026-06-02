import { useEffect, useMemo, useRef } from "react";
import { useEditor } from "@tiptap/react";
import type { Editor } from "@tiptap/core";
import {
  createDefaultTiptapExtensions,
  createEmptyFolioDocument,
} from "@futelab/folio-core/browser";
import type { FolioDocument, FolioExtension } from "@futelab/folio-core/browser";
import type { FolioI18nOptions } from "./i18n";
import { resolveFolioMessages } from "./i18n";

export interface UseFolioEditorOptions extends FolioI18nOptions {
  value?: FolioDocument;
  defaultValue?: FolioDocument;
  onChange?: (value: FolioDocument) => void;
  editable?: boolean;
  extensions?: FolioExtension[];
  placeholder?: string;
}

function isSameJSON(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function useFolioEditor(options: UseFolioEditorOptions = {}): Editor | null {
  const latestContent = useRef(
    options.value ?? options.defaultValue ?? createEmptyFolioDocument(),
  );
  const controlledValue = options.value;
  const editable = options.editable ?? true;
  const messages = useMemo(
    () => resolveFolioMessages(options),
    [options.locale, options.translations],
  );
  const tiptapExtensions = useMemo(
    () =>
      createDefaultTiptapExtensions({
        folioExtensions: options.extensions,
        messages,
        placeholder: options.placeholder,
      }),
    [messages, options.extensions, options.placeholder],
  );

  const editor = useEditor(
    {
      content: controlledValue ?? latestContent.current,
      editable,
      extensions: tiptapExtensions,
      immediatelyRender: false,
      onUpdate: ({ editor: updatedEditor }) => {
        const nextValue = updatedEditor.getJSON() as FolioDocument;

        latestContent.current = nextValue;
        options.onChange?.(nextValue);
      },
    },
    [tiptapExtensions],
  );

  useEffect(() => {
    if (!editor || controlledValue === undefined) {
      return;
    }

    latestContent.current = controlledValue;

    if (!isSameJSON(editor.getJSON(), controlledValue)) {
      editor.commands.setContent(controlledValue, { emitUpdate: false });
    }
  }, [controlledValue, editor]);

  useEffect(() => {
    editor?.setEditable(editable);
  }, [editable, editor]);

  return editor;
}
