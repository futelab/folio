import "@testing-library/jest-dom/vitest";
import { EditorContent } from "@tiptap/react";
import type { Editor } from "@tiptap/core";
import { act, render, screen, waitFor } from "@testing-library/react";
import { createEmptyFolioDocument } from "@futelab/folio-core";
import type { FolioDocument } from "@futelab/folio-core";
import { useEffect } from "react";
import { describe, expect, it, vi } from "vitest";
import { FolioEditor } from "../FolioEditor";
import { useFolioEditor } from "../useFolioEditor";

const documentWithText = (text: string): FolioDocument => ({
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [{ type: "text", text }],
    },
  ],
});

describe("FolioEditor", () => {
  it("renders an editable editor surface", () => {
    render(
      <FolioEditor
        value={createEmptyFolioDocument()}
        onChange={vi.fn()}
        placeholder="Write here"
      />,
    );

    expect(screen.getByTestId("folio-editor")).toHaveClass("folio-editor");
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("preserves uncontrolled edits when editor extensions are recreated", async () => {
    const editorRef: { current: Editor | null } = { current: null };

    function Harness(props: { placeholder: string }) {
      const editor = useFolioEditor({
        defaultValue: createEmptyFolioDocument(),
        placeholder: props.placeholder,
      });

      useEffect(() => {
        editorRef.current = editor;
      }, [editor]);

      return <EditorContent editor={editor} />;
    }

    const { rerender } = render(<Harness placeholder="First placeholder" />);

    await waitFor(() => expect(editorRef.current).not.toBeNull());

    const initialEditor = editorRef.current;

    act(() => {
      editorRef.current?.commands.setContent(documentWithText("Preserved edit"), {
        emitUpdate: true,
      });
    });

    expect(screen.getByText("Preserved edit")).toBeInTheDocument();

    rerender(<Harness placeholder="Second placeholder" />);

    await waitFor(() => expect(editorRef.current).not.toBe(initialEditor));

    expect(editorRef.current?.getJSON()).toEqual(documentWithText("Preserved edit"));
    expect(screen.getByText("Preserved edit")).toBeInTheDocument();
  });
});
