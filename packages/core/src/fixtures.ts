import type { FolioDocument } from "./document";

export const sampleFolioDocument: FolioDocument = {
  type: "doc",
  content: [
    {
      type: "heading",
      attrs: { level: 1 },
      content: [{ type: "text", text: "Folio document" }],
    },
    {
      type: "paragraph",
      content: [
        { type: "text", text: "A JSON-first document with " },
        { type: "text", marks: [{ type: "bold" }], text: "rich text" },
        { type: "text", text: "." },
      ],
    },
  ],
};
