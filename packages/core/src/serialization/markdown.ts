import { MarkdownManager } from "@tiptap/markdown";
import type { FolioDocument, FolioJSONContent } from "../document";
import { createEmptyFolioDocument, isFolioDocument } from "../document";
import { createDefaultTiptapExtensions } from "../extensions/defaultExtensions";

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

const markdownSerializableMarks = new Set([
  "bold",
  "italic",
  "strike",
  "code",
  "link",
]);

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

  static lossyAttribute(
    ownerType: string,
    attrName: string,
  ): FolioMarkdownSerializationError {
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
): void {
  const allowed = new Set(allowedAttrs);

  for (const [name, value] of Object.entries(attrs ?? {})) {
    if (!allowed.has(name) && !isEmptyAttributeValue(value)) {
      throw FolioMarkdownSerializationError.lossyAttribute(ownerType, name);
    }
  }
}

function assertNodeAttributes(node: FolioJSONContent): void {
  switch (node.type) {
    case "heading":
      assertNoLossyAttributes("heading", node.attrs, ["level"]);
      return;
    case "orderedList":
      assertNoLossyAttributes("orderedList", node.attrs, ["start"]);
      return;
    case "taskItem":
      assertNoLossyAttributes("taskItem", node.attrs, ["checked"]);
      return;
    case "codeBlock":
      assertNoLossyAttributes("codeBlock", node.attrs, ["language"]);
      return;
    case "image":
      assertNoLossyAttributes("image", node.attrs, [
        "src",
        "alt",
        "title",
        "caption",
      ]);

      if (hasNonEmptyCaption(node)) {
        throw FolioMarkdownSerializationError.lossyAttribute("image", "caption");
      }

      return;
    default:
      assertNoLossyAttributes(node.type ?? "unknown", node.attrs);
  }
}

function assertMarkAttributes(mark: {
  type?: string;
  attrs?: Record<string, unknown>;
}): void {
  switch (mark.type) {
    case "link":
      assertNoLossyAttributes("link", mark.attrs, ["href", "title"]);
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

function assertMarkdownSerializableMarks(node: FolioJSONContent): void {
  for (const mark of node.marks ?? []) {
    const markType = mark.type ?? "unknown";

    if (!markdownSerializableMarks.has(markType)) {
      throw FolioMarkdownSerializationError.unsupportedMark(markType);
    }

    assertMarkAttributes(mark);
  }
}

function assertMarkdownSerializableNode(node: FolioJSONContent): void {
  const nodeType = node.type ?? "unknown";

  if (!markdownSerializableNodes.has(nodeType)) {
    throw FolioMarkdownSerializationError.unsupportedNode(nodeType);
  }

  assertNodeAttributes(node);
}

function createMarkdownManager(): MarkdownManager {
  return new MarkdownManager({
    extensions: createDefaultTiptapExtensions(),
  });
}

function hasNonEmptyCaption(node: FolioJSONContent): boolean {
  const caption = node.attrs?.caption;
  return typeof caption === "string" ? caption.trim() !== "" : Boolean(caption);
}

function assertMarkdownSerializable(node: FolioJSONContent): void {
  assertMarkdownSerializableNode(node);
  assertMarkdownSerializableMarks(node);

  for (const child of node.content ?? []) {
    assertMarkdownSerializable(child);
  }
}

export function toMarkdown(document: FolioDocument): string {
  assertMarkdownSerializable(document);
  return createMarkdownManager().serialize(document);
}

export function fromMarkdown(markdown: string): FolioDocument {
  if (markdown.trim() === "") {
    return createEmptyFolioDocument();
  }

  const document = createMarkdownManager().parse(markdown);

  if (!isFolioDocument(document)) {
    return createEmptyFolioDocument();
  }

  return document;
}
