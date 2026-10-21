import { Editor } from "@tiptap/core";
import type { JSONContent } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";
import { createDefaultFolioCommands } from "../commands/defaultCommands";
import { createDefaultTiptapExtensions } from "../extensions/defaultExtensions";

const editors: Editor[] = [];
const command = createDefaultFolioCommands().find((item) => item.name === "paragraph")!;

function createEditor(content: JSONContent[]) {
  const editor = new Editor({
    extensions: createDefaultTiptapExtensions(),
    content: { type: "doc", content },
  });
  editors.push(editor);
  return editor;
}

afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
});

describe("Text block command", () => {
  it("accepts an empty paragraph without creating a history entry", () => {
    const editor = createEditor([{ type: "paragraph" }]);
    const before = editor.getJSON();
    expect(command.action({ editor })).toBe(true);
    expect(command.action({ editor })).toBe(true);
    expect(editor.getJSON()).toEqual(before);
    expect(editor.can().undo()).toBe(false);
  });

  it("preserves marked text, block IDs and a cross-paragraph text selection", () => {
    const editor = createEditor([
      {
        type: "paragraph",
        attrs: { folioBlockId: "first" },
        content: [{ type: "text", text: "First", marks: [{ type: "bold" }] }],
      },
      {
        type: "paragraph",
        attrs: { folioBlockId: "second" },
        content: [{ type: "text", text: "Second" }],
      },
    ]);
    editor.commands.setTextSelection({ from: 2, to: editor.state.doc.content.size - 2 });
    const before = editor.getJSON();
    const selection = editor.state.selection.toJSON();
    expect(command.action({ editor })).toBe(true);
    expect(editor.getJSON()).toEqual(before);
    expect(editor.state.selection.toJSON()).toEqual(selection);
  });

  it("still converts a heading and retains its text", () => {
    const editor = createEditor([
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Heading" }] },
    ]);
    expect(command.action({ editor })).toBe(true);
    expect(editor.state.doc.firstChild?.type.name).toBe("paragraph");
    expect(editor.getText()).toBe("Heading");
  });

  it("does not consider an already-plain block writable in a read-only or destroyed editor", () => {
    const editor = createEditor([{ type: "paragraph" }]);
    editor.setEditable(false);
    expect(command.action({ editor })).toBe(false);
    editor.destroy();
    expect(command.action({ editor })).toBe(false);
  });
});
