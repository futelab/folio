import { useEffect } from "react";
import { EditorContent } from "@tiptap/react";
import { Node, mergeAttributes, type Editor } from "@tiptap/core";
import { AllSelection } from "@tiptap/pm/state";
import { act, render, waitFor } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { FolioDocument } from "@futelab/folio-core/browser";
import { useFolioEditor, type UseFolioEditorOptions } from "../useFolioEditor";
import { copyFolioSelection, createFolioClipboardPayload, folioClipboardMimeType } from "./index";
import { BlockSelection, createBlockSelectionPlugin } from "../blocks/blockSelection";

beforeAll(() => {
  if (!Range.prototype.getBoundingClientRect)
    Range.prototype.getBoundingClientRect = () => new DOMRect(0, 0, 20, 20);
  if (!Range.prototype.getClientRects)
    Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
});

const paragraph = (text: string) => ({
  type: "paragraph",
  content: text ? [{ type: "text", text }] : [],
});
const doc = (text = ""): FolioDocument => ({ type: "doc", content: [paragraph(text)] });

class Clipboard {
  values = new Map<string, string>();
  constructor(
    values: Record<string, string> = {},
    readonly files: File[] = [],
  ) {
    for (const [type, value] of Object.entries(values)) this.values.set(type, value);
  }
  getData(type: string) {
    return this.values.get(type) ?? "";
  }
  setData(type: string, value: string) {
    this.values.set(type, value);
  }
  clearData() {
    this.values.clear();
  }
}

function clipboardEvent(editor: Editor, type: "paste" | "copy" | "cut", clipboard: Clipboard) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", { value: clipboard });
  act(() => {
    editor.view.dom.dispatchEvent(event);
  });
  return event;
}

async function mountEditor(options: UseFolioEditorOptions = {}) {
  const reference: { current: Editor | null } = { current: null };
  function Harness(props: UseFolioEditorOptions) {
    const editor = useFolioEditor(props);
    useEffect(() => {
      reference.current = editor;
    }, [editor]);
    return <EditorContent editor={editor} />;
  }
  const view = render(<Harness {...options} />);
  await waitFor(() => expect(reference.current).not.toBeNull());
  return {
    editor: reference.current!,
    reference,
    rerender: (next: UseFolioEditorOptions) => view.rerender(<Harness {...next} />),
    unmount: view.unmount,
  };
}

function selectAll(editor: Editor) {
  act(() => {
    editor.view.dispatch(editor.state.tr.setSelection(new AllSelection(editor.state.doc)));
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((success, failure) => {
    resolve = success;
    reject = failure;
  });
  return { promise, resolve, reject };
}

describe("native Folio clipboard", () => {
  it.each(["copy", "cut"] as const)(
    "copies a reversed BlockSelection as a complete group through native %s",
    async (operation) => {
      const document: FolioDocument = {
        type: "doc",
        content: [
          paragraph("Before"),
          {
            type: "callout",
            attrs: { tone: "warning", folioBlockId: "callout-block" },
            content: [paragraph("Nested content")],
          },
          { type: "image", attrs: { src: "/image.png", alt: "Alt", caption: "Caption" } },
          paragraph("After"),
        ],
      };
      const source = await mountEditor({ defaultValue: document });
      const editor = source.editor;
      act(() => {
        editor.registerPlugin(createBlockSelectionPlugin());
        const starts: number[] = [];
        editor.state.doc.forEach((_node, pos) => starts.push(pos));
        editor.view.dispatch(
          editor.state.tr.setSelection(
            BlockSelection.create(editor.state.doc, starts[2]!, starts[1]!),
          ),
        );
      });
      const original = editor.getJSON();
      const clipboard = new Clipboard();
      clipboardEvent(editor, operation, clipboard);
      const payload = JSON.parse(clipboard.getData(folioClipboardMimeType)) as {
        openStart: number;
        openEnd: number;
        document: FolioDocument;
      };
      expect([payload.openStart, payload.openEnd]).toEqual([0, 0]);
      expect(payload.document.content).toEqual(original.content!.slice(1, 3));
      const target = await mountEditor();
      selectAll(target.editor);
      clipboardEvent(target.editor, "paste", clipboard);
      expect(target.editor.getJSON().content!.slice(0, 2)).toEqual(original.content!.slice(1, 3));
      if (operation === "copy") expect(editor.getJSON()).toEqual(original);
      else {
        expect(editor.getJSON().content).toEqual([original.content![0], original.content![3]]);
        act(() => {
          editor.commands.undo();
        });
        expect(editor.getJSON()).toEqual(original);
      }
    },
  );
  it("copies and pastes composite blocks and metadata through the internal MIME", async () => {
    const document: FolioDocument = {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: {
            level: 2,
            id: "chapter",
            "data-toc-id": "chapter",
            folioBlockId: "chapter-block",
          },
          content: [{ type: "text", text: "Chapter", marks: [{ type: "bold" }] }],
        },
        {
          type: "taskList",
          content: [{ type: "taskItem", attrs: { checked: true }, content: [paragraph("Task")] }],
        },
        {
          type: "details",
          attrs: { open: true },
          content: [
            { type: "detailsSummary", content: [{ type: "text", text: "Summary" }] },
            { type: "detailsContent", content: [paragraph("Details body")] },
          ],
        },
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                { type: "tableHeader", content: [paragraph("Header")] },
                { type: "tableCell", content: [paragraph("Cell")] },
              ],
            },
          ],
        },
        {
          type: "image",
          attrs: { src: "https://example.com/p.png", alt: "Alt", caption: "Caption" },
        },
        {
          type: "bookmark",
          attrs: { url: "https://example.com", title: "Example", description: "Description" },
        },
        {
          type: "paragraph",
          content: [{ type: "mention", attrs: { id: "person", label: "Person" } }],
        },
      ],
    };
    const source = await mountEditor({ defaultValue: document });
    selectAll(source.editor);
    const original = source.editor.getJSON();
    const clipboard = new Clipboard();
    expect(clipboardEvent(source.editor, "copy", clipboard).defaultPrevented).toBe(true);
    expect(clipboard.getData(folioClipboardMimeType)).toContain('"folio-clipboard"');
    expect(clipboard.getData("text/html")).toContain("figcaption");
    const target = await mountEditor();
    selectAll(target.editor);
    clipboardEvent(target.editor, "paste", clipboard);
    expect(target.editor.getJSON()).toEqual(original);
    expect(source.editor.getJSON()).toEqual(original);
  });

  it("regenerates colliding anchors and block IDs without mutating the copied document or mentions", async () => {
    const initial: FolioDocument = {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 2, id: "anchor", "data-toc-id": "anchor", folioBlockId: "block-a" },
          content: [{ type: "text", text: "Heading" }],
        },
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Anchor link",
              marks: [{ type: "link", attrs: { href: "#anchor" } }],
            },
            {
              type: "text",
              text: "Block link",
              marks: [{ type: "link", attrs: { href: "#folio-block-block-a" } }],
            },
            { type: "mention", attrs: { id: "anchor", label: "Person" } },
          ],
        },
      ],
    };
    const { editor } = await mountEditor({ defaultValue: initial });
    selectAll(editor);
    const copied = new Clipboard();
    clipboardEvent(editor, "copy", copied);
    const original = editor.getJSON();
    act(() => {
      editor.commands.setTextSelection(editor.state.doc.content.size - 1);
    });
    clipboardEvent(editor, "paste", copied);
    const headings = editor.getJSON().content!.filter((node) => node.type === "heading");
    expect(headings).toHaveLength(2);
    expect(headings[0]).toEqual(original.content![0]);
    expect(headings[1]!.attrs!.id).not.toBe("anchor");
    expect(headings[1]!.attrs!["data-toc-id"]).toBe(headings[1]!.attrs!.id);
    expect(headings[1]!.attrs!.folioBlockId).not.toBe("block-a");
    const pasted = (editor.getJSON() as FolioDocument).content!.at(-1)!;
    expect(
      pasted.content!.find((node) => node.text === "Anchor link")!.marks![0]!.attrs!.href,
    ).toBe(`#${headings[1]!.attrs!.id}`);
    expect(pasted.content!.find((node) => node.text === "Block link")!.marks![0]!.attrs!.href).toBe(
      `#folio-block-${headings[1]!.attrs!.folioBlockId}`,
    );
    expect(pasted.content!.find((node) => node.type === "mention")!.attrs!.id).toBe("anchor");
  });

  it("cleans Word wrappers while retaining supported rich formatting without a failure diagnostic", async () => {
    const onError = vi.fn();
    const { editor } = await mountEditor({ onError });
    clipboardEvent(
      editor,
      "paste",
      new Clipboard({
        "text/html":
          '<meta charset="utf-8"><style>.MsoNormal{margin:0}</style><p class="MsoNormal"><span style="font-weight:700;mso-bidi-font-weight:normal">Bold from Word</span></p><p><em>Second paragraph</em></p>',
      }),
    );
    expect(editor.getText()).toBe("Bold from Word\n\nSecond paragraph");
    expect(editor.getJSON().content![0]!.content![0]!.marks).toContainEqual({ type: "bold" });
    expect(onError).not.toHaveBeenCalled();
  });

  it("removes active HTML, unsafe URLs and handlers but preserves their readable text", async () => {
    const onError = vi.fn();
    const { editor } = await mountEditor({ onError });
    clipboardEvent(
      editor,
      "paste",
      new Clipboard({
        "text/html":
          '<p onclick="evil()"><a href="javascript:evil()">Keep link text</a><img src="data:image/svg+xml;base64,AAAA" onerror="evil()"></p><script>hidden script</script>',
      }),
    );
    expect(editor.getText()).toContain("Keep link text");
    expect(editor.getText()).not.toContain("hidden script");
    expect(editor.view.dom.querySelector("script,img,a,[onclick],[onerror]")).toBeNull();
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: "unsafe-url" }));
  });

  it("reports unknown HTML semantics while retaining children", async () => {
    const onError = vi.fn();
    const { editor } = await mountEditor({ onError });
    clipboardEvent(
      editor,
      "paste",
      new Clipboard({
        "text/html": "<p>Before <custom-widget>Readable widget</custom-widget> after</p>",
      }),
    );
    expect(editor.getText()).toBe("Before Readable widget after");
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: "content-downgraded" }));
  });

  it("rejects a foreign schema fragment and falls back to readable HTML", async () => {
    const Badge = Node.create({
      name: "badge",
      group: "block",
      atom: true,
      addAttributes: () => ({ label: { default: "Badge" } }),
      parseHTML: () => [{ tag: "div[data-badge]" }],
      renderHTML: ({ node, HTMLAttributes }) => [
        "div",
        mergeAttributes(HTMLAttributes, { "data-badge": "" }),
        String(node.attrs.label),
      ],
    });
    const source = await mountEditor({
      extensions: [{ name: "badge", tiptapExtensions: [Badge] }],
      defaultValue: {
        type: "doc",
        content: [{ type: "badge", attrs: { label: "Custom badge" } }, paragraph("End")],
      },
    });
    selectAll(source.editor);
    const clipboard = new Clipboard();
    clipboardEvent(source.editor, "copy", clipboard);
    const onError = vi.fn();
    const target = await mountEditor({ onError });
    clipboardEvent(target.editor, "paste", clipboard);
    expect(target.editor.getText()).toContain("Custom badge");
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: "invalid-fragment" }));
  });

  it.each([
    "not json",
    JSON.stringify({ format: "folio-clipboard", version: 2 }),
    JSON.stringify({
      format: "folio-clipboard",
      version: 1,
      document: doc("Invalid depth"),
      openStart: 999,
      openEnd: 0,
    }),
  ])("rejects invalid internal data and uses plain text (%s)", async (invalid) => {
    const onError = vi.fn();
    const { editor } = await mountEditor({ onError });
    clipboardEvent(
      editor,
      "paste",
      new Clipboard({ [folioClipboardMimeType]: invalid, "text/plain": "Safe fallback" }),
    );
    expect(editor.getText()).toBe("Safe fallback");
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: "invalid-fragment" }));
  });

  it("supports hook interception, false fallthrough and disabling default paste without recreating the editor", async () => {
    const onPaste = vi.fn(() => true);
    const mounted = await mountEditor({ clipboard: { onPaste } });
    clipboardEvent(mounted.editor, "paste", new Clipboard({ "text/plain": "Intercepted" }));
    expect(mounted.editor.getText()).toBe("");
    mounted.rerender({ clipboard: { onPaste: () => false } });
    expect(mounted.reference.current).toBe(mounted.editor);
    clipboardEvent(mounted.editor, "paste", new Clipboard({ "text/plain": "Allowed" }));
    expect(mounted.editor.getText()).toBe("Allowed");
    mounted.rerender({ clipboard: { defaultPaste: "disabled" } });
    clipboardEvent(mounted.editor, "paste", new Clipboard({ "text/plain": "Blocked" }));
    expect(mounted.editor.getText()).toBe("Allowed");
  });

  it("recovers readable children from an unknown internal node without external fallback data", async () => {
    const onError = vi.fn();
    const { editor } = await mountEditor({ onError });
    clipboardEvent(
      editor,
      "paste",
      new Clipboard({
        [folioClipboardMimeType]: JSON.stringify({
          format: "folio-clipboard",
          version: 1,
          openStart: 0,
          openEnd: 0,
          document: {
            type: "doc",
            content: [{ type: "futurePanel", content: [paragraph("Future readable content")] }],
          },
        }),
      }),
    );
    expect(editor.getText()).toBe("Future readable content");
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: "invalid-fragment" }));
  });

  it("rejects unsafe internal URLs, invalid attrs and duplicate block IDs before insertion", async () => {
    const onError = vi.fn();
    const { editor } = await mountEditor({ onError });
    const invalidDocuments = [
      {
        type: "doc",
        content: [{ type: "bookmark", attrs: { url: "javascript:evil()", title: "Bad" } }],
      },
      { type: "doc", content: [{ type: "image", attrs: { src: { nested: "invalid" } } }] },
      {
        type: "doc",
        content: [
          { ...paragraph("First"), attrs: { folioBlockId: "duplicate" } },
          { ...paragraph("Second"), attrs: { folioBlockId: "duplicate" } },
        ],
      },
    ];
    for (const document of invalidDocuments) {
      selectAll(editor);
      clipboardEvent(
        editor,
        "paste",
        new Clipboard({
          [folioClipboardMimeType]: JSON.stringify({
            format: "folio-clipboard",
            version: 1,
            document,
            openStart: 0,
            openEnd: 0,
          }),
          "text/plain": "Safe text",
        }),
      );
      expect(editor.getText()).toBe("Safe text");
      expect(editor.view.dom.querySelector("img,[data-folio-bookmark]")).toBeNull();
    }
    expect(onError).toHaveBeenCalledTimes(invalidDocuments.length);
  });

  it("does not delete a cut selection when clipboard writing fails", async () => {
    const onError = vi.fn();
    const { editor } = await mountEditor({ defaultValue: doc("Keep selection"), onError });
    selectAll(editor);
    const clipboard = new Clipboard();
    clipboard.setData = () => {
      throw new Error("Clipboard denied");
    };
    clipboardEvent(editor, "cut", clipboard);
    expect(editor.getText()).toBe("Keep selection");
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: "clipboard-error" }));
  });

  it("blocks oversized clipboard text without replacing the current selection", async () => {
    const onError = vi.fn();
    const { editor } = await mountEditor({ defaultValue: doc("Keep document"), onError });
    selectAll(editor);
    clipboardEvent(editor, "paste", new Clipboard({ "text/plain": "x".repeat(2_000_001) }));
    expect(editor.getText()).toBe("Keep document");
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: "size-limit" }));
  });

  it.each(["configured", "keyboard"])(
    "pastes plain text without HTML or inherited marks (%s)",
    async (mode) => {
      const { editor } = await mountEditor({
        clipboard: mode === "configured" ? { defaultPaste: "plain-text" } : undefined,
      });
      act(() => {
        editor.commands.setBold();
      });
      if (mode === "keyboard")
        act(() => {
          editor.view.dom.dispatchEvent(
            new KeyboardEvent("keydown", {
              bubbles: true,
              key: "v",
              ctrlKey: true,
              shiftKey: true,
            }),
          );
        });
      clipboardEvent(
        editor,
        "paste",
        new Clipboard({
          "text/plain": "Plain\nSecond",
          "text/html": "<p><strong>Rich</strong></p>",
        }),
      );
      expect(editor.getText()).toBe("Plain\n\nSecond");
      expect(
        editor
          .getJSON()
          .content!.flatMap((node) => node.content ?? [])
          .every((node) => !node.marks?.length),
      ).toBe(true);
    },
  );

  it("cuts the selection only after copying and keeps parent echoes in the same undo history", async () => {
    const onChange = vi.fn();
    const mounted = await mountEditor({ value: doc("Original"), onChange });
    selectAll(mounted.editor);
    const clipboard = new Clipboard();
    clipboardEvent(mounted.editor, "cut", clipboard);
    expect(clipboard.getData("text/plain")).toBe("Original");
    expect(mounted.editor.getText()).toBe("");
    mounted.rerender({ value: mounted.editor.getJSON() as FolioDocument, onChange });
    expect(mounted.reference.current).toBe(mounted.editor);
    act(() => {
      mounted.editor.commands.undo();
    });
    expect(mounted.editor.getText()).toBe("Original");
  });

  it("allows copy in read-only mode but blocks paste, cut and upload callbacks", async () => {
    const onPaste = vi.fn();
    const uploadImage = vi.fn();
    const { editor } = await mountEditor({
      value: doc("Read only"),
      editable: false,
      clipboard: { onPaste, uploadImage },
    });
    selectAll(editor);
    const clipboard = new Clipboard();
    clipboardEvent(editor, "copy", clipboard);
    expect(clipboard.getData("text/plain")).toBe("Read only");
    clipboardEvent(editor, "cut", clipboard);
    clipboardEvent(
      editor,
      "paste",
      new Clipboard({ "text/plain": "No write" }, [
        new File(["image"], "image.png", { type: "image/png" }),
      ]),
    );
    expect(editor.getText()).toBe("Read only");
    expect(onPaste).not.toHaveBeenCalled();
    expect(uploadImage).not.toHaveBeenCalled();
  });

  it("exposes the same payload and copy handling to a user-gesture block menu", async () => {
    const { editor } = await mountEditor({ defaultValue: doc("Copy via menu") });
    selectAll(editor);
    expect(createFolioClipboardPayload(editor)?.[folioClipboardMimeType]).toBeTruthy();
    const clipboard = new Clipboard();
    const original = Object.getOwnPropertyDescriptor(document, "execCommand");
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: vi.fn(() => {
        clipboardEvent(editor, "copy", clipboard);
        return true;
      }),
    });
    try {
      expect(await copyFolioSelection(editor)).toBe(true);
    } finally {
      if (original) Object.defineProperty(document, "execCommand", original);
      else Reflect.deleteProperty(document, "execCommand");
    }
    expect(clipboard.getData("text/plain")).toBe("Copy via menu");
    expect(clipboard.getData(folioClipboardMimeType)).toBeTruthy();
  });
});

describe("asynchronous pasted images", () => {
  const file = () => new File(["image"], "paste.png", { type: "image/png" });
  it("maps the original insertion bookmark through typing and preserves captions", async () => {
    const upload = deferred<{ src: string; alt: string; caption: string }>();
    const uploadImage = vi.fn(() => upload.promise);
    const { editor } = await mountEditor({
      defaultValue: doc("Before"),
      clipboard: { uploadImage },
    });
    act(() => {
      editor.commands.setTextSelection(7);
    });
    clipboardEvent(editor, "paste", new Clipboard({}, [file()]));
    expect(editor.getJSON().content!.some((node) => node.type === "image")).toBe(false);
    act(() => {
      editor.commands.insertContent(" while uploading");
    });
    await act(async () => {
      upload.resolve({
        src: "https://example.com/image.png",
        alt: "Pasted image",
        caption: "Pasted caption",
      });
      await upload.promise;
    });
    expect(editor.getText()).toContain("Before while uploading");
    expect(editor.getJSON().content!.find((node) => node.type === "image")!.attrs).toMatchObject({
      src: "https://example.com/image.png",
      alt: "Pasted image",
      caption: "Pasted caption",
    });
  });

  it.each(["read-only", "document-switch", "external-replacement", "destroy"])(
    "ignores stale upload completions after %s",
    async (transition) => {
      const upload = deferred<string>();
      const onError = vi.fn();
      const clipboard = { uploadImage: () => upload.promise };
      const options: UseFolioEditorOptions = {
        value: doc("Original"),
        documentId: "a",
        clipboard,
        onError,
      };
      const mounted = await mountEditor(options);
      clipboardEvent(mounted.editor, "paste", new Clipboard({}, [file()]));
      if (transition === "destroy") mounted.unmount();
      else if (transition === "read-only") {
        mounted.rerender({ ...options, editable: false });
        await waitFor(() => expect(mounted.reference.current!.isEditable).toBe(false));
        mounted.rerender({ ...options, editable: true });
        await waitFor(() => expect(mounted.reference.current!.isEditable).toBe(true));
      } else {
        mounted.rerender({
          ...options,
          value: doc("Replacement"),
          documentId: transition === "document-switch" ? "b" : "a",
        });
        await waitFor(() => expect(mounted.reference.current!.getText()).toBe("Replacement"));
      }
      await act(async () => {
        upload.resolve("https://example.com/stale.png");
        await upload.promise;
      });
      if (transition !== "destroy")
        expect(
          mounted.reference.current!.getJSON().content!.some((node) => node.type === "image"),
        ).toBe(false);
      expect(onError).not.toHaveBeenCalled();
    },
  );

  it.each(["reject", "unsafe-url"])(
    "reports upload %s without mutating the document",
    async (failure) => {
      const onError = vi.fn();
      const uploadImage =
        failure === "reject"
          ? vi.fn(async () => {
              throw new Error("Network unavailable");
            })
          : vi.fn(async () => "javascript:evil()");
      const { editor } = await mountEditor({
        defaultValue: doc("Keep"),
        clipboard: { uploadImage },
        onError,
      });
      clipboardEvent(editor, "paste", new Clipboard({}, [file()]));
      await waitFor(() =>
        expect(onError).toHaveBeenCalledWith(
          expect.objectContaining({ code: failure === "reject" ? "upload-failed" : "unsafe-url" }),
        ),
      );
      expect(editor.getText()).toBe("Keep");
    },
  );
});
