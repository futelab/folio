import { Extension, type Editor } from "@tiptap/core";
import { DOMParser as ProseMirrorDOMParser, Fragment, Slice } from "@tiptap/pm/model";
import { Plugin, type SelectionBookmark } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import {
  assertSafeDocumentUrls,
  defaultFolioDocumentLimits,
  parseFolioDocument,
  sanitizeFolioUrl,
} from "@futelab/folio-core/browser";
import type { FolioDocument, FolioExtension, FolioJSONContent } from "@futelab/folio-core/browser";
import { cleanClipboardHTML } from "./html";
import {
  decodeClipboardFragment,
  deduplicateClipboardIds,
  encodeClipboardFragment,
} from "./fragment";
import { folioClipboardMimeType, FolioClipboardError, type FolioClipboardOptions } from "./types";

interface ClipboardRuntime {
  getOptions: () => FolioClipboardOptions | undefined;
  canWrite: () => boolean;
  isCurrentEditor: (editor: Editor) => boolean;
  getDocumentId: () => string | undefined;
  parseDocument: (value: unknown) => FolioDocument;
  extensions?: FolioExtension[];
  onError: (error: FolioClipboardError) => void;
}

interface PendingImagePaste {
  bookmark: SelectionBookmark;
  active: boolean;
  documentId: string | undefined;
}

export interface FolioClipboardPayload {
  "text/html": string;
  "text/plain": string;
  [folioClipboardMimeType]?: string;
}

interface ClipboardController {
  payload: () => FolioClipboardPayload | null;
  copy: () => Promise<boolean>;
}
const controllers = new WeakMap<Editor, ClipboardController>();

/** Reads the current selection through the same validation as native copying. */
export function createFolioClipboardPayload(editor: Editor): FolioClipboardPayload | null {
  return !editor.isDestroyed ? (controllers.get(editor)?.payload() ?? null) : null;
}

/** Call from a user gesture after setting the desired text, node, or block selection. */
export async function copyFolioSelection(editor: Editor): Promise<boolean> {
  return !editor.isDestroyed ? (controllers.get(editor)?.copy() ?? false) : false;
}

function plainTextSlice(view: EditorView, text: string): Slice {
  const normalized = text.replace(/\r\n?/g, "\n");
  const { schema, selection } = view.state;
  if (selection.$from.parent.type.spec.code)
    return new Slice(Fragment.from(normalized ? schema.text(normalized) : null), 0, 0);
  const paragraphs = normalized
    .split("\n")
    .map((line) => schema.nodes.paragraph!.create(null, line ? schema.text(line) : undefined));
  return new Slice(Fragment.fromArray(paragraphs), 1, 1);
}

function readableFragment(input: string, extensions?: FolioExtension[]): string {
  const payload = JSON.parse(input) as { document?: unknown };
  const document = parseFolioDocument(payload?.document, { extensions, allowUnknownContent: true });
  const text = (node: FolioJSONContent): string => {
    if (typeof node.text === "string") return node.text;
    const children = node.content?.map(text).join("") ?? "";
    if (children) return children;
    if (node.type === "hardBreak") return "\n";
    for (const name of ["label", "alt", "title", "caption"]) {
      const value: unknown = node.attrs?.[name];
      if (typeof value === "string" && value) return value;
    }
    return node.type === "paragraph" ? "" : `[Unsupported content: ${node.type ?? "unknown"}]`;
  };
  return document.content?.map(text).join("\n") ?? "";
}

/** Uses native ClipboardEvents, so custom ProseMirror selections participate through content(). */
export function createFolioClipboardExtension(runtime: ClipboardRuntime) {
  return Extension.create({
    name: "folioClipboard",
    priority: 1000,
    addProseMirrorPlugins() {
      const editor = this.editor;
      let alive = true;
      let forcePlainText = false;
      let copied = 0;
      const pending = new Set<PendingImagePaste>();
      const canWrite = () =>
        alive &&
        !editor.isDestroyed &&
        editor.isEditable &&
        runtime.canWrite() &&
        runtime.isCurrentEditor(editor);
      const cancelPending = () => {
        for (const request of pending) request.active = false;
        pending.clear();
      };
      const report = (error: FolioClipboardError) => {
        try {
          (runtime.getOptions()?.onError ?? runtime.onError)(error);
        } catch {
          /* Diagnostics must never cause a second native paste or an unhandled rejection. */
        }
      };
      const validateTransaction = (
        view: EditorView,
        slice: Slice,
        bookmark?: SelectionBookmark,
      ) => {
        const incoming = deduplicateClipboardIds(slice, view.state.doc, view.state.schema);
        const transaction = view.state.tr;
        if (bookmark) transaction.setSelection(bookmark.resolve(transaction.doc));
        transaction.replaceSelection(incoming);
        const document = runtime.parseDocument(transaction.doc.toJSON());
        assertSafeDocumentUrls(document);
        return transaction.setMeta("paste", true).setMeta("uiEvent", "paste").scrollIntoView();
      };
      const insert = (view: EditorView, slice: Slice) => {
        if (!canWrite()) return;
        view.dispatch(validateTransaction(view, slice));
      };
      const pasteImages = async (view: EditorView, files: File[]) => {
        const upload = runtime.getOptions()?.uploadImage;
        if (!upload) {
          report(
            new FolioClipboardError(
              "upload-unavailable",
              "Pasting image files requires an uploadImage callback.",
            ),
          );
          return;
        }
        if (files.length > 20) {
          report(new FolioClipboardError("size-limit", "Paste at most 20 image files at a time."));
          return;
        }
        const request: PendingImagePaste = {
          bookmark: view.state.selection.getBookmark(),
          active: true,
          documentId: runtime.getDocumentId(),
        };
        pending.add(request);
        const current = () =>
          request.active && canWrite() && request.documentId === runtime.getDocumentId();
        try {
          const attributes = await Promise.all(
            files.map(async (file) => {
              const result = await upload(file);
              const value = typeof result === "string" ? { src: result } : result;
              const src = sanitizeFolioUrl(value?.src, { kind: "image" });
              if (!src)
                throw new FolioClipboardError(
                  "unsafe-url",
                  "The uploaded image URL is not permitted.",
                );
              if (
                (value.alt !== undefined && typeof value.alt !== "string") ||
                (value.caption !== undefined && typeof value.caption !== "string")
              )
                throw new Error("Image upload metadata must contain strings.");
              return { src, alt: value.alt ?? file.name, caption: value.caption ?? null };
            }),
          );
          if (!current()) return;
          const images = attributes.map((attrs) => view.state.schema.nodes.image!.create(attrs));
          view.dispatch(
            validateTransaction(
              view,
              new Slice(Fragment.fromArray(images), 0, 0),
              request.bookmark,
            ),
          );
        } catch (cause) {
          if (current())
            report(
              cause instanceof FolioClipboardError
                ? cause
                : new FolioClipboardError("upload-failed", "Pasted image upload failed.", cause),
            );
        } finally {
          request.active = false;
          pending.delete(request);
        }
      };
      const payload = (view: EditorView): FolioClipboardPayload | null => {
        if (view.state.selection.empty) return null;
        const serialized = view.serializeForClipboard(view.state.selection.content());
        const safe = cleanClipboardHTML(
          serialized.dom.innerHTML,
          view.dom.ownerDocument,
          view.state.schema,
        );
        const result: FolioClipboardPayload = {
          "text/html": safe.html,
          "text/plain": serialized.text,
        };
        try {
          result[folioClipboardMimeType] = encodeClipboardFragment(
            serialized.slice,
            runtime.parseDocument,
          );
        } catch (cause) {
          report(
            new FolioClipboardError(
              "content-downgraded",
              "This selection was copied as HTML and text because it is not a complete Folio fragment.",
              cause,
            ),
          );
        }
        return result;
      };
      const copy = (view: EditorView, event: ClipboardEvent, cut: boolean): boolean => {
        if (cut && !canWrite()) {
          event.preventDefault();
          return true;
        }
        if (view.state.selection.empty || !event.clipboardData) return false;
        try {
          const data = payload(view)!;
          event.clipboardData.clearData();
          event.clipboardData.setData("text/html", data["text/html"]);
          event.clipboardData.setData("text/plain", data["text/plain"]);
          if (data[folioClipboardMimeType]) {
            try {
              event.clipboardData.setData(folioClipboardMimeType, data[folioClipboardMimeType]!);
            } catch (cause) {
              report(
                new FolioClipboardError(
                  "content-downgraded",
                  "The system clipboard accepted HTML and text but not the Folio fragment.",
                  cause,
                ),
              );
            }
          }
          copied += 1;
          event.preventDefault();
          if (cut)
            view.dispatch(
              view.state.tr.deleteSelection().setMeta("uiEvent", "cut").scrollIntoView(),
            );
          return true;
        } catch (cause) {
          report(
            new FolioClipboardError("clipboard-error", "The selection could not be copied.", cause),
          );
          // Preserve the selection if clipboard access fails; do not perform a native cut.
          event.preventDefault();
          return true;
        }
      };
      const paste = (view: EditorView, event: ClipboardEvent): boolean => {
        if (!canWrite()) {
          event.preventDefault();
          return true;
        }
        const options = runtime.getOptions();
        const plainText = forcePlainText || options?.defaultPaste === "plain-text";
        forcePlainText = false;
        try {
          if (options?.onPaste?.(event, { editor, plainText }) === true) {
            event.preventDefault();
            return true;
          }
        } catch (cause) {
          report(new FolioClipboardError("clipboard-error", "The paste callback failed.", cause));
          event.preventDefault();
          return true;
        }
        if (options?.defaultPaste === "disabled") {
          event.preventDefault();
          return true;
        }
        const clipboard = event.clipboardData;
        if (!clipboard) return false;
        event.preventDefault();
        try {
          const text = clipboard.getData("text/plain");
          const html = clipboard.getData("text/html");
          const internal = clipboard.getData(folioClipboardMimeType);
          if (text.length > defaultFolioDocumentLimits.maxTextLength)
            throw new FolioClipboardError("size-limit", "Clipboard text exceeds the size limit.");
          if (plainText) {
            if (text) insert(view, plainTextSlice(view, text));
            return true;
          }
          if (internal) {
            try {
              insert(
                view,
                decodeClipboardFragment(internal, view.state.schema, runtime.parseDocument),
              );
              return true;
            } catch (cause) {
              report(
                new FolioClipboardError(
                  "invalid-fragment",
                  "The Folio fragment could not be pasted intact; using compatible HTML or text instead.",
                  cause,
                ),
              );
            }
          }
          const files = Array.from(clipboard.files ?? []).filter((file) =>
            file.type.startsWith("image/"),
          );
          if (files.length) {
            void pasteImages(view, files);
            return true;
          }
          if (html) {
            try {
              const cleaned = cleanClipboardHTML(html, view.dom.ownerDocument, view.state.schema);
              const slice = ProseMirrorDOMParser.fromSchema(view.state.schema).parseSlice(
                cleaned.content,
              );
              if (cleaned.unsafe)
                report(
                  new FolioClipboardError(
                    "unsafe-url",
                    "Unsafe clipboard URLs or active attributes were removed.",
                  ),
                );
              if (cleaned.downgraded)
                report(
                  new FolioClipboardError(
                    "content-downgraded",
                    "Unsupported clipboard content was reduced to compatible text and blocks.",
                  ),
                );
              if (slice.content.size) {
                insert(view, slice);
                return true;
              }
            } catch (cause) {
              report(
                cause instanceof FolioClipboardError
                  ? cause
                  : new FolioClipboardError(
                      "content-downgraded",
                      "Clipboard HTML could not be preserved; using plain text instead.",
                      cause,
                    ),
              );
            }
          }
          let fallback = text;
          if (
            !fallback &&
            internal &&
            internal.length <= defaultFolioDocumentLimits.maxTextLength * 4
          ) {
            try {
              fallback = readableFragment(internal, runtime.extensions);
            } catch {
              /* Invalid JSON has no trusted text fallback. */
            }
          }
          if (fallback) insert(view, plainTextSlice(view, fallback));
        } catch (cause) {
          report(
            cause instanceof FolioClipboardError
              ? cause
              : new FolioClipboardError(
                  "clipboard-error",
                  "Clipboard content could not be pasted.",
                  cause,
                ),
          );
        }
        return true;
      };
      return [
        new Plugin({
          state: {
            init: () => null,
            apply(transaction) {
              for (const request of pending) {
                if (request.active) request.bookmark = request.bookmark.map(transaction.mapping);
              }
              return null;
            },
          },
          props: {
            handleDOMEvents: {
              paste,
              copy: (view, event) => copy(view, event, false),
              cut: (view, event) => copy(view, event, true),
              keydown: (_view, event) => {
                forcePlainText =
                  (event.ctrlKey || event.metaKey) &&
                  event.shiftKey &&
                  event.key.toLowerCase() === "v";
                return false;
              },
              keyup: () => {
                forcePlainText = false;
                return false;
              },
            },
          },
          view: (view) => {
            // EditorContent mounts an existing Tiptap view and can recreate plugin
            // views without recreating the extension or its Editor instance.
            alive = true;
            const controller: ClipboardController = {
              payload: () => {
                try {
                  return payload(view);
                } catch (cause) {
                  report(
                    new FolioClipboardError(
                      "clipboard-error",
                      "The selection could not be serialized for copying.",
                      cause,
                    ),
                  );
                  return null;
                }
              },
              copy: async () => {
                try {
                  view.focus();
                  const before = copied;
                  const ownerDocument = view.dom.ownerDocument;
                  if (ownerDocument.execCommand?.("copy") && copied > before) return true;
                  const ownerWindow = ownerDocument.defaultView;
                  const Clipboard = (
                    ownerWindow as (Window & { ClipboardItem?: typeof ClipboardItem }) | null
                  )?.ClipboardItem;
                  const api = ownerWindow?.navigator.clipboard;
                  const data = payload(view);
                  if (!data || !Clipboard || !api?.write)
                    throw new Error("Clipboard writing is unavailable.");
                  await api.write([
                    new Clipboard({
                      "text/html": new Blob([data["text/html"]], { type: "text/html" }),
                      "text/plain": new Blob([data["text/plain"]], { type: "text/plain" }),
                    }),
                  ]);
                  report(
                    new FolioClipboardError(
                      "content-downgraded",
                      "Copied HTML and text; this browser's clipboard fallback does not preserve the Folio fragment.",
                    ),
                  );
                  return true;
                } catch (cause) {
                  report(
                    new FolioClipboardError(
                      "clipboard-error",
                      "The selection could not be copied to the system clipboard.",
                      cause,
                    ),
                  );
                  return false;
                }
              },
            };
            controllers.set(editor, controller);
            return {
              update: () => {
                if (!canWrite()) cancelPending();
              },
              destroy: () => {
                alive = false;
                cancelPending();
                if (controllers.get(editor) === controller) controllers.delete(editor);
              },
            };
          },
        }),
      ];
    },
  });
}
