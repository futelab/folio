import type { Editor } from "@tiptap/core";
import type { FolioImageUpload } from "../menus/MediaDialog";

export interface FolioClipboardContext {
  editor: Editor;
  /** True for the configured plain-text policy or Ctrl/Cmd+Shift+V. */
  plainText: boolean;
}

export type FolioClipboardErrorCode =
  | "invalid-fragment"
  | "content-downgraded"
  | "unsafe-url"
  | "size-limit"
  | "upload-unavailable"
  | "upload-failed"
  | "clipboard-error";

export class FolioClipboardError extends Error {
  constructor(
    readonly code: FolioClipboardErrorCode,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "FolioClipboardError";
  }
}

export interface FolioClipboardOptions {
  /** Defaults to rich-text. Disabled still calls onPaste, then prevents native paste. */
  defaultPaste?: "rich-text" | "plain-text" | "disabled";
  /** true consumes the event; false or undefined continues the configured default. */
  onPaste?: (event: ClipboardEvent, context: FolioClipboardContext) => boolean | void;
  /** Uses the same upload contract as the image dialog. No data URL fallback is implicit. */
  uploadImage?: FolioImageUpload;
  /** Also receives recoverable content downgrade diagnostics. Defaults to the editor onError. */
  onError?: (error: FolioClipboardError) => void;
}

export const folioClipboardMimeType = "application/x-folio-blocks+json";
