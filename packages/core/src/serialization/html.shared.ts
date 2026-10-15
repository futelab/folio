import { getSchema } from "@tiptap/core";
import type { Extensions, JSONContent } from "@tiptap/core";
import type { FolioDocument } from "../document";
import {
  defaultFolioDocumentLimits,
  FolioDocumentValidationError,
  parseFolioDocument,
} from "../document";
import { createDefaultTiptapExtensions } from "../extensions/defaultExtensions";
import { sanitizeFolioUrl } from "../security";
import { getFolioBlockAnchorId, isFolioBlockId } from "../extensions/blockIdentity";
import {
  assertSafeDocumentUrls,
  serializationExtensions,
  normalizedSerializationDocument,
} from "./options";
import type { FolioSerializationOptions } from "./options";
export type { FolioSerializationOptions } from "./options";

export interface FolioHTMLAdapter {
  generateHTML: (document: JSONContent, extensions: Extensions) => string;
  generateJSON: (
    html: string,
    extensions: Extensions,
    options?: { preserveWhitespace?: boolean | "full" },
  ) => JSONContent;
  createDOM: () => { document: Document; close: () => void };
}

function assertHTMLPreservesDocument(
  expected: FolioDocument,
  actual: FolioDocument,
  schema: ReturnType<typeof getSchema>,
): void {
  const canonical = (value: unknown) =>
    JSON.stringify(value, (_key, item: unknown) =>
      item && typeof item === "object" && !Array.isArray(item)
        ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
        : item,
    );
  const fail = (path: string) => {
    throw new FolioDocumentValidationError([
      {
        code: "lossy_html",
        path,
        message: "HTML round-trip would change document content or attributes",
      },
    ]);
  };
  const attrs = (before: JSONContent, after: JSONContent, kind: "node" | "mark", path: string) => {
    const specs =
      (kind === "node" ? schema.nodes[before.type ?? ""] : schema.marks[before.type ?? ""])?.spec
        .attrs ?? {};
    for (const [name, value] of Object.entries(before.attrs ?? {})) {
      // Defaults need not be explicitly stored. Generated heading IDs may be added to resolve exported TOC links.
      if (canonical(value) === canonical(specs[name]?.default)) continue;
      if (canonical(value) !== canonical(after.attrs?.[name])) fail(`${path}.attrs.${name}`);
    }
  };
  const visit = (before: JSONContent, after: JSONContent, path: string): void => {
    if (before.type !== after.type || before.text !== after.text) fail(path);
    attrs(before, after, "node", path);
    if ((before.marks?.length ?? 0) !== (after.marks?.length ?? 0)) fail(`${path}.marks`);
    before.marks?.forEach((mark, index) => {
      const counterpart = after.marks![index]!;
      if (mark.type !== counterpart.type) fail(`${path}.marks[${index}]`);
      attrs(mark, counterpart, "mark", `${path}.marks[${index}]`);
    });
    if ((before.content?.length ?? 0) !== (after.content?.length ?? 0)) fail(`${path}.content`);
    before.content?.forEach((child, index) =>
      visit(child, after.content![index]!, `${path}.content[${index}]`),
    );
  };
  visit(
    normalizedSerializationDocument(expected, schema),
    normalizedSerializationDocument(actual, schema),
    "$",
  );
}

function inspectHTML(html: string, options: FolioSerializationOptions, adapter: FolioHTMLAdapter) {
  if (
    html.length >
    (options.limits?.maxTextLength ?? defaultFolioDocumentLimits.maxTextLength) * 4
  ) {
    throw new FolioDocumentValidationError([
      { code: "size_limit", path: "$", message: "HTML exceeds the import limit" },
    ]);
  }
  const window = adapter.createDOM();
  try {
    window.document.body.innerHTML = html;
    const schema = getSchema(
      createDefaultTiptapExtensions({ folioExtensions: serializationExtensions(options) }),
    );
    const schemaTypes = [...Object.values(schema.nodes), ...Object.values(schema.marks)] as Array<{
      spec: { parseDOM?: Array<{ tag?: string }>; attrs?: Record<string, unknown> };
    }>;
    const tags = schemaTypes.flatMap(
      (type) => type.spec.parseDOM?.flatMap((rule) => (rule.tag ? [rule.tag] : [])) ?? [],
    );
    const dataAttributes = new Set([
      "data-type",
      "data-level",
      "data-mention-suggestion-char",
      "data-folio-block-id",
      "data-folio-block-anchor",
      ...tags.flatMap((tag) => Array.from(tag.matchAll(/\[(data-[\w-]+)/g), (match) => match[1]!)),
      ...schemaTypes.flatMap((type) =>
        Object.keys(type.spec.attrs ?? {}).flatMap((name) => [name, `data-${name}`]),
      ),
    ]);
    const containers = new Set([
      "DIV",
      "SPAN",
      "ARTICLE",
      "SECTION",
      "MAIN",
      "TBODY",
      "THEAD",
      "TFOOT",
      "COLGROUP",
      "COL",
      "FIGCAPTION",
      "LABEL",
    ]);
    let count = 0;
    for (const element of window.document.body.querySelectorAll("*")) {
      if (
        ["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "BASE", "META", "LINK", "FORM"].includes(
          element.tagName,
        )
      ) {
        throw new FolioDocumentValidationError([
          {
            code: "unsafe_html",
            path: element.tagName.toLowerCase(),
            message: "Active HTML elements are not permitted by the serialization policy",
          },
        ]);
      }
      if (++count > (options.limits?.maxNodes ?? defaultFolioDocumentLimits.maxNodes) * 4)
        throw new FolioDocumentValidationError([
          { code: "node_limit", path: "$", message: "HTML exceeds the element limit" },
        ]);
      let depth = 0;
      for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement)
        depth += 1;
      if (depth > (options.limits?.maxDepth ?? defaultFolioDocumentLimits.maxDepth) * 4)
        throw new FolioDocumentValidationError([
          { code: "depth_limit", path: "$", message: "HTML exceeds the nesting limit" },
        ]);
      if (
        !containers.has(element.tagName) &&
        !(element.tagName === "INPUT" && element.getAttribute("type") === "checkbox") &&
        !tags.some((tag) => {
          try {
            return element.matches(tag);
          } catch {
            return false;
          }
        })
      ) {
        throw new FolioDocumentValidationError([
          {
            code: "unsupported_html",
            path: element.tagName.toLowerCase(),
            message: `Unsupported HTML element: ${element.tagName.toLowerCase()}`,
          },
        ]);
      }
      for (const attribute of element.attributes) {
        if (attribute.name.startsWith("data-") && !dataAttributes.has(attribute.name)) {
          throw new FolioDocumentValidationError([
            {
              code: "unsupported_html_attribute",
              path: attribute.name,
              message: "Unregistered HTML data attribute would be lost by the schema",
            },
          ]);
        }
        if (/^on/i.test(attribute.name) || ["srcdoc", "formaction"].includes(attribute.name))
          throw new FolioDocumentValidationError([
            {
              code: "unsafe_html",
              path: attribute.name,
              message: "Executable HTML attributes are not permitted",
            },
          ]);
        const kind =
          attribute.name === "href" ||
          attribute.name === "data-url" ||
          attribute.name.endsWith(":href")
            ? "link"
            : attribute.name === "src" || attribute.name === "poster"
              ? "image"
              : undefined;
        if (kind && attribute.value && !sanitizeFolioUrl(attribute.value, { kind }))
          throw new FolioDocumentValidationError([
            {
              code: "unsafe_url",
              path: attribute.name,
              message: "URL is not permitted by the Folio URL policy",
            },
          ]);
      }
    }
    return window;
  } catch (error) {
    window.close();
    throw error;
  }
}

export function createHTMLSerialization(adapter: FolioHTMLAdapter) {
  function toHTML(document: FolioDocument, options: FolioSerializationOptions = {}): string {
    const extensions = serializationExtensions(options);
    parseFolioDocument(document, { ...options, extensions });
    assertSafeDocumentUrls(document);
    const window = inspectHTML(
      adapter.generateHTML(
        document,
        createDefaultTiptapExtensions({ folioExtensions: extensions }),
      ),
      options,
      adapter,
    );
    try {
      const usedIds = new Set<string>();
      for (const block of window.document.body.querySelectorAll("[data-folio-block-id]")) {
        const id = block.getAttribute("data-folio-block-id");
        if (isFolioBlockId(id)) {
          const heading = block.matches("h1,h2,h3");
          if (!heading || !block.id) block.id = getFolioBlockAnchorId(id);
          if (!heading) usedIds.add(block.id);
          else if (block.id !== getFolioBlockAnchorId(id)) usedIds.add(getFolioBlockAnchorId(id));
        }
      }
      const headings = Array.from(window.document.body.querySelectorAll("h1,h2,h3"));
      for (const [index, heading] of headings.entries()) {
        const base =
          heading.id ||
          heading.getAttribute("data-toc-id") ||
          heading.textContent
            ?.trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "") ||
          `heading-${index + 1}`;
        let id = base;
        let suffix = 2;
        while (usedIds.has(id)) id = `${base}-${suffix++}`;
        usedIds.add(id);
        heading.id = id;
      }
      for (const heading of headings) {
        const blockId = heading.getAttribute("data-folio-block-id");
        if (!isFolioBlockId(blockId)) continue;
        const anchorId = getFolioBlockAnchorId(blockId);
        if (heading.id === anchorId) continue;
        const alias = window.document.createElement("span");
        alias.id = anchorId;
        alias.setAttribute("data-folio-block-anchor", "");
        alias.setAttribute("aria-hidden", "true");
        heading.before(alias);
      }
      for (const toc of window.document.body.querySelectorAll("nav[data-folio-toc]")) {
        const list = window.document.createElement("ol");
        for (const heading of headings) {
          const item = window.document.createElement("li");
          item.setAttribute("data-level", heading.tagName.slice(1));
          const link = window.document.createElement("a");
          link.setAttribute("href", `#${heading.id}`);
          link.textContent = heading.textContent;
          item.appendChild(link);
          list.appendChild(item);
        }
        toc.replaceChildren(list);
      }
      const html = window.document.body.innerHTML;
      const tiptapExtensions = createDefaultTiptapExtensions({ folioExtensions: extensions });
      const roundTrip = parseFolioDocument(
        adapter.generateJSON(html, tiptapExtensions, { preserveWhitespace: "full" }),
        { ...options, extensions },
      );
      assertHTMLPreservesDocument(document, roundTrip, getSchema(tiptapExtensions));
      return html;
    } finally {
      window.close();
    }
  }

  function fromHTML(html: string, options: FolioSerializationOptions = {}): FolioDocument {
    const window = inspectHTML(html, options, adapter);
    try {
      const extensions = serializationExtensions(options);
      const document = adapter.generateJSON(
        window.document.body.innerHTML,
        createDefaultTiptapExtensions({ folioExtensions: extensions }),
        { preserveWhitespace: "full" },
      );
      return parseFolioDocument(document, { ...options, extensions });
    } finally {
      window.close();
    }
  }
  return { toHTML, fromHTML };
}
