// @vitest-environment node
import { describe, expect, it } from "vitest";
import { fromMarkdown, toMarkdown, fromHTML, toHTML } from "../index";

describe("portable Node serialization", () => {
  it("builds the TOC schema and exports real directory links without accessing browser DOM", () => {
    expect(typeof document).toBe("undefined");
    expect(
      toHTML({
        type: "doc",
        content: [
          { type: "tableOfContents" },
          {
            type: "heading",
            attrs: { level: 1 },
            content: [{ type: "text", text: "Server heading" }],
          },
        ],
      }),
    ).toContain('href="#server-heading"');
  });
  it.each([
    "<strong>HTML</strong>",
    '<div data-reference="book-1">Reference</div>',
    "<external-card>Unknown</external-card>",
    "<!-- HTML comment -->",
    "<script>alert(1)</script>",
  ])("rejects raw Markdown HTML consistently without a browser: %s", (markdown) => {
    expect(typeof window).toBe("undefined");
    expect(() => fromMarkdown(markdown)).toThrow(/Raw HTML.*fromHTML/);
  });

  it("accepts fenced/inline HTML code and autolinks without confusing them with raw HTML", () => {
    const markdown =
      '`<b>code</b>`\n\n```html\n<div data-id="code">Example</div>\n```\n\n<https://example.com> and <person@example.com>';
    const document = fromMarkdown(markdown);
    expect(toMarkdown(document)).toContain("https://example.com");
    expect(toHTML(fromHTML("<p>Use explicit HTML import</p>"))).toContain(
      "Use explicit HTML import",
    );
  });
});
