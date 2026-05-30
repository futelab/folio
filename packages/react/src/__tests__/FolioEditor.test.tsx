import "@testing-library/jest-dom/vitest";
import { EditorContent } from "@tiptap/react";
import type { Editor } from "@tiptap/core";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createEmptyFolioDocument } from "@futelab/folio-core";
import type { FolioCommandContribution, FolioDocument } from "@futelab/folio-core";
import { useEffect } from "react";
import { describe, expect, it, vi } from "vitest";
import { FolioEditor } from "../FolioEditor";
import { SlashMenu } from "../menus/SlashMenu";
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

  it("renders slash commands for an initial slash query", () => {
    render(
      <FolioEditor
        value={createEmptyFolioDocument()}
        onChange={vi.fn()}
        initialSlashQuery="/"
      />,
    );

    expect(screen.getByRole("menu", { name: "Slash commands" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Text" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Heading 1" })).toBeInTheDocument();
  });

  it("does not render slash commands for non-slash queries", () => {
    const { rerender } = render(
      <FolioEditor
        value={createEmptyFolioDocument()}
        onChange={vi.fn()}
        initialSlashQuery=""
      />,
    );

    expect(screen.queryByRole("menu", { name: "Slash commands" })).not.toBeInTheDocument();

    rerender(
      <FolioEditor
        value={createEmptyFolioDocument()}
        onChange={vi.fn()}
        initialSlashQuery="heading"
      />,
    );

    expect(screen.queryByRole("menu", { name: "Slash commands" })).not.toBeInTheDocument();
  });

  it("uses injected slash commands", () => {
    const action = vi.fn(() => true);
    const commands: FolioCommandContribution[] = [
      {
        name: "customWidget",
        label: "Custom widget",
        keywords: ["bespoke"],
        action,
      },
    ];

    render(<SlashMenu commands={commands} editor={null} query="/widget" />);

    fireEvent.click(screen.getByRole("menuitem", { name: "Custom widget" }));

    expect(screen.queryByRole("menuitem", { name: "Text" })).not.toBeInTheDocument();
    expect(action).toHaveBeenCalledWith({ editor: null });
  });

  it("moves focus through slash commands with menu keyboard navigation", () => {
    const commands: FolioCommandContribution[] = [
      { name: "alpha", label: "Alpha", action: () => true },
      { name: "beta", label: "Beta", action: () => true },
      { name: "gamma", label: "Gamma", action: () => true },
    ];

    render(<SlashMenu commands={commands} editor={null} query="/" />);

    const alpha = screen.getByRole("menuitem", { name: "Alpha" });
    const beta = screen.getByRole("menuitem", { name: "Beta" });
    const gamma = screen.getByRole("menuitem", { name: "Gamma" });

    alpha.focus();

    fireEvent.keyDown(alpha, { key: "ArrowDown" });
    expect(beta).toHaveFocus();

    fireEvent.keyDown(beta, { key: "End" });
    expect(gamma).toHaveFocus();

    fireEvent.keyDown(gamma, { key: "ArrowDown" });
    expect(alpha).toHaveFocus();

    fireEvent.keyDown(alpha, { key: "ArrowUp" });
    expect(gamma).toHaveFocus();

    fireEvent.keyDown(gamma, { key: "Home" });
    expect(alpha).toHaveFocus();

    fireEvent.keyDown(alpha, { key: "Escape" });
    expect(alpha).not.toHaveFocus();
  });

  it("renders the text formatting bubble toolbar", () => {
    render(<FolioEditor value={createEmptyFolioDocument()} onChange={vi.fn()} />);

    expect(
      screen.getByRole("toolbar", { name: "Text formatting" }),
    ).toBeInTheDocument();
  });

  it("renders accessible block controls", () => {
    render(<FolioEditor value={createEmptyFolioDocument()} onChange={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Insert block" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Drag block" })).toBeInTheDocument();
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
