import { Editor } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { createDefaultTiptapExtensions } from "../extensions/defaultExtensions";

describe("default Tiptap extensions", () => {
  it("supports underline commands used by the default toolbar", () => {
    const editor = new Editor({
      extensions: createDefaultTiptapExtensions(),
      content: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Underline me" }],
          },
        ],
      },
    });

    editor.commands.setTextSelection({ from: 1, to: 13 });

    expect(editor.commands.toggleUnderline()).toBe(true);
    expect(editor.getJSON().content?.[0]?.content?.[0]?.marks).toEqual([
      { type: "underline" },
    ]);

    editor.destroy();
  });
});
