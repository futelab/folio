import { Editor, Node, createAtomBlockMarkdownSpec } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import {
  createEmptyFolioDocument,
  createFolioSnapshot,
  parseFolioSnapshot,
  parseFolioDocument,
  validateFolioDocument,
  isFolioDocument,
  FolioDocumentValidationError,
  createFolioExtension,
  createFolioExtensionRegistry,
  createDefaultFolioCommands,
  toHTML,
  fromHTML,
  toMarkdown,
  fromMarkdown,
  sanitizeFolioUrl,
  createFolioDocumentValidator,
  assertSafeDocumentUrls,
  createDefaultTiptapExtensions,
} from "../index";
import type { FolioDocument } from "../document";
import {
  toHTML as browserToHTML,
  fromHTML as browserFromHTML,
} from "../serialization/html.browser";

const paragraph = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] });
const documentWith = (...content: NonNullable<FolioDocument["content"]>): FolioDocument => ({
  type: "doc",
  content,
});

const Reference = Node.create({
  name: "referenceCard",
  group: "block",
  atom: true,
  addAttributes: () => ({
    reference: {
      default: null,
      parseHTML: (element: HTMLElement) => element.getAttribute("data-reference"),
      renderHTML: (attrs: Record<string, unknown>) => ({ "data-reference": attrs.reference }),
    },
  }),
  parseHTML: () => [{ tag: "div[data-reference]" }],
  renderHTML: ({ HTMLAttributes }) => ["div", HTMLAttributes],
  ...createAtomBlockMarkdownSpec({
    nodeName: "referenceCard",
    allowedAttributes: ["reference"],
    requiredAttributes: ["reference"],
  }),
});
const references = createFolioExtension({ name: "references", tiptapExtensions: [Reference] });

describe("document reliability", () => {
  it("compiles a schema once per explicit validator and refreshes mutable custom schemas in convenience validation", () => {
    let builds = 0;
    const Configurable = Node.create({
      name: "configurable",
      group: "block",
      atom: true,
      addOptions: () => ({ field: "first" }),
      addAttributes() {
        builds += 1;
        return { [this.options.field]: { default: null } };
      },
    });
    const options = { extensions: [{ name: "configurable", tiptapExtensions: [Configurable] }] };
    const original = documentWith({ type: "configurable", attrs: { first: "saved" } });
    const compiled = createFolioDocumentValidator(options);
    const initialBuilds = builds;
    expect(compiled.parse(original)).toBe(original);
    expect(compiled.is(original)).toBe(true);
    expect(builds).toBe(initialBuilds);
    Configurable.config.addOptions = () => ({ field: "second" });
    expect(validateFolioDocument(original, options).valid).toBe(false);
    expect(
      validateFolioDocument(
        documentWith({ type: "configurable", attrs: { second: "new" } }),
        options,
      ).valid,
    ).toBe(true);
    // An explicitly compiled schema, like an existing editor, remains stable until its owner recreates it.
    expect(compiled.is(original)).toBe(true);
    expect(createFolioDocumentValidator(options).is(original)).toBe(false);
  });
  it.each([
    { type: "doc", content: {} },
    { type: "doc", content: [null] },
    documentWith({
      type: "paragraph",
      content: [{ type: "text", text: "Hello", marks: {} as never }],
    }),
    documentWith({ type: "paragraph", content: [{ type: "text", text: {} as never }] }),
    documentWith({
      type: "heading",
      attrs: { level: 99 },
      content: [{ type: "text", text: "Bad heading" }],
    }),
    documentWith({ type: "text", text: "Text cannot be a top-level block" }),
    documentWith({ type: "paragraph", attrs: { unregistered: "would disappear" } }),
    documentWith({ type: "paragraph", attrs: { toString: "would disappear" } }),
  ])("rejects malformed or schema-invalid saved JSON without repairing it", (value) => {
    expect(isFolioDocument(value)).toBe(false);
    expect(() => parseFolioDocument(value)).toThrow(FolioDocumentValidationError);
  });

  it("rejects cycles and bounds nodes, nesting, text and attribute complexity", () => {
    const cyclic: Record<string, unknown> = { type: "doc" };
    cyclic.content = [cyclic];
    expect(validateFolioDocument(cyclic).errors[0]?.code).toBe("cyclic_value");
    expect(
      validateFolioDocument(documentWith(paragraph("hello")), { limits: { maxNodes: 2 } }).errors[0]
        ?.code,
    ).toBe("node_limit");
    expect(
      validateFolioDocument(documentWith(paragraph("hello")), { limits: { maxDepth: 1 } }).errors[0]
        ?.code,
    ).toBe("depth_limit");
    expect(
      validateFolioDocument(documentWith(paragraph("hello")), { limits: { maxTextLength: 4 } })
        .errors[0]?.code,
    ).toBe("size_limit");
    expect(
      validateFolioDocument(documentWith({ type: "image", attrs: { src: "/a.png", alt: "a" } }), {
        limits: { maxAttributeValues: 1 },
      }).errors[0]?.code,
    ).toBe("size_limit");
  });

  it("accepts only configured custom schemas, with explicit reader recovery for unknown content", () => {
    const custom = documentWith({ type: "referenceCard", attrs: { reference: "book-1" } });
    expect(isFolioDocument(custom)).toBe(false);
    expect(isFolioDocument(custom, { extensions: [references] })).toBe(true);
    expect(validateFolioDocument(custom, { allowUnknownContent: true }).valid).toBe(true);
    expect(
      validateFolioDocument(
        documentWith(custom.content![0]!, { type: "paragraph", content: [{ type: "paragraph" }] }),
        { allowUnknownContent: true },
      ).valid,
    ).toBe(false);
    expect(() => toHTML(custom)).toThrow(/Unregistered node/);
    expect(
      fromHTML(toHTML(custom, { extensions: [references] }), { extensions: [references] }),
    ).toMatchObject(custom);
    expect(() => fromHTML('<div data-reference="book-1">Reference</div>')).toThrow(
      /Unregistered HTML data attribute/,
    );
  });

  it("migrates legacy documents and parses versioned snapshots without mutating the source", () => {
    const legacy = documentWith(paragraph("Saved"));
    const snapshot = createFolioSnapshot(legacy);
    legacy.content![0]!.content![0]!.text = "Changed";
    expect(snapshot.document.content![0]!.content![0]!.text).toBe("Saved");
    expect(parseFolioSnapshot(snapshot)).toEqual(snapshot);
    expect(parseFolioSnapshot(JSON.stringify(snapshot))).toEqual(snapshot);
    expect(parseFolioSnapshot(createEmptyFolioDocument())).toMatchObject({
      format: "folio",
      version: 1,
    });
    expect(() => parseFolioSnapshot({ ...snapshot, version: 99 })).toThrow(
      /Unsupported Folio document version/,
    );
    expect(() => parseFolioSnapshot("{broken")).toThrow(/not valid JSON/);
  });

  it("lets node and mark renderers share a type while rejecting duplicate renderer keys", () => {
    const extension = createFolioExtension({
      name: "rendering",
      renderers: [
        { type: "reference", render: (_node, context) => context.children },
        { type: "reference", kind: "mark", render: (_node, context) => context.children },
      ],
    });
    expect(createFolioExtensionRegistry([extension]).renderers).toHaveLength(2);
    expect(() =>
      createFolioExtensionRegistry([
        extension,
        { name: "duplicate", renderers: [{ type: "reference", render: () => null }] },
      ]),
    ).toThrow(/Duplicate Folio renderer/);
  });
});

describe("serialization fidelity and safety", () => {
  it("exports real edited headings only when the caller explicitly omits matching derived TOC IDs", () => {
    const editor = new Editor({
      extensions: createDefaultTiptapExtensions(),
      content: documentWith({
        type: "heading",
        attrs: { level: 1 },
        content: [{ type: "text", text: "Heading" }],
      }),
    });
    try {
      editor.commands.insertContent("Edited ");
      const edited = editor.getJSON() as FolioDocument;
      const attrs = edited.content![0]!.attrs!;
      expect(attrs.id).toEqual(expect.any(String));
      expect(attrs.id).toBe(attrs["data-toc-id"]);
      const saved = JSON.stringify(edited);
      expect(() => toMarkdown(edited)).toThrow(/lossy attribute/);
      expect(toMarkdown(edited, { headingIds: "omit-matching-toc" })).toContain("# Edited Heading");
      expect(JSON.stringify(edited)).toBe(saved);
      expect(() =>
        toMarkdown(
          documentWith({
            type: "heading",
            attrs: { level: 1, id: "author-anchor" },
            content: [{ type: "text", text: "Authored" }],
          }),
          { headingIds: "omit-matching-toc" },
        ),
      ).toThrow(/lossy attribute/);
    } finally {
      editor.destroy();
    }
  });

  it("preserves literal whitespace in HTML and rejects a plugin that drops a saved attribute", () => {
    const spaced = documentWith(paragraph("  Before   and after  "));
    expect(fromHTML(toHTML(spaced))).toMatchObject(spaced);
    const Lossy = Node.create({
      name: "lossy",
      group: "block",
      atom: true,
      addAttributes: () => ({ secret: { default: null, rendered: false } }),
      parseHTML: () => [{ tag: "div[data-lossy]" }],
      renderHTML: () => ["div", { "data-lossy": "" }],
    });
    expect(() =>
      toHTML(documentWith({ type: "lossy", attrs: { secret: "must survive" } }), {
        extensions: [{ name: "lossy", tiptapExtensions: [Lossy] }],
      }),
    ).toThrow(/HTML round-trip would change/);
  });

  it("exports ordinary images with absent or cleared optional metadata", () => {
    for (const attrs of [
      { src: "/photo.png" },
      { src: "/photo.png", alt: "", caption: "", title: "" },
    ]) {
      const document = documentWith({ type: "image", attrs });
      expect(toMarkdown(document)).toContain("/photo.png");
      expect(toHTML(document)).toContain("/photo.png");
    }
  });

  it.each([
    "<external-card>Reference</external-card>",
    "<strong>HTML</strong>",
    '<div data-reference="book-1">Reference</div>',
    "<!-- HTML comment -->",
    "<script>alert(1)</script>",
  ])("rejects raw Markdown HTML instead of losing metadata: %s", (raw) => {
    expect(() => fromMarkdown(raw)).toThrow(/Raw HTML.*fromHTML/);
  });

  it("allows code containing HTML and standard URL/email autolinks", () => {
    const markdown =
      '`<span>literal</span>`\n\n```html\n<div data-secret="code">Example</div>\n```\n\n<https://example.com> and <person@example.com>';
    const parsed = fromMarkdown(markdown);
    expect(parsed.content?.some((node) => node.type === "codeBlock")).toBe(true);
    expect(toMarkdown(parsed)).toContain("https://example.com");
  });

  it("isolates custom Markdown tokenizers from default managers and different extension sets", () => {
    const document = documentWith({ type: "referenceCard", attrs: { reference: "book-1" } });
    const firstOptions = { extensions: [references] };
    const Alternate = Reference.extend({
      ...createAtomBlockMarkdownSpec({
        nodeName: "referenceCard",
        name: "alternateCard",
        allowedAttributes: ["reference"],
        requiredAttributes: ["reference"],
      }),
    });
    const alternateOptions = { extensions: [{ name: "alternate", tiptapExtensions: [Alternate] }] };
    const first = toMarkdown(document, firstOptions);
    const second = toMarkdown(document, alternateOptions);
    expect(fromMarkdown(first, firstOptions)).toMatchObject(document);
    expect(fromMarkdown(second, alternateOptions)).toMatchObject(document);
    expect(fromMarkdown(first).content?.[0]?.type).toBe("paragraph");
    expect(fromMarkdown(first, alternateOptions).content?.[0]?.type).toBe("paragraph");
    expect(fromMarkdown(second, firstOptions).content?.[0]?.type).toBe("paragraph");
    expect(fromMarkdown(first, firstOptions)).toMatchObject(document);
  });
  it("keeps the empty-document Markdown contract while rejecting lost blank blocks", () => {
    expect(toMarkdown(createEmptyFolioDocument())).toBe("");
    expect(fromMarkdown(toMarkdown(createEmptyFolioDocument()))).toEqual(
      createEmptyFolioDocument(),
    );
    expect(() => toMarkdown(documentWith({ type: "paragraph" }, { type: "paragraph" }))).toThrow(
      /round-trip would change/,
    );
  });
  it("renders usable contents links and visible image captions and bookmark descriptions", () => {
    const document = documentWith(
      { type: "tableOfContents" },
      { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Hello" }] },
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Hello" }] },
      { type: "image", attrs: { src: "/photo.png", caption: "Visible caption", alt: "Photo" } },
      {
        type: "bookmark",
        attrs: { url: "https://example.com", title: "Example", description: "Visible description" },
      },
    );
    const html = toHTML(document);
    expect(html).toContain('href="#hello"');
    expect(html).toContain('href="#hello-2"');
    expect(html).toContain("<figcaption>Visible caption</figcaption>");
    expect(html).toContain('<a href="https://example.com"');
    expect(html).toContain("<p>Visible description</p>");
    const result = fromHTML(html);
    expect(result.content?.filter((node) => node.type === "image")).toHaveLength(1);
    expect(result.content?.find((node) => node.type === "image")?.attrs?.caption).toBe(
      "Visible caption",
    );
    expect(result.content?.find((node) => node.type === "bookmark")?.attrs?.description).toBe(
      "Visible description",
    );
    expect(result.content?.filter((node) => node.type === "tableOfContents")).toHaveLength(1);
    expect(result.content?.filter((node) => node.type === "paragraph")).toHaveLength(0);
  });

  it("uses the same HTML contract in browsers", () => {
    const document = documentWith({
      type: "image",
      attrs: { src: "/photo.png", caption: "Browser caption" },
    });
    expect(browserFromHTML(browserToHTML(document))).toMatchObject(document);
  });

  it.each([
    '<iframe src="https://example.com"></iframe>',
    '<p onclick="alert(1)">Unsafe</p>',
    '<a href="javascript:alert(1)">Unsafe</a>',
    '<img src="data:image/svg+xml;base64,PHN2Zz4=" />',
    "<script>alert(1)</script>",
  ])("rejects unsafe or unsupported HTML instead of silently dropping it", (html) => {
    expect(() => fromHTML(html)).toThrow(FolioDocumentValidationError);
  });

  it("rejects unknown JSON and unsafe export URLs", () => {
    expect(() => toHTML(documentWith({ type: "lostEmbed", attrs: { id: "secret" } }))).toThrow(
      /Unregistered node/,
    );
    expect(() =>
      toHTML(documentWith({ type: "image", attrs: { src: "javascript:alert(1)" } })),
    ).toThrow(/URL is not permitted/);
    expect(() => fromMarkdown("[Unsafe](javascript:alert(1))")).toThrow(/URL is not permitted/);
  });

  it("round-trips custom Markdown extensions and default link attributes", () => {
    const document = documentWith({ type: "referenceCard", attrs: { reference: "book-1" } });
    const options = { extensions: [references] };
    expect(fromMarkdown(toMarkdown(document, options), options)).toMatchObject(document);
    const link = documentWith({
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "Example",
          marks: [
            {
              type: "link",
              attrs: {
                href: "https://example.com",
                target: "_blank",
                rel: "noopener noreferrer nofollow",
                class: null,
              },
            },
          ],
        },
      ],
    });
    expect(toMarkdown(link)).toContain("[Example](https://example.com)");
  });
});

describe("shared URLs and insertion commands", () => {
  it.each([
    "javascript:alert(1)",
    " java\tscript:alert(1)",
    "//evil.example",
    "\\evil.example",
    "data:text/html;base64,AAAA",
    "data:image/svg+xml;base64,AAAA",
  ])("rejects unsafe URL %s", (url) => {
    expect(sanitizeFolioUrl(url, { kind: "link" })).toBeUndefined();
    expect(sanitizeFolioUrl(url, { kind: "image" })).toBeUndefined();
  });

  it("allows expected relative, web, communication and raster image URLs", () => {
    expect(sanitizeFolioUrl("/images/a.png", { kind: "image" })).toBe("/images/a.png");
    expect(sanitizeFolioUrl("#heading", { kind: "link" })).toBe("#heading");
    expect(sanitizeFolioUrl("mailto:hello@example.com", { kind: "link" })).toBe(
      "mailto:hello@example.com",
    );
    expect(sanitizeFolioUrl("tel:+123", { kind: "image" })).toBeUndefined();
    expect(sanitizeFolioUrl("data:image/png;base64,AAAA", { kind: "image" })).toBe(
      "data:image/png;base64,AAAA",
    );
    expect(() =>
      assertSafeDocumentUrls(
        documentWith({ type: "bookmark", attrs: { url: "javascript:alert(1)", title: "Saved" } }),
      ),
    ).toThrow(/URL is not permitted/);
  });

  it("does not insert empty media and preserves configured image and mention metadata", () => {
    const inserted: unknown[] = [];
    const chain = {
      focus: () => chain,
      run: () => true,
      setImage: (attrs: unknown) => {
        inserted.push(attrs);
        return chain;
      },
      insertContent: (node: unknown) => {
        inserted.push(node);
        return chain;
      },
    };
    const editor = { chain: () => chain };
    const commands = createDefaultFolioCommands();
    const image = commands.find((command) => command.name === "image")!;
    const bookmark = commands.find((command) => command.name === "bookmark")!;
    const mention = commands.find((command) => command.name === "mention")!;
    expect(image.action({ editor })).toBe(false);
    expect(bookmark.action({ editor, attrs: { url: "javascript:alert(1)" } })).toBe(false);
    expect(mention.action({ editor })).toBe(false);
    expect(inserted).toHaveLength(0);
    expect(
      image.action({ editor, attrs: { src: "/photo.png", alt: "Photo", caption: "Caption" } }),
    ).toBe(true);
    expect(mention.action({ editor, attrs: { id: "user-1", label: "Alice" } })).toBe(true);
    expect(inserted).toEqual([
      { src: "/photo.png", alt: "Photo", caption: "Caption" },
      { type: "mention", attrs: { id: "user-1", label: "Alice" } },
    ]);
  });
});
