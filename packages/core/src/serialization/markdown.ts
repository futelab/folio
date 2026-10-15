import { MarkdownManager } from "@tiptap/markdown";
import { Lexer, Marked } from "marked";
import { flattenExtensions, getExtensionField, getSchema } from "@tiptap/core";
import type { FolioDocument, FolioJSONContent } from "../document";
import {
  createEmptyFolioDocument,
  defaultFolioDocumentLimits,
  parseFolioDocument,
  FolioDocumentValidationError,
} from "../document";
import { createDefaultTiptapExtensions } from "../extensions/defaultExtensions";
import {
  assertSafeDocumentUrls,
  serializationExtensions,
  normalizedSerializationDocument,
} from "./options";
import type { FolioSerializationOptions } from "./options";

export interface FolioMarkdownSerializationOptions extends FolioSerializationOptions {
  /** Explicitly treat matching heading id/data-toc-id pairs as regenerable TOC metadata. Independent author IDs remain protected. */
  headingIds?: "preserve" | "omit-matching-toc";
}

const markdownSerializableNodes = new Set([
  "doc",
  "paragraph",
  "text",
  "heading",
  "bulletList",
  "orderedList",
  "listItem",
  "taskList",
  "taskItem",
  "blockquote",
  "horizontalRule",
  "codeBlock",
  "hardBreak",
  "image",
]);

const markdownSerializableMarks = new Set(["bold", "italic", "strike", "code", "link"]);

export class FolioMarkdownSerializationError extends Error {
  constructor(message: string) {
    super(`FolioMarkdownSerializationError: ${message}`);
    this.name = "FolioMarkdownSerializationError";
  }

  static unsupportedNode(nodeType: string): FolioMarkdownSerializationError {
    return new FolioMarkdownSerializationError(
      `Markdown serialization does not support lossy node "${nodeType}" yet.`,
    );
  }

  static unsupportedMark(markType: string): FolioMarkdownSerializationError {
    return new FolioMarkdownSerializationError(
      `Markdown serialization does not support lossy mark "${markType}" yet.`,
    );
  }

  static lossyAttribute(ownerType: string, attrName: string): FolioMarkdownSerializationError {
    return new FolioMarkdownSerializationError(
      `Markdown serialization does not support lossy attribute "${attrName}" on "${ownerType}" yet.`,
    );
  }
}

function isEmptyAttributeValue(value: unknown): boolean {
  return value === null || value === undefined || value === "";
}

function assertNoLossyAttributes(
  ownerType: string,
  attrs: Record<string, unknown> | undefined,
  allowedAttrs: string[] = [],
  defaults: Record<string, { default?: unknown }> = {},
): void {
  const allowed = new Set(allowedAttrs);

  for (const [name, value] of Object.entries(attrs ?? {})) {
    if (!allowed.has(name) && !isEmptyAttributeValue(value) && value !== defaults[name]?.default) {
      throw FolioMarkdownSerializationError.lossyAttribute(ownerType, name);
    }
  }
}

function assertNodeAttributes(
  node: FolioJSONContent,
  defaults: Record<string, { default?: unknown }> = {},
): void {
  switch (node.type) {
    case "heading":
      assertNoLossyAttributes("heading", node.attrs, ["level"], defaults);
      return;
    case "orderedList":
      assertNoLossyAttributes("orderedList", node.attrs, ["start"], defaults);
      return;
    case "taskItem":
      assertNoLossyAttributes("taskItem", node.attrs, ["checked"], defaults);
      return;
    case "codeBlock":
      assertNoLossyAttributes("codeBlock", node.attrs, ["language"], defaults);
      return;
    case "image":
      assertNoLossyAttributes("image", node.attrs, ["src", "alt", "title", "caption"], defaults);

      if (hasNonEmptyCaption(node)) {
        throw FolioMarkdownSerializationError.lossyAttribute("image", "caption");
      }

      return;
    default:
      assertNoLossyAttributes(node.type ?? "unknown", node.attrs, [], defaults);
  }
}

function assertMarkAttributes(
  mark: {
    type?: string;
    attrs?: Record<string, unknown>;
  },
  defaults: Record<string, { default?: unknown }> = {},
): void {
  switch (mark.type) {
    case "link":
      assertNoLossyAttributes("link", mark.attrs, ["href", "title"], defaults);
      return;
    case "bold":
    case "italic":
    case "strike":
    case "code":
      assertNoLossyAttributes(mark.type, mark.attrs);
      return;
    default:
      return;
  }
}

function assertMarkdownSerializableMarks(
  node: FolioJSONContent,
  customTypes: Set<string>,
  schema: ReturnType<typeof getSchema>,
): void {
  for (const mark of node.marks ?? []) {
    const markType = mark.type ?? "unknown";

    if (customTypes.has(markType)) continue;
    if (!markdownSerializableMarks.has(markType)) {
      throw FolioMarkdownSerializationError.unsupportedMark(markType);
    }

    assertMarkAttributes(mark, schema.marks[markType]?.spec.attrs);
  }
}

function assertMarkdownSerializableNode(
  node: FolioJSONContent,
  customTypes: Set<string>,
  schema: ReturnType<typeof getSchema>,
): void {
  const nodeType = node.type ?? "unknown";

  if (customTypes.has(nodeType)) return;
  if (!markdownSerializableNodes.has(nodeType)) {
    throw FolioMarkdownSerializationError.unsupportedNode(nodeType);
  }

  assertNodeAttributes(node, schema.nodes[nodeType]?.spec.attrs);
}

function createMarkdownManager(options: FolioSerializationOptions = {}): MarkdownManager {
  // Tiptap's default uses marked's global singleton and registers extension tokenizers into it.
  // Its namespace-shaped type also requires Lexer; runtime operations use this isolated instance.
  const marked = Object.assign(new Marked(), { Lexer });
  return new MarkdownManager({
    marked: marked as unknown as NonNullable<
      ConstructorParameters<typeof MarkdownManager>[0]
    >["marked"],
    extensions: createDefaultTiptapExtensions({
      folioExtensions: serializationExtensions(options),
    }),
  });
}

function assertPortableMarkdown(
  manager: MarkdownManager,
  markdown: string,
  options: FolioSerializationOptions,
): void {
  const tokens = manager.instance.lexer(markdown);
  const pending: unknown[] = [tokens];
  let count = 0;
  while (pending.length) {
    const token = pending.pop();
    if (!token || typeof token !== "object") continue;
    if (++count > (options.limits?.maxNodes ?? defaultFolioDocumentLimits.maxNodes) * 8) {
      throw new FolioDocumentValidationError([
        { code: "node_limit", path: "$", message: "Markdown exceeds the token limit" },
      ]);
    }
    if ("type" in token && token.type === "html") {
      throw new FolioMarkdownSerializationError(
        "Raw HTML is not supported in Markdown. Use fromHTML for explicit HTML import.",
      );
    }
    for (const child of Object.values(token)) pending.push(child);
  }
}

function hasNonEmptyCaption(node: FolioJSONContent): boolean {
  const caption = node.attrs?.caption;
  return typeof caption === "string" ? caption.trim() !== "" : Boolean(caption);
}

function assertMarkdownSerializable(
  node: FolioJSONContent,
  customTypes: Set<string>,
  schema: ReturnType<typeof getSchema>,
): void {
  assertMarkdownSerializableNode(node, customTypes, schema);
  assertMarkdownSerializableMarks(node, customTypes, schema);

  for (const child of node.content ?? []) {
    assertMarkdownSerializable(child, customTypes, schema);
  }
}

export function toMarkdown(
  document: FolioDocument,
  options: FolioMarkdownSerializationOptions = {},
): string {
  // Validate structure first while retaining unsupported types so the established Markdown error stays actionable.
  parseFolioDocument(document, {
    ...options,
    extensions: serializationExtensions(options),
    allowUnknownContent: true,
  });
  const prepare = (node: FolioJSONContent): FolioJSONContent => {
    const result = { ...node, ...(node.content ? { content: node.content.map(prepare) } : {}) };
    if (
      node.type === "heading" &&
      typeof node.attrs?.id === "string" &&
      node.attrs.id &&
      node.attrs.id === node.attrs["data-toc-id"]
    ) {
      result.attrs = { ...node.attrs };
      delete result.attrs.id;
      delete result.attrs["data-toc-id"];
    }
    return result;
  };
  const serializableDocument =
    options.headingIds === "omit-matching-toc" ? (prepare(document) as FolioDocument) : document;
  const schema = getSchema(
    createDefaultTiptapExtensions({ folioExtensions: serializationExtensions(options) }),
  );
  const customTypes = new Set(
    flattenExtensions(
      serializationExtensions(options).flatMap((extension) => extension.tiptapExtensions ?? []),
    )
      .filter(
        (extension) =>
          typeof getExtensionField(extension, "renderMarkdown") === "function" &&
          typeof getExtensionField(extension, "parseMarkdown") === "function",
      )
      .map((extension) => extension.name),
  );
  assertMarkdownSerializable(serializableDocument, customTypes, schema);
  parseFolioDocument(serializableDocument, {
    ...options,
    extensions: serializationExtensions(options),
  });
  assertSafeDocumentUrls(serializableDocument);
  const manager = createMarkdownManager(options);
  const markdown = manager.serialize(serializableDocument);
  assertPortableMarkdown(manager, markdown, options);
  const roundTrip = markdown.trim() === "" ? createEmptyFolioDocument() : manager.parse(markdown);
  const canonical = (value: unknown): string =>
    JSON.stringify(value, (_key, item: unknown) => {
      if (item && typeof item === "object" && !Array.isArray(item))
        return Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)));
      return item;
    });
  if (
    canonical(normalizedSerializationDocument(serializableDocument, schema)) !==
    canonical(normalizedSerializationDocument(roundTrip as FolioDocument, schema))
  ) {
    throw new FolioMarkdownSerializationError(
      "Markdown round-trip would change document content or attributes.",
    );
  }
  return markdown;
}

export function fromMarkdown(
  markdown: string,
  options: FolioSerializationOptions = {},
): FolioDocument {
  if (
    markdown.length >
    (options.limits?.maxTextLength ?? defaultFolioDocumentLimits.maxTextLength) * 4
  )
    throw new FolioDocumentValidationError([
      { code: "size_limit", path: "$", message: "Markdown exceeds the import limit" },
    ]);
  if (markdown.trim() === "") {
    return createEmptyFolioDocument();
  }

  const manager = createMarkdownManager(options);
  assertPortableMarkdown(manager, markdown, options);
  const document = parseFolioDocument(manager.parse(markdown), {
    ...options,
    extensions: serializationExtensions(options),
  });
  assertSafeDocumentUrls(document);
  return document;
}
