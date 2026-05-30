import { generateHTML, generateJSON } from "@tiptap/html/server";
import type { FolioDocument } from "../document";
import { createEmptyFolioDocument, isFolioDocument } from "../document";
import { createDefaultTiptapExtensions } from "../extensions/defaultExtensions";

export function toHTML(document: FolioDocument): string {
  return generateHTML(document, createDefaultTiptapExtensions());
}

export function fromHTML(html: string): FolioDocument {
  const document = generateJSON(html, createDefaultTiptapExtensions());

  if (!isFolioDocument(document)) {
    return createEmptyFolioDocument();
  }

  return document;
}
