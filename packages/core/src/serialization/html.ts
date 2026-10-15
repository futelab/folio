import { generateHTML, generateJSON } from "@tiptap/html/server";
import { Window } from "happy-dom";
import { createHTMLSerialization } from "./html.shared";
export type { FolioSerializationOptions } from "./options";

export const { toHTML, fromHTML } = createHTMLSerialization({
  generateHTML,
  generateJSON,
  createDOM: () => {
    const window = new Window({
      settings: {
        disableJavaScriptEvaluation: true,
        disableJavaScriptFileLoading: true,
        disableCSSFileLoading: true,
        disableIframePageLoading: true,
        disableComputedStyleRendering: true,
      },
    });
    return { document: window.document as unknown as Document, close: () => window.close() };
  },
});
