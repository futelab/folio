import "@testing-library/jest-dom/vitest";
import { useEffect } from "react";
import type { Editor } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { FolioDocument } from "@futelab/folio-core/browser";
import { FolioEditor } from "../FolioEditor";
import { useFolioEditor, type UseFolioEditorOptions } from "../useFolioEditor";
import { MediaDialog } from "../menus/MediaDialog";
import { resolveEditorLabels } from "../editorLabels";
import { BubbleToolbar } from "../menus/BubbleToolbar";

const doc = (text: string): FolioDocument => ({
  type: "doc",
  content: [{ type: "paragraph", content: text ? [{ type: "text", text }] : [] }],
});
beforeAll(() => {
  // jsdom has no layout; these values only let Tiptap restore focus after commands.
  if (!Range.prototype.getBoundingClientRect)
    Range.prototype.getBoundingClientRect = () => new DOMRect(0, 0, 20, 20);
  if (!Range.prototype.getClientRects)
    Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
});

function harness(options: UseFolioEditorOptions) {
  const reference: { current: Editor | null } = { current: null };
  function Harness(props: UseFolioEditorOptions) {
    const editor = useFolioEditor(props);
    useEffect(() => {
      reference.current = editor;
    }, [editor]);
    return <EditorContent editor={editor} />;
  }
  const view = render(<Harness {...options} />);
  return {
    reference,
    rerender: (next: UseFolioEditorOptions) => view.rerender(<Harness {...next} />),
  };
}

describe("editor reliability boundaries", () => {
  it("blocks direct document transactions while read-only and allows external replacement", async () => {
    const onChange = vi.fn();
    const { reference, rerender } = harness({ value: doc("Original"), editable: false, onChange });
    await waitFor(() => expect(reference.current).not.toBeNull());
    act(() => {
      reference.current!.commands.insertContent("Forbidden");
    });
    expect(reference.current!.getText()).toBe("Original");
    expect(onChange).not.toHaveBeenCalled();
    rerender({ value: doc("Replacement"), editable: false, onChange });
    await waitFor(() => expect(reference.current!.getText()).toBe("Replacement"));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("hides every editor writing control in read-only mode", async () => {
    render(<FolioEditor editable={false} initialSlashQuery="/" value={doc("Read only")} />);
    await waitFor(() =>
      expect(screen.getByRole("toolbar", { name: "Document browsing" })).toBeInTheDocument(),
    );
    expect(screen.queryByRole("toolbar", { name: "Document actions" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Find and replace" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Insert block" })).not.toBeInTheDocument();
  });

  it("keeps parent echoes and current callbacks without resetting undo history", async () => {
    const first = vi.fn();
    const latest = vi.fn();
    const { reference, rerender } = harness({ value: doc("Original"), onChange: first });
    await waitFor(() => expect(reference.current).not.toBeNull());
    const editor = reference.current!;
    act(() => {
      editor.commands.insertContent("New ");
    });
    const echo = editor.getJSON() as FolioDocument;
    rerender({ value: echo, onChange: latest });
    await waitFor(() => expect(reference.current).toBe(editor));
    act(() => {
      editor.commands.insertContent("Latest ");
    });
    expect(latest).toHaveBeenCalledTimes(1);
    expect(first).toHaveBeenCalledTimes(1);
    expect(editor.can().undo()).toBe(true);
  });

  it("replaces external content with fresh history and no save callback", async () => {
    const onChange = vi.fn();
    const { reference, rerender } = harness({ value: doc("Original"), documentId: "a", onChange });
    await waitFor(() => expect(reference.current).not.toBeNull());
    const original = reference.current!;
    act(() => {
      original.commands.insertContent("Edited ");
    });
    onChange.mockClear();
    rerender({ value: doc("Server version"), documentId: "a", onChange });
    await waitFor(() => expect(reference.current!.getText()).toBe("Server version"));
    expect(reference.current).not.toBe(original);
    expect(reference.current!.can().undo()).toBe(false);
    expect(onChange).not.toHaveBeenCalled();
    const replacement = reference.current;
    rerender({ value: doc("Server version"), documentId: "b", onChange });
    await waitFor(() => expect(reference.current).not.toBe(replacement));
    expect(reference.current!.can().undo()).toBe(false);
  });

  it("reports invalid external content without destroying the last valid document", async () => {
    const onError = vi.fn();
    const { reference, rerender } = harness({ value: doc("Keep me"), onError });
    await waitFor(() => expect(reference.current).not.toBeNull());
    rerender({ value: { type: "doc", content: [{ type: "unsupported" }] }, onError });
    await waitFor(() => expect(onError).toHaveBeenCalled());
    expect(reference.current!.getText()).toBe("Keep me");
  });

  it("integrates extension commands and leaves IME confirmation to the input method", () => {
    const action = vi.fn(() => true);
    render(
      <FolioEditor
        initialSlashQuery="/custom"
        extensions={[
          { name: "custom", commands: [{ name: "custom", label: "Custom action", action }] },
        ]}
      />,
    );
    fireEvent.keyDown(screen.getByTestId("folio-editor"), { key: "Enter", isComposing: true });
    expect(action).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("menuitem", { name: "Custom action" }));
    expect(action).toHaveBeenCalledTimes(1);
  });

  it("inserts an image with alternative text and caption through the URL dialog", async () => {
    const onChange = vi.fn();
    render(<FolioEditor defaultValue={doc("")} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Image" }));
    fireEvent.change(screen.getByLabelText("URL"), { target: { value: "javascript:alert(1)" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("URL"), {
      target: { value: "https://example.com/image.png" },
    });
    fireEvent.change(screen.getByLabelText("Alternative text"), { target: { value: "A diagram" } });
    fireEvent.change(screen.getByLabelText("Caption"), { target: { value: "Figure 1" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const saved = onChange.mock.calls.at(-1)![0] as FolioDocument;
    expect(saved.content?.find((node) => node.type === "image")?.attrs).toMatchObject({
      src: "https://example.com/image.png",
      alt: "A diagram",
      caption: "Figure 1",
    });
  });

  it("retries a failed upload without mutating the document before saving", async () => {
    const uploadImage = vi
      .fn()
      .mockRejectedValueOnce(new Error("Network unavailable"))
      .mockResolvedValueOnce({ src: "/uploaded.png", alt: "Uploaded" });
    const onSave = vi.fn(() => true);
    render(
      <MediaDialog
        kind="image"
        labels={resolveEditorLabels()}
        onClose={vi.fn()}
        onSave={onSave}
        uploadImage={uploadImage}
      />,
    );
    fireEvent.change(screen.getByLabelText("Upload image"), {
      target: { files: [new File(["data"], "image.png", { type: "image/png" })] },
    });
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Network unavailable"));
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Retry upload" }));
    await waitFor(() => expect(screen.getByLabelText("URL")).toHaveValue("/uploaded.png"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ src: "/uploaded.png", alt: "Uploaded" }),
    );
  });

  it("creates a block below the current block without converting its text", async () => {
    const onChange = vi.fn();
    render(<FolioEditor defaultValue={doc("Keep this paragraph")} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Insert block" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Heading 1" }));
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const saved = onChange.mock.calls.at(-1)![0] as FolioDocument;
    expect(saved.content?.[0]).toMatchObject({
      type: "paragraph",
      content: [{ text: "Keep this paragraph" }],
    });
    expect(saved.content?.[1]?.type).toBe("heading");
  });

  it("inserts a configured mention using the accessible picker", async () => {
    const onChange = vi.fn();
    render(
      <FolioEditor
        defaultValue={doc("")}
        mentionSuggestions={[{ id: "alice", label: "Alice" }]}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Mention" }));
    fireEvent.click(screen.getByRole("option", { name: "Alice" }));
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const saved = JSON.stringify(onChange.mock.calls.at(-1)![0]);
    expect(saved).toContain('"type":"mention"');
    expect(saved).toContain('"id":"alice"');
  });

  it("appends table rows and columns after the existing data", async () => {
    const cell = (text: string, type = "tableCell") => ({
      type,
      content: [{ type: "paragraph", content: [{ type: "text", text }] }],
    });
    const onChange = vi.fn();
    const { container } = render(
      <FolioEditor
        onChange={onChange}
        defaultValue={{
          type: "doc",
          content: [
            {
              type: "table",
              content: [
                {
                  type: "tableRow",
                  content: [cell("H1", "tableHeader"), cell("H2", "tableHeader")],
                },
                { type: "tableRow", content: [cell("A1"), cell("A2")] },
                { type: "tableRow", content: [cell("B1"), cell("B2")] },
              ],
            },
          ],
        }}
      />,
    );
    const tableElement = container.querySelector("table")!;
    vi.spyOn(tableElement, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 400, 180));
    fireEvent.mouseMove(tableElement);
    fireEvent.click(screen.getByRole("button", { name: "Add table row" }));
    fireEvent.click(screen.getByRole("button", { name: "Add table column" }));
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const table = (onChange.mock.calls.at(-1)![0] as FolioDocument).content?.find(
      (node) => node.type === "table",
    );
    expect(table?.content).toHaveLength(4);
    expect(
      table?.content?.map((row) =>
        row.content?.map((entry) => entry.content?.[0]?.content?.[0]?.text ?? ""),
      ),
    ).toEqual([
      ["H1", "H2", ""],
      ["A1", "A2", ""],
      ["B1", "B2", ""],
      ["", "", ""],
    ]);
  });

  it("keeps selected table actions visible when hovering a different block", () => {
    const { container } = render(
      <FolioEditor
        defaultValue={{
          type: "doc",
          content: [
            {
              type: "table",
              content: [
                {
                  type: "tableRow",
                  content: [
                    {
                      type: "tableCell",
                      content: [{ type: "paragraph", content: [{ type: "text", text: "Cell" }] }],
                    },
                  ],
                },
              ],
            },
            { type: "paragraph", content: [{ type: "text", text: "Outside the table" }] },
          ],
        }}
      />,
    );
    const editorDOM = container.querySelector(".ProseMirror") as HTMLElement & { editor: Editor };
    const editor = editorDOM.editor;
    const table = editorDOM.querySelector("table")!;
    const cell = table.querySelector("td")!;
    fireEvent.mouseMove(table);
    act(() => {
      editor.commands.setTextSelection(editor.view.posAtDOM(cell, 0) + 1);
    });
    expect(screen.getByRole("group", { name: "Table actions" })).toBeInTheDocument();
    const selection = editor.state.selection.toJSON();
    fireEvent.mouseMove(screen.getByText("Outside the table"));
    expect(editor.state.selection.toJSON()).toEqual(selection);
    expect(screen.getByRole("group", { name: "Table actions" })).toBeInTheDocument();
  });

  it("edits existing image metadata without inserting a duplicate", async () => {
    const onChange = vi.fn();
    const { container } = render(
      <FolioEditor
        defaultValue={{
          type: "doc",
          content: [
            {
              type: "image",
              attrs: { src: "/original.png", alt: "Original", caption: "Old caption" },
            },
          ],
        }}
        onChange={onChange}
      />,
    );
    fireEvent.mouseMove(container.querySelector("img")!);
    fireEvent.click(screen.getByRole("button", { name: "Edit selected media" }));
    expect(screen.getByLabelText("URL")).toHaveValue("/original.png");
    fireEvent.change(screen.getByLabelText("Caption"), { target: { value: "Updated caption" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const images = (onChange.mock.calls.at(-1)![0] as FolioDocument).content?.filter(
      (node) => node.type === "image",
    );
    expect(images).toHaveLength(1);
    expect(images?.[0].attrs).toMatchObject({ src: "/original.png", caption: "Updated caption" });
  });

  it("edits and removes text links without browser prompts", async () => {
    const prompt = vi.spyOn(window, "prompt");
    const reference: { current: Editor | null } = { current: null };
    function LinkHarness() {
      const editor = useFolioEditor({ defaultValue: doc("Linked text") });
      useEffect(() => {
        reference.current = editor;
      }, [editor]);
      return (
        <>
          <EditorContent editor={editor} />
          <BubbleToolbar editor={editor} />
        </>
      );
    }
    render(<LinkHarness />);
    await waitFor(() => expect(reference.current).not.toBeNull());
    act(() => {
      reference.current!.commands.setTextSelection({ from: 1, to: 7 });
    });
    fireEvent.click(screen.getByRole("button", { name: "Link" }));
    fireEvent.change(screen.getByLabelText("URL"), { target: { value: "https://example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(reference.current!.getAttributes("link").href).toBe("https://example.com");
    fireEvent.click(screen.getByRole("button", { name: "Link" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove link" }));
    expect(reference.current!.isActive("link")).toBe(false);
    expect(prompt).not.toHaveBeenCalled();
    prompt.mockRestore();
  });
});
