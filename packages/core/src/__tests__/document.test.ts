import { describe, expect, it } from "vitest";
import {
  createEmptyFolioDocument,
  isFolioDocument,
  sampleFolioDocument,
} from "../index";

describe("Folio document model", () => {
  it("creates an empty JSON-first document", () => {
    expect(createEmptyFolioDocument()).toEqual({
      type: "doc",
      content: [{ type: "paragraph" }],
    });
  });

  it("recognizes valid document roots", () => {
    expect(isFolioDocument(sampleFolioDocument)).toBe(true);
    expect(isFolioDocument({ type: "paragraph" })).toBe(false);
    expect(isFolioDocument(null)).toBe(false);
  });
});
