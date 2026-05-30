import { describe, expect, it } from "vitest";
import {
  createEmptyFolioDocument,
  fromHTML,
  fromMarkdown,
  type FolioDocument,
  sampleFolioDocument,
  toHTML,
  toMarkdown,
} from "../index";

describe("Folio serialization", () => {
  it("renders Folio JSON to HTML on the server path", () => {
    expect(toHTML(sampleFolioDocument)).toContain("<h1");
    expect(toHTML(sampleFolioDocument)).toContain("Folio document");
  });

  it("parses HTML into Folio JSON", () => {
    expect(fromHTML("<h1>Hello</h1><p>World</p>")).toMatchObject({
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 1 } },
        { type: "paragraph" },
      ],
    });
  });

  it("returns an empty document for blank Markdown", () => {
    expect(fromMarkdown("")).toEqual(createEmptyFolioDocument());
  });

  it("serializes basic Markdown", () => {
    expect(toMarkdown(sampleFolioDocument)).toContain("# Folio document");
  });

  it.each([
    [
      "bookmark",
      {
        type: "bookmark",
        attrs: {
          url: "https://example.com",
          title: "Example",
          description: "Reference link",
        },
      },
      /FolioMarkdownSerializationError: Markdown serialization does not support lossy node/,
    ],
    [
      "callout",
      {
        type: "callout",
        attrs: { tone: "info" },
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Note" }],
          },
        ],
      },
      /FolioMarkdownSerializationError: Markdown serialization does not support lossy node/,
    ],
    [
      "tableOfContents",
      {
        type: "tableOfContents",
      },
      /FolioMarkdownSerializationError: Markdown serialization does not support lossy node/,
    ],
    [
      "table",
      {
        type: "table",
        content: [
          {
            type: "tableRow",
            content: [
              {
                type: "tableCell",
                content: [{ type: "paragraph" }],
              },
            ],
          },
        ],
      },
      /FolioMarkdownSerializationError: Markdown serialization does not support lossy node/,
    ],
    [
      "image",
      {
        type: "image",
        attrs: {
          src: "https://example.com/image.png",
          alt: "Example image",
          caption: "Image caption",
        },
      },
      /FolioMarkdownSerializationError: Markdown serialization does not support lossy attribute "caption" on "image"/,
    ],
  ])("throws before lossy Markdown serialization for %s", (_name, node, error) => {
    const document: FolioDocument = {
      type: "doc",
      content: [node],
    };

    expect(() => toMarkdown(document)).toThrow(error);
  });

  it.each([
    [
      "textStyle",
      [{ type: "textStyle", attrs: { color: "#ff0000" } }],
      /FolioMarkdownSerializationError: Markdown serialization does not support lossy mark/,
    ],
    [
      "color",
      [{ type: "color", attrs: { color: "#ff0000" } }],
      /FolioMarkdownSerializationError: Markdown serialization does not support lossy mark/,
    ],
    [
      "highlight",
      [{ type: "highlight", attrs: { color: "#fff3a3" } }],
      /FolioMarkdownSerializationError: Markdown serialization does not support lossy mark/,
    ],
    [
      "underline",
      [{ type: "underline" }],
      /FolioMarkdownSerializationError: Markdown serialization does not support lossy mark/,
    ],
    [
      "link target attribute",
      [{ type: "link", attrs: { href: "https://example.com", target: "_blank" } }],
      /FolioMarkdownSerializationError: Markdown serialization does not support lossy attribute "target" on "link"/,
    ],
    [
      "unknown custom mark",
      [{ type: "comment", attrs: { id: "thread-1" } }],
      /FolioMarkdownSerializationError: Markdown serialization does not support lossy mark/,
    ],
  ])("throws before lossy Markdown serialization for %s", (_name, marks, error) => {
    const document: FolioDocument = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", marks, text: "Styled text" }],
        },
      ],
    };

    expect(() => toMarkdown(document)).toThrow(error);
  });

  it("throws before lossy Markdown serialization for unknown custom nodes", () => {
    const document: FolioDocument = {
      type: "doc",
      content: [
        {
          type: "embed",
          attrs: { provider: "video", id: "abc123" },
        },
      ],
    };

    expect(() => toMarkdown(document)).toThrow(
      /FolioMarkdownSerializationError: Markdown serialization does not support lossy node "embed"/,
    );
  });

  it("round-trips bookmark nodes through HTML", () => {
    const bookmarkDocument: FolioDocument = {
      type: "doc",
      content: [
        {
          type: "bookmark",
          attrs: {
            url: "https://example.com",
            title: "Example",
            description: "Reference link",
          },
        },
      ],
    };

    expect(fromHTML(toHTML(bookmarkDocument))).toMatchObject({
      type: "doc",
      content: [
        {
          type: "bookmark",
          attrs: {
            url: "https://example.com",
            title: "Example",
            description: "Reference link",
          },
        },
      ],
    });
  });
});
