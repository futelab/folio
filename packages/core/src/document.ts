import type { JSONContent } from "@tiptap/core";

export type FolioDocument = JSONContent & {
  type: "doc";
  content?: JSONContent[];
};

export type FolioJSONContent = JSONContent;

export function createEmptyFolioDocument(): FolioDocument {
  return {
    type: "doc",
    content: [{ type: "paragraph" }],
  };
}

export function isFolioDocument(value: unknown): value is FolioDocument {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as { type?: unknown };
  return candidate.type === "doc";
}
