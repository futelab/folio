// @vitest-environment node
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { fromHTML, toHTML, toMarkdown } from "@futelab/folio-core";
import type { FolioDocument } from "@futelab/folio-core";
import { FolioReader } from "../FolioReader";

const value: FolioDocument = {
  type: "doc",
  content: [
    {
      type: "heading",
      attrs: { level: 2, id: "authored", "data-toc-id": "authored", folioBlockId: "stable" },
      content: [{ type: "text", text: "Linked heading" }],
    },
    {
      type: "callout",
      attrs: { tone: "warning", folioBlockId: "container" },
      content: [
        {
          type: "paragraph",
          attrs: { folioBlockId: "nested" },
          content: [
            {
              type: "text",
              text: "Existing stable link",
              marks: [{ type: "link", attrs: { href: "#folio-block-stable" } }],
            },
          ],
        },
      ],
    },
  ],
};
describe("portable persistent block anchors", () => {
  it("renders both heading and stable aliases in Node SSR with scoped reader links", () => {
    expect(typeof window).toBe("undefined");
    expect(typeof document).toBe("undefined");
    const html = renderToStaticMarkup(<FolioReader value={value} headingIdPrefix="document-a" />);
    expect(html).toContain('id="document-a-authored"');
    expect(html).toContain('id="document-a-folio-block-stable" data-folio-block-anchor=""');
    expect(html).toContain('href="#document-a-folio-block-stable"');
    expect(html).toContain('id="document-a-folio-block-container"');
    expect(html).toContain('id="document-a-folio-block-nested"');
    expect(html).not.toContain("folio-reader-error");
  });
  it("round-trips HTML identities, authored heading IDs and alias targets without adding empty blocks", () => {
    const html = toHTML(value);
    expect(html).toContain('id="folio-block-stable" data-folio-block-anchor=""');
    expect(html).toContain('id="authored"');
    const parsed = fromHTML(html);
    expect(parsed.content).toHaveLength(2);
    expect(parsed.content![0]!.attrs).toMatchObject({
      id: "authored",
      "data-toc-id": "authored",
      folioBlockId: "stable",
    });
    expect(parsed.content![1]!.attrs!.folioBlockId).toBe("container");
    expect(parsed.content![1]!.content![0]!.attrs!.folioBlockId).toBe("nested");
    expect(toHTML(parsed)).toBe(html);
  });
  it("refuses Markdown when it cannot preserve linked block identities", () => {
    expect(() => toMarkdown(value)).toThrow();
  });
});
