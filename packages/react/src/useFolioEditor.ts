import { useEffect, useMemo, useRef } from "react";
import { useEditor } from "@tiptap/react";
import { Extension, type AnyExtension, type Editor } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import {
  createDefaultTiptapExtensions,
  createEmptyFolioDocument,
  createFolioExtensionRegistry,
  createFolioDocumentValidator,
} from "@futelab/folio-core/browser";
import type { FolioDocument, FolioExtension } from "@futelab/folio-core/browser";
import type { FolioI18nOptions } from "./i18n";
import { resolveFolioMessages } from "./i18n";

export interface UseFolioEditorOptions extends FolioI18nOptions {
  value?: FolioDocument;
  defaultValue?: FolioDocument;
  /** A different document gets a new editor, selection, and undo history. */
  documentId?: string;
  onChange?: (value: FolioDocument) => void;
  onError?: (error: Error) => void;
  editable?: boolean;
  extensions?: FolioExtension[];
  placeholder?: string;
}

export function useFolioEditor(options: UseFolioEditorOptions = {}): Editor | null {
  const latestOptions = useRef(options);
  latestOptions.current = options;
  const editorRef = useRef<Editor | null>(null);
  const contentRef = useRef<FolioDocument>(createEmptyFolioDocument());
  const revision = useRef(0);
  const previousIdentity = useRef(options.documentId);
  const previousInput = useRef<string | undefined>(undefined);
  const initialized = useRef(false);

  const extensionConfig = useMemo(() => {
    try {
      createFolioExtensionRegistry(options.extensions);
      return { extensions: options.extensions };
    } catch (error) {
      return { error: error instanceof Error ? error : new Error(String(error)) };
    }
  }, [options.extensions]);
  const lastValidExtensions = useRef<FolioExtension[] | undefined>(undefined);
  if (!extensionConfig.error) lastValidExtensions.current = extensionConfig.extensions;
  const extensions = lastValidExtensions.current;
  const externalTiptap = useRef<AnyExtension[]>([]);
  const nextTiptap = extensions?.flatMap((extension) => extension.tiptapExtensions ?? []) ?? [];
  if (
    nextTiptap.length !== externalTiptap.current.length ||
    nextTiptap.some((extension, index) => extension !== externalTiptap.current[index])
  ) {
    externalTiptap.current = nextTiptap;
  }
  const schemaExtensions = externalTiptap.current;
  const validation = useMemo(() => {
    try {
      return {
        validator: createFolioDocumentValidator({
          extensions: [{ name: "folioHostExtensions", tiptapExtensions: schemaExtensions }],
        }),
      };
    } catch (error) {
      return { error: error instanceof Error ? error : new Error(String(error)) };
    }
  }, [schemaExtensions]);

  const input = useMemo(() => {
    try {
      if (validation.error) throw validation.error;
      const candidate = options.value ?? options.defaultValue ?? createEmptyFolioDocument();
      return { value: validation.validator!.parse(candidate) };
    } catch (error) {
      return { error: error instanceof Error ? error : new Error(String(error)) };
    }
  }, [options.value, options.defaultValue, validation]);
  const editable = options.editable !== false && !input.error && !extensionConfig.error;
  const mayWrite = useRef(editable);
  mayWrite.current = editable;

  const identityChanged = previousIdentity.current !== options.documentId;
  if (!initialized.current || identityChanged) {
    contentRef.current = input.value ?? createEmptyFolioDocument();
    previousIdentity.current = options.documentId;
    previousInput.current = input.value ? JSON.stringify(input.value) : undefined;
    initialized.current = true;
    revision.current += 1;
  } else if (options.value !== undefined && input.value) {
    const nextJSON = JSON.stringify(input.value);
    if (nextJSON !== previousInput.current) {
      previousInput.current = nextJSON;
      if (nextJSON !== JSON.stringify(editorRef.current?.getJSON() ?? contentRef.current)) {
        // Parent echoes keep history. A real replacement starts a fresh history,
        // so Undo cannot resurrect the document the host replaced.
        contentRef.current = input.value;
        revision.current += 1;
      }
    }
  }

  const messages = useMemo(
    () => resolveFolioMessages({ locale: options.locale, translations: options.translations }),
    [options.locale, options.translations],
  );
  const writeGuard = useMemo(
    () =>
      Extension.create({
        name: "folioWriteGuard",
        addProseMirrorPlugins() {
          return [
            new Plugin({
              filterTransaction(transaction) {
                return !transaction.docChanged || mayWrite.current;
              },
            }),
          ];
        },
      }),
    [],
  );
  const tiptapExtensions = useMemo(
    () => [
      ...createDefaultTiptapExtensions({
        folioExtensions: [{ name: "folioHostExtensions", tiptapExtensions: schemaExtensions }],
        messages,
        placeholder: options.placeholder,
      }),
      writeGuard,
    ],
    [messages, schemaExtensions, options.placeholder, writeGuard],
  );

  const editor = useEditor(
    {
      content: contentRef.current,
      editable,
      extensions: tiptapExtensions,
      immediatelyRender: false,
      onUpdate: ({ editor: updatedEditor }) => {
        if (!mayWrite.current) return;
        const value = updatedEditor.getJSON() as FolioDocument;
        contentRef.current = value;
        try {
          latestOptions.current.onChange?.(value);
        } catch (error) {
          latestOptions.current.onError?.(
            error instanceof Error ? error : new Error(String(error)),
          );
        }
      },
    },
    [tiptapExtensions, options.documentId, revision.current],
  );
  editorRef.current = editor;

  useEffect(() => {
    const error = extensionConfig.error ?? input.error;
    if (error) latestOptions.current.onError?.(error);
  }, [extensionConfig.error, input.error]);
  useEffect(() => {
    editor?.setEditable(editable, false);
  }, [editor, editable]);

  return editor;
}
