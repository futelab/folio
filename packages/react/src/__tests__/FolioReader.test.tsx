import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { sampleFolioDocument } from "@futelab/folio-core";
import type { FolioDocument, FolioExtension } from "@futelab/folio-core";
import { describe, expect, it, vi } from "vitest";
import { FolioReader } from "../FolioReader";

describe("FolioReader", () => {
  it("renders Folio JSON without editor controls", () => {
    render(<FolioReader value={sampleFolioDocument} />);

    expect(screen.getByTestId("folio-reader")).toHaveClass("folio-reader");
    expect(screen.getByText("Folio document")).toBeInTheDocument();
    expect(screen.queryByTestId("folio-editor")).not.toBeInTheDocument();
  });

  it("omits unsafe URLs from links and bookmarks", () => {
    const unsafeDocument: FolioDocument = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Unsafe link",
              marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }],
            },
          ],
        },
        {
          type: "bookmark",
          attrs: {
            title: "Unsafe bookmark",
            url: "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
          },
        },
      ],
    };

    render(<FolioReader value={unsafeDocument} />);

    expect(screen.getByText("Unsafe link")).not.toHaveAttribute("href");
    expect(screen.getByText("Unsafe bookmark")).not.toHaveAttribute("href");
  });

  it("omits unsafe image sources while allowing safe image URLs", () => {
    const imageDocument: FolioDocument = {
      type: "doc",
      content: [
        {
          type: "image",
          attrs: {
            alt: "Unsafe image",
            src: "javascript:alert(1)",
          },
        },
        {
          type: "image",
          attrs: {
            alt: "Safe image",
            src: "/images/photo.png",
          },
        },
      ],
    };

    render(<FolioReader value={imageDocument} />);

    expect(screen.getByAltText("Unsafe image")).not.toHaveAttribute("src");
    expect(screen.getByAltText("Safe image")).toHaveAttribute("src", "/images/photo.png");
  });

  it("applies the shared URL policy to obfuscated protocols and active image formats", () => {
    const value = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Obfuscated link",
              marks: [{ type: "link", attrs: { href: "java\nscript:alert(1)" } }],
            },
            {
              type: "text",
              text: "Protocol relative link",
              marks: [{ type: "link", attrs: { href: "//example.com" } }],
            },
            {
              type: "text",
              text: "Contact",
              marks: [{ type: "link", attrs: { href: "mailto:hello@example.com" } }],
            },
          ],
        },
        { type: "image", attrs: { src: "data:image/svg+xml;base64,PHN2Zy8+", alt: "SVG source" } },
        { type: "image", attrs: { src: "data:image/png;base64,YQ==", alt: "Raster source" } },
        { type: "bookmark", attrs: { url: "\\example.com", title: "Backslash bookmark" } },
      ],
    };
    render(<FolioReader value={value} />);
    expect(screen.getByText(/Obfuscated link/)).toHaveTextContent("Protocol relative link");
    expect(screen.queryByRole("link", { name: "Obfuscated link" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Protocol relative link" })).toBeNull();
    expect(screen.getByRole("link", { name: "Contact" })).toHaveAttribute(
      "href",
      "mailto:hello@example.com",
    );
    expect(screen.getByAltText("SVG source")).not.toHaveAttribute("src");
    expect(screen.getByAltText("Raster source")).toHaveAttribute(
      "src",
      "data:image/png;base64,YQ==",
    );
    expect(screen.getByText("Backslash bookmark")).not.toHaveAttribute("href");
  });

  it("keeps untrusted text and captions as text instead of interpreting HTML", () => {
    const { container } = render(
      <FolioReader
        value={{
          type: "doc",
          content: [
            { type: "paragraph", content: [{ type: "text", text: "<script>alert(1)</script>" }] },
            {
              type: "image",
              attrs: { src: "/photo.png", caption: '<img src=x onerror="alert(1)">' },
            },
          ],
        }}
      />,
    );
    expect(screen.getByText("<script>alert(1)</script>")).toBeInTheDocument();
    expect(screen.getByText('<img src=x onerror="alert(1)">')).toBeInTheDocument();
    expect(container.querySelectorAll("img")).toHaveLength(1);
    expect(container.querySelector("script")).toBeNull();
  });

  it("renders default editor nodes and marks without dropping content", () => {
    const richDocument: FolioDocument = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Struck", marks: [{ type: "strike" }] },
            { type: "hardBreak" },
            {
              type: "text",
              text: "Highlighted",
              marks: [{ type: "highlight", attrs: { color: "#fff3bf" } }],
            },
            {
              type: "text",
              text: "Underlined",
              marks: [{ type: "underline" }],
            },
          ],
        },
        {
          type: "taskList",
          content: [
            {
              type: "taskItem",
              attrs: { checked: true },
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Done task" }],
                },
              ],
            },
          ],
        },
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                {
                  type: "tableHeader",
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "Column" }],
                    },
                  ],
                },
                {
                  type: "tableCell",
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "Value" }],
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          type: "details",
          attrs: { open: true },
          content: [
            {
              type: "detailsSummary",
              content: [{ type: "text", text: "Toggle title" }],
            },
            {
              type: "detailsContent",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Toggle body" }],
                },
              ],
            },
          ],
        },
      ],
    };

    const onError = vi.fn();
    const { container } = render(<FolioReader onError={onError} value={richDocument} />);
    expect(onError.mock.calls).toEqual([]);

    expect(screen.getByText("Struck").tagName.toLowerCase()).toBe("del");
    expect(container.querySelector("br")).toBeInTheDocument();
    expect(screen.getByText("Highlighted").tagName.toLowerCase()).toBe("mark");
    expect(screen.getByText("Underlined").tagName.toLowerCase()).toBe("u");
    expect(screen.getByRole("checkbox", { name: "Done task" })).toBeChecked();
    expect(screen.getByRole("columnheader", { name: "Column" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Value" })).toBeInTheDocument();
    expect(screen.getByText("Toggle title").closest("summary")).toBeInTheDocument();
    expect(screen.getByText("Toggle body")).toBeInTheDocument();
  });

  it("renders details closed when open state was not persisted", () => {
    const document: FolioDocument = {
      type: "doc",
      content: [
        {
          type: "details",
          content: [
            {
              type: "detailsSummary",
              content: [{ type: "text", text: "Collapsed title" }],
            },
            {
              type: "detailsContent",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Collapsed body" }],
                },
              ],
            },
          ],
        },
      ],
    };

    render(<FolioReader value={document} />);

    expect(screen.getByText("Collapsed title").closest("details")).not.toHaveAttribute("open");
  });

  it("preserves ordered-list numbering, merged cells, code language, image captions and mentions", () => {
    const document: FolioDocument = {
      type: "doc",
      content: [
        {
          type: "orderedList",
          attrs: { start: 7 },
          content: [
            {
              type: "listItem",
              content: [{ type: "paragraph", content: [{ type: "text", text: "Seventh" }] }],
            },
          ],
        },
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                {
                  type: "tableHeader",
                  attrs: { colspan: 2, rowspan: 2, colwidth: [120, 180] },
                  content: [
                    { type: "paragraph", content: [{ type: "text", text: "Merged header" }] },
                  ],
                },
              ],
            },
            {
              type: "tableRow",
              content: [
                {
                  type: "tableCell",
                  attrs: { colspan: 2, colwidth: [100, 0] },
                  content: [
                    { type: "paragraph", content: [{ type: "text", text: "Partial width" }] },
                  ],
                },
              ],
            },
          ],
        },
        {
          type: "codeBlock",
          attrs: { language: "typescript" },
          content: [{ type: "text", text: "const count = 1;" }],
        },
        { type: "image", attrs: { src: "/photo.png", alt: "Photo", caption: "Photo caption" } },
        {
          type: "paragraph",
          content: [{ type: "mention", attrs: { id: "alice", label: "Alice" } }],
        },
      ],
    };
    const { container } = render(<FolioReader value={document} />);

    expect(screen.getByText("Seventh").closest("ol")).toHaveAttribute("start", "7");
    expect(screen.getByRole("columnheader", { name: "Merged header" })).toHaveAttribute(
      "colspan",
      "2",
    );
    expect(screen.getByRole("columnheader", { name: "Merged header" })).toHaveAttribute(
      "rowspan",
      "2",
    );
    expect(screen.getByRole("columnheader", { name: "Merged header" })).toHaveAttribute(
      "data-colwidth",
      "120,180",
    );
    expect(screen.getByRole("columnheader", { name: "Merged header" })).toHaveStyle({
      width: "300px",
    });
    expect(screen.getByRole("cell", { name: "Partial width" })).toHaveAttribute(
      "data-colwidth",
      "100,0",
    );
    expect(screen.getByRole("cell", { name: "Partial width" })).toHaveStyle({ minWidth: "100px" });
    expect(container.querySelector("code.language-typescript")).toHaveTextContent(
      "const count = 1;",
    );
    expect(screen.getByText("Photo caption").tagName).toBe("FIGCAPTION");
    expect(screen.getByText("@Alice")).toHaveAttribute("data-id", "alice");
  });

  it("preserves zero and negative list starts", () => {
    const { container } = render(
      <FolioReader
        value={{
          type: "doc",
          content: [0, -3].map((start) => ({
            type: "orderedList",
            attrs: { start },
            content: [
              {
                type: "listItem",
                content: [{ type: "paragraph", content: [{ type: "text", text: String(start) }] }],
              },
            ],
          })),
        }}
      />,
    );
    expect(
      Array.from(container.querySelectorAll("ol"), (list) => list.getAttribute("start")),
    ).toEqual(["0", "-3"]);
  });

  it("keeps repeated headings and table-of-contents anchors unique across reader instances", () => {
    const document: FolioDocument = {
      type: "doc",
      content: [
        { type: "tableOfContents" },
        { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Introduction" }] },
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Introduction" }] },
        { type: "heading", attrs: { level: 3 }, content: [{ type: "text", text: "中文标题" }] },
      ],
    };
    const { container } = render(
      <>
        <FolioReader value={document} />
        <FolioReader value={document} />
      </>,
    );
    const headingIds = Array.from(
      container.querySelectorAll("h1, h2, h3"),
      (heading) => heading.id,
    );
    expect(new Set(headingIds).size).toBe(6);
    for (const reader of container.querySelectorAll("article")) {
      const localIds = new Set(
        Array.from(reader.querySelectorAll("h1, h2, h3"), (heading) => heading.id),
      );
      for (const link of reader.querySelectorAll("nav a"))
        expect(localIds.has(link.getAttribute("href")!.slice(1))).toBe(true);
    }
  });

  it("uses an explicit heading prefix and persisted table-of-contents ids", () => {
    const { container } = render(
      <FolioReader
        headingIdPrefix="article"
        value={{
          type: "doc",
          content: [
            { type: "tableOfContents" },
            {
              type: "heading",
              attrs: { level: 1, "data-toc-id": "persisted-heading" },
              content: [{ type: "text", text: "Title" }],
            },
          ],
        }}
      />,
    );
    expect(screen.getByRole("heading", { name: "Title" })).toHaveAttribute(
      "id",
      "article-persisted-heading",
    );
    expect(container.querySelector("nav a")).toHaveAttribute("href", "#article-persisted-heading");
  });

  it.each([
    null,
    { type: "doc", content: "invalid" },
    { type: "doc", content: [null] },
    { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: {} }] }] },
    { type: "doc", content: [{ type: "image", attrs: { src: { nested: "bad" } } }] },
  ])("shows a diagnostic instead of throwing for malformed document %j", (value) => {
    const onError = vi.fn();
    render(<FolioReader onError={onError} value={value} />);
    expect(screen.getByRole("status")).toHaveTextContent("content is invalid");
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ code: "invalid-document", validationIssues: expect.any(Array) }),
    );
  });

  it("rejects cyclic content and excessive document depth before traversing it", () => {
    const cyclic: Record<string, unknown> = { type: "doc" };
    cyclic.content = [cyclic];
    const onError = vi.fn();
    const { rerender } = render(<FolioReader onError={onError} value={cyclic} />);
    expect(screen.getByRole("status")).toHaveTextContent("content is invalid");
    let nested: Record<string, unknown> = { type: "paragraph" };
    for (let index = 0; index < 80; index += 1) nested = { type: "blockquote", content: [nested] };
    rerender(<FolioReader onError={onError} value={{ type: "doc", content: [nested] }} />);
    expect(onError).toHaveBeenLastCalledWith(
      expect.objectContaining({
        validationIssues: expect.arrayContaining([
          expect.objectContaining({ code: "depth_limit" }),
        ]),
      }),
    );
  });

  it("reports unknown atoms and marks visibly while preserving known text", () => {
    const onError = vi.fn();
    render(
      <FolioReader
        onError={onError}
        value={{
          type: "doc",
          content: [
            { type: "futureWidget", attrs: { id: "widget" } },
            {
              type: "paragraph",
              content: [{ type: "text", text: "Readable text", marks: [{ type: "futureStyle" }] }],
            },
          ],
        }}
      />,
    );
    expect(screen.getByText("Unsupported content: futureWidget.")).toBeInTheDocument();
    expect(screen.getByText("Readable text")).toBeInTheDocument();
    expect(screen.getByText("Unsupported formatting: futureStyle.")).toBeInTheDocument();
    expect(onError.mock.calls.map(([issue]) => issue.code)).toEqual([
      "unknown-node",
      "unknown-mark",
    ]);
  });

  it("connects extension node and mark renderers with rendered children and stable paths", () => {
    const extension: FolioExtension = {
      name: "reader-custom",
      renderers: [
        {
          type: "customBox",
          render: (_node, context) => (
            <section data-path={context.path}>{context.children as ReactNode}</section>
          ),
        },
        {
          type: "customMark",
          kind: "mark",
          render: (_mark, context) => (
            <small data-mark-path={context.path}>{context.children as ReactNode}</small>
          ),
        },
      ],
    };
    const { container } = render(
      <FolioReader
        extensions={[extension]}
        value={{
          type: "doc",
          content: [
            {
              type: "customBox",
              content: [
                {
                  type: "paragraph",
                  content: [
                    { type: "text", text: "Custom content", marks: [{ type: "customMark" }] },
                  ],
                },
              ],
            },
          ],
        }}
      />,
    );
    expect(container.querySelector("section[data-path='0-0'] small")).toHaveTextContent(
      "Custom content",
    );
    expect(screen.getByText("Custom content")).toHaveAttribute("data-mark-path", "0-0-0-0-mark-0");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("reports conflicting extensions and throwing renderers without dropping their children", () => {
    const extension: FolioExtension = {
      name: "custom",
      renderers: [
        {
          type: "customBox",
          render: () => {
            throw new Error("Broken renderer");
          },
        },
      ],
    };
    const onError = vi.fn();
    const document = {
      type: "doc",
      content: [
        {
          type: "customBox",
          content: [{ type: "paragraph", content: [{ type: "text", text: "Preserved child" }] }],
        },
      ],
    };
    const { rerender } = render(
      <FolioReader extensions={[extension]} onError={onError} value={document} />,
    );
    expect(screen.getByText("Preserved child")).toBeInTheDocument();
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: "renderer-error" }));
    rerender(
      <FolioReader extensions={[extension, extension]} onError={onError} value={document} />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("extensions conflict");
  });

  it("allows applications to customize an invalid-document fallback", () => {
    render(
      <FolioReader
        renderError={(issue) => (
          <p data-testid="custom-fallback">Saved content unavailable ({issue.code})</p>
        )}
        value={{ type: "doc", content: false }}
      />,
    );
    expect(screen.getByTestId("custom-fallback")).toHaveTextContent(
      "Saved content unavailable (invalid-document)",
    );
  });

  it("bounds repeated table-of-contents rendering and reports truncation once", () => {
    const content = [
      ...Array.from({ length: 5 }, () => ({ type: "tableOfContents" })),
      ...Array.from({ length: 100 }, (_, index) => ({
        type: "heading",
        attrs: { level: 2 },
        content: [{ type: "text", text: `Heading ${index}` }],
      })),
    ];
    const onError = vi.fn();
    const { container } = render(
      <FolioReader maxRenderedNodes={30} onError={onError} value={{ type: "doc", content }} />,
    );
    expect(container.querySelectorAll("nav a").length).toBeLessThanOrEqual(30);
    expect(screen.getByRole("status")).toHaveTextContent("render limit");
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("reserves the rendering budget for document content before expanding repeated directories", () => {
    const content = [
      ...Array.from({ length: 5 }, () => ({ type: "tableOfContents" })),
      ...Array.from({ length: 100 }, (_, index) => ({
        type: "heading",
        attrs: { level: 2 },
        content: [{ type: "text", text: `Heading ${index}` }],
      })),
    ];
    const { container } = render(
      <FolioReader maxRenderedNodes={250} value={{ type: "doc", content }} />,
    );
    expect(container.querySelectorAll("h2")).toHaveLength(100);
    expect(container.querySelectorAll("nav a")).toHaveLength(44);
    expect(screen.getByRole("status")).toHaveTextContent("render limit");
  });
});
