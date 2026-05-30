import { describe, expect, it } from "vitest";
import { createEmptyFolioDocument } from "../core";
import {
  FolioMarkdownSerializationError,
  fromHTML,
  fromMarkdown,
  toHTML,
  toMarkdown,
} from "../serialization";

describe("@futelab/folio public exports", () => {
  it("exposes serialization through an explicit subpath", () => {
    const document = createEmptyFolioDocument();

    expect(toHTML(document)).toContain("<p></p>");
    expect(fromHTML("<p>Round trip</p>").content?.[0]?.type).toBe("paragraph");
    expect(fromMarkdown("# Title").content?.[0]?.type).toBe("heading");
    expect(toMarkdown(document)).toBe("");
    expect(new FolioMarkdownSerializationError("demo")).toBeInstanceOf(Error);
  });
});
