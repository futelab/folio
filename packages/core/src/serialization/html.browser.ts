import { generateHTML, generateJSON } from "@tiptap/html";
import { createHTMLSerialization } from "./html.shared";
export type { FolioSerializationOptions } from "./options";

export const { toHTML, fromHTML } = createHTMLSerialization({
  generateHTML,
  generateJSON,
  createDOM: () => ({
    document: new DOMParser().parseFromString("", "text/html"),
    close: () => {},
  }),
});
