// @vitest-environment node
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { fromHTML, toHTML, toMarkdown, validateFolioDocument } from "@futelab/folio-core";
import type { FolioDocument } from "@futelab/folio-core";
import { FolioReader } from "../FolioReader";

const value: FolioDocument = {
  type: "doc",
  content: [
    {
      type: "columns",
      attrs: { folioBlockId: "layout" },
      content: [
        {
          type: "column",
          attrs: { width: 60, folioBlockId: "left" },
          content: [{ type: "paragraph", content: [{ type: "text", text: "Left column" }] }],
        },
        {
          type: "column",
          attrs: { width: 40 },
          content: [
            {
              type: "callout",
              attrs: { tone: "warning" },
              content: [
                { type: "paragraph", content: [{ type: "text", text: "Right nested content" }] },
              ],
            },
          ],
        },
      ],
    },
  ],
};
describe("portable column layouts", () => {
  it("renders widths and complete nested contents in a genuine Node SSR environment", () => {
    expect(typeof window).toBe("undefined");
    expect(typeof document).toBe("undefined");
    const html = renderToStaticMarkup(<FolioReader value={value} headingIdPrefix="test" />);
    expect(html).toContain('data-folio-columns=""');
    expect(html).toContain('data-width="60"');
    expect(html).toContain("--folio-column-width:40");
    expect(html).toContain("Left column");
    expect(html).toContain("Right nested content");
    expect(html).toContain('data-folio-block-id="left"');
    expect(html).not.toContain("folio-reader-error");
  });
  it("round-trips HTML with widths, structure and linked block identities intact", () => {
    const html = toHTML(value);
    const parsed = fromHTML(html);
    expect(parsed.content![0]!.type).toBe("columns");
    expect(parsed.content![0]!.attrs!.folioBlockId).toBe("layout");
    expect(parsed.content![0]!.content!.map((node) => node.attrs!.width)).toEqual([60, 40]);
    expect(toHTML(parsed)).toBe(html);
  });
  it("rejects lossy Markdown instead of flattening the columns", () => {
    expect(() => toMarkdown(value)).toThrow(/columns/);
  });
  it.each([0, -1, 101, "50", null])("rejects invalid column width %s", (width) => {
    const invalid = JSON.parse(JSON.stringify(value)) as FolioDocument;
    invalid.content![0]!.content![0]!.attrs!.width = width;
    expect(validateFolioDocument(invalid).valid).toBe(false);
  });
  it("rejects unsupported column counts and standalone structural columns", () => {
    const invalid = JSON.parse(JSON.stringify(value)) as FolioDocument;
    invalid.content![0]!.content!.pop();
    expect(validateFolioDocument(invalid).valid).toBe(false);
    expect(
      validateFolioDocument({ type: "doc", content: [value.content![0]!.content![0]] }).valid,
    ).toBe(false);
    expect(() =>
      fromHTML(
        '<div data-folio-columns><div data-folio-column data-width="NaN"><p>Bad</p></div><div data-folio-column><p>Other</p></div></div>',
      ),
    ).toThrow();
  });
});
