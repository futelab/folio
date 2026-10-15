// @vitest-environment node
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FolioReader } from "../FolioReader";

describe("FolioReader server rendering", () => {
  it("renders without window or document and isolates anchors across sibling readers", () => {
    expect(typeof window).toBe("undefined");
    expect(typeof document).toBe("undefined");
    const value = {
      type: "doc",
      content: [
        { type: "tableOfContents" },
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Server title" }] },
        { type: "paragraph", content: [{ type: "text", text: "Server content" }] },
      ],
    };
    const html = renderToString(
      <>
        <FolioReader value={value} />
        <FolioReader value={value} />
      </>,
    );
    const ids = Array.from(html.matchAll(/<h2 id="([^"]+)"/g), (match) => match[1]);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    for (const id of ids) expect(html).toContain(`href="#${id}"`);
    expect(html).toContain("Server content");
    expect(html).not.toContain("folio-reader-error");
  });

  it("renders malformed stored data as a safe fallback on the server", () => {
    const html = renderToString(<FolioReader value={{ type: "doc", content: [undefined] }} />);
    expect(html).toContain('data-folio-reader-error="invalid-document"');
  });

  it("bounds deeply nested unknown marks without losing their text", () => {
    const value = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Preserved text",
              marks: Array.from({ length: 2_000 }, () => ({ type: "futureStyle" })),
            },
          ],
        },
      ],
    };
    const html = renderToString(<FolioReader onError={() => undefined} value={value} />);
    expect(html).toContain("Preserved text");
    expect(html).toContain('data-folio-reader-error="render-limit"');
    expect(Array.from(html.matchAll(/data-folio-unknown-mark/g))).toHaveLength(64);
  });

  it("renders a substantial document and rejects a document beyond configured limits", () => {
    const value = {
      type: "doc",
      content: Array.from({ length: 3_000 }, (_, index) => ({
        type: "paragraph",
        content: [{ type: "text", text: `Paragraph ${index}` }],
      })),
    };
    const html = renderToString(<FolioReader value={value} />);
    expect(Array.from(html.matchAll(/<p>/g))).toHaveLength(3_000);
    expect(html).toContain("Paragraph 2999");
    const limited = renderToString(<FolioReader limits={{ maxNodes: 50 }} value={value} />);
    expect(limited).toContain('data-folio-reader-error="invalid-document"');
  });
});
