import type { FolioDocumentValidationOptions } from "../document";
import type { FolioDocument, FolioJSONContent } from "../document";
import type { getSchema } from "@tiptap/core";
import type { FolioExtension } from "../extensions/types";
export { assertSafeDocumentUrls } from "../security";

export interface FolioSerializationOptions extends Omit<
  FolioDocumentValidationOptions,
  "allowUnknownContent"
> {
  /** Alias matching createDefaultTiptapExtensions. */
  folioExtensions?: FolioExtension[];
}

export function serializationExtensions(options: FolioSerializationOptions): FolioExtension[] {
  return options.extensions ?? options.folioExtensions ?? [];
}

/** Empty optional labels/captions and null carry the same visible meaning in the default schema. */
export function normalizedSerializationDocument(
  document: FolioDocument,
  schema: ReturnType<typeof getSchema>,
): FolioDocument {
  const normalized = schema.nodeFromJSON(document).toJSON() as FolioDocument;
  const optionalFields: Record<string, string[]> = {
    image: ["alt", "title", "caption"],
    bookmark: ["title", "description", "url"],
    heading: ["id", "data-toc-id"],
    codeBlock: ["language"],
  };
  const visit = (node: FolioJSONContent) => {
    for (const name of optionalFields[node.type ?? ""] ?? []) {
      if (
        node.attrs?.[name] === "" &&
        schema.nodes[node.type ?? ""]?.spec.attrs?.[name]?.default === null
      ) {
        node.attrs = { ...node.attrs, [name]: null };
      }
    }
    node.marks = node.marks?.map((mark) => {
      if (mark.type !== "link") return mark;
      const attrs = { ...mark.attrs };
      for (const name of ["title", "class"])
        if (attrs[name] === "" && schema.marks.link?.spec.attrs?.[name]?.default === null)
          attrs[name] = null;
      return { ...mark, attrs };
    });
    node.content?.forEach(visit);
  };
  visit(normalized);
  return normalized;
}
