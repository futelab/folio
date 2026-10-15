import type { JSONContent } from "@tiptap/core";
import { Fragment, Slice, type Node as ProseMirrorNode, type Schema } from "@tiptap/pm/model";
import type { FolioDocument } from "@futelab/folio-core/browser";
import { assertSafeDocumentUrls, defaultFolioDocumentLimits } from "@futelab/folio-core/browser";
import { FolioClipboardError } from "./types";

export interface FolioClipboardFragment {
  format: "folio-clipboard";
  version: 1;
  document: FolioDocument;
  openStart: number;
  openEnd: number;
}

export function documentForSlice(slice: Slice): FolioDocument {
  return { type: "doc", content: slice.content.toJSON() ?? [] };
}

export function encodeClipboardFragment(
  slice: Slice,
  parse: (value: unknown) => FolioDocument,
): string {
  const document = parse(documentForSlice(slice));
  assertSafeDocumentUrls(document);
  return JSON.stringify({
    format: "folio-clipboard",
    version: 1,
    document,
    openStart: slice.openStart,
    openEnd: slice.openEnd,
  } satisfies FolioClipboardFragment);
}

export function decodeClipboardFragment(
  input: string,
  schema: Schema,
  parse: (value: unknown) => FolioDocument,
): Slice {
  if (input.length > defaultFolioDocumentLimits.maxTextLength * 4)
    throw new FolioClipboardError("size-limit", "Clipboard fragment exceeds the size limit.");
  const payload = JSON.parse(input) as Partial<FolioClipboardFragment>;
  if (
    !payload ||
    typeof payload !== "object" ||
    payload.format !== "folio-clipboard" ||
    payload.version !== 1 ||
    Object.keys(payload).some(
      (key) => !["format", "version", "document", "openStart", "openEnd"].includes(key),
    )
  )
    throw new FolioClipboardError(
      "invalid-fragment",
      "Clipboard fragment has an unsupported format or version.",
    );
  const document = parse(payload.document);
  assertSafeDocumentUrls(document);
  const content = Fragment.fromJSON(schema, document.content);
  const maximum = Slice.maxOpen(content);
  if (
    !Number.isSafeInteger(payload.openStart) ||
    !Number.isSafeInteger(payload.openEnd) ||
    payload.openStart! < 0 ||
    payload.openEnd! < 0 ||
    payload.openStart! > maximum.openStart ||
    payload.openEnd! > maximum.openEnd
  )
    throw new FolioClipboardError(
      "invalid-fragment",
      "Clipboard fragment has invalid open depths.",
    );
  return new Slice(content, payload.openStart!, payload.openEnd!);
}

function identityAttributes(node: JSONContent): string[] {
  return node.type === "mention"
    ? ["data-toc-id", "folioBlockId"]
    : ["id", "data-toc-id", "folioBlockId"];
}

/** Preserve identities unless they collide; mentions' user IDs are never document anchors. */
export function deduplicateClipboardIds(
  slice: Slice,
  current: ProseMirrorNode,
  schema: Schema,
): Slice {
  const used = new Set<string>();
  current.descendants((node) => {
    for (const name of identityAttributes({ type: node.type.name })) {
      const value: unknown = node.attrs[name];
      if (typeof value === "string" && value) used.add(value);
    }
  });
  // Node.toJSON retains attrs objects; clone before editing to keep the source
  // editor's immutable document and its undo history untouched.
  const json = JSON.parse(JSON.stringify(documentForSlice(slice))) as FolioDocument;
  const references = new Map<string, string>();
  const pending = [...(json.content ?? [])];
  for (let index = 0; index < pending.length; index += 1) {
    const node = pending[index]!;
    if (node.attrs) {
      const sameNode = new Map<string, string>();
      for (const name of identityAttributes(node)) {
        const old: unknown = node.attrs[name];
        if (typeof old !== "string" || !old) continue;
        let value = sameNode.get(old);
        if (!value) {
          value = old;
          if (used.has(value)) {
            do {
              value = `folio-paste-${globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`;
            } while (used.has(value));
          }
          if (!references.has(old)) references.set(old, value);
          sameNode.set(old, value);
          used.add(value);
        }
        node.attrs[name] = value;
      }
    }
    pending.push(...(node.content ?? []));
  }
  const links = [...(json.content ?? [])];
  while (links.length) {
    const node = links.pop()!;
    for (const mark of node.marks ?? []) {
      const href: unknown = mark.attrs?.href;
      if (typeof href !== "string" || !href.startsWith("#")) continue;
      const value = href.slice(1);
      const replacement =
        references.get(value) ??
        (value.startsWith("folio-block-") && references.has(value.slice(12))
          ? `folio-block-${references.get(value.slice(12))}`
          : undefined);
      if (replacement) mark.attrs = { ...mark.attrs, href: `#${replacement}` };
    }
    links.push(...(node.content ?? []));
  }
  return new Slice(Fragment.fromJSON(schema, json.content), slice.openStart, slice.openEnd);
}
