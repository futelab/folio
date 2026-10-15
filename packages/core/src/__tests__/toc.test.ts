import { Editor } from "@tiptap/core";
import { describe, expect, it, vi } from "vitest";
import { createDefaultTiptapExtensions } from "../extensions/defaultExtensions";
import type { FolioDocument } from "../document";

const heading = (text: string) => ({
  type: "heading",
  attrs: { level: 2, id: text, "data-toc-id": text },
  content: [{ type: "text", text }],
});
const content = (...nodes: NonNullable<FolioDocument["content"]>): FolioDocument => ({
  type: "doc",
  content: nodes,
});

function mount(document: FolioDocument, limit?: number) {
  const element = globalThis.document.createElement("div");
  globalThis.document.body.appendChild(element);
  const editor = new Editor({
    element,
    extensions: createDefaultTiptapExtensions({ locale: "zh-CN", tableOfContentsLimit: limit }),
    content: document,
  });
  return {
    editor,
    element,
    close: () => {
      editor.destroy();
      element.remove();
    },
  };
}

describe("live editor table of contents", () => {
  it("shows localized heading links and updates after title edits without storing derived UI in JSON", () => {
    const { editor, element, close } = mount(
      content({ type: "tableOfContents" }, heading("First"), heading("Second")),
    );
    try {
      const nav = element.querySelector("nav[data-folio-toc]")!;
      expect(nav.getAttribute("aria-label")).toBe("目录");
      expect(Array.from(nav.querySelectorAll("a"), (link) => link.textContent)).toEqual([
        "First",
        "Second",
      ]);
      expect(editor.getJSON().content?.[0]).toEqual({ type: "tableOfContents" });
      editor.commands.insertContentAt({ from: 2, to: 7 }, "Edited");
      expect(Array.from(nav.querySelectorAll("a"), (link) => link.textContent)).toEqual([
        "Edited",
        "Second",
      ]);
      expect(editor.getJSON().content?.[0]).toEqual({ type: "tableOfContents" });
    } finally {
      close();
    }
  });

  it("navigates and scrolls in editable and read-only editors using selection-only transactions", () => {
    const { editor, element, close } = mount(
      content({ type: "tableOfContents" }, heading("Target"), { type: "paragraph" }),
    );
    try {
      const target = element.querySelector("h2")! as HTMLElement;
      const scroll = vi.fn();
      target.scrollIntoView = scroll;
      const before = editor.getJSON();
      const link = element.querySelector("nav a")!;
      link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      expect(editor.state.selection.from).toBe(2);
      expect(scroll).toHaveBeenCalledOnce();
      expect(editor.getJSON()).toEqual(before);
      editor.setEditable(false, false);
      editor.commands.setNodeSelection(0);
      link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      expect(editor.state.selection.from).toBe(2);
      expect(scroll).toHaveBeenCalledTimes(2);
      expect(editor.getJSON()).toEqual(before);
    } finally {
      close();
    }
  });

  it("shows an empty hint and bounds visible entries with a localized remaining count", () => {
    const { editor, element, close } = mount(
      content({ type: "tableOfContents" }, { type: "paragraph" }),
      2,
    );
    try {
      expect(element.querySelector(".folio-toc__empty")?.textContent).toBe(
        "添加标题后将在此显示目录。",
      );
      editor.commands.setContent(
        content({ type: "tableOfContents" }, heading("One"), heading("Two"), heading("Three")),
      );
      expect(element.querySelectorAll("nav a")).toHaveLength(2);
      expect(element.querySelector(".folio-toc__more")?.textContent).toBe("另有 1 个标题");
    } finally {
      close();
    }
    const bounded = mount(
      content(
        { type: "tableOfContents" },
        ...Array.from({ length: 501 }, (_, index) => heading(`Heading ${index}`)),
      ),
      100_000,
    );
    try {
      expect(bounded.element.querySelectorAll("nav a")).toHaveLength(500);
      expect(bounded.element.querySelector(".folio-toc__more")?.textContent).toBe("另有 1 个标题");
    } finally {
      bounded.close();
    }
  });

  it("ignores UI-only mutations and removes editor/DOM listeners when the directory is deleted", async () => {
    const { editor, element, close } = mount(
      content({ type: "tableOfContents" }, heading("Stable"), { type: "paragraph" }),
    );
    try {
      const nav = element.querySelector("nav")!;
      const link = nav.querySelector("a")!;
      const before = editor.getJSON();
      nav.querySelector(".folio-toc__title")!.textContent = "Derived UI";
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(editor.getJSON()).toEqual(before);
      const off = vi.spyOn(editor, "off");
      editor.commands.deleteRange({ from: 0, to: 1 });
      expect(off).toHaveBeenCalledWith("transaction", expect.any(Function));
      const event = new MouseEvent("click", { bubbles: true, cancelable: true });
      link.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
      off.mockRestore();
    } finally {
      close();
    }
  });
});
