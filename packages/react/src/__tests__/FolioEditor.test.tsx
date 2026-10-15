import "@testing-library/jest-dom/vitest";
import { EditorContent } from "@tiptap/react";
import type { Editor } from "@tiptap/core";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createEmptyFolioDocument } from "@futelab/folio-core";
import { createDefaultFolioCommands } from "@futelab/folio-core/browser";
import type { FolioCommandContribution, FolioDocument } from "@futelab/folio-core";
import { useEffect } from "react";
import { describe, expect, it, vi } from "vitest";
import { BlockInteractionLayer } from "../blocks/BlockInteractionLayer";
import { BlockSideControls } from "../blocks/BlockSideControls";
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
      <FolioEditor value={createEmptyFolioDocument()} onChange={vi.fn()} initialSlashQuery="/" />,
    );

    expect(screen.getByRole("menu", { name: "Slash commands" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Text" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Heading 1" })).toBeInTheDocument();
  });

  it("uses built-in Chinese messages for editor UI and slash commands", () => {
    render(
      <FolioEditor
        value={createEmptyFolioDocument()}
        onChange={vi.fn()}
        initialSlashQuery="/"
        locale="zh-CN"
      />,
    );

    expect(screen.getByRole("menu", { name: "斜杠菜单" })).toBeInTheDocument();
    expect(screen.getByText("基础")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "文本" })).toBeInTheDocument();
    expect(screen.getByText("从普通文本开始")).toBeInTheDocument();
  });

  it("applies per-instance translations for custom locales", () => {
    render(
      <FolioEditor
        value={createEmptyFolioDocument()}
        onChange={vi.fn()}
        initialSlashQuery="/"
        locale="pirate"
        translations={{
          pirate: {
            ui: {
              slashMenu: {
                label: "Command deck",
                groups: {
                  Basic: "First mate",
                },
              },
            },
            commands: {
              paragraph: {
                label: "Log entry",
                description: "Write a ship log",
                keywords: ["log"],
              },
            },
          },
        }}
      />,
    );

    expect(screen.getByRole("menu", { name: "Command deck" })).toBeInTheDocument();
    expect(screen.getByText("First mate")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Log entry" })).toBeInTheDocument();
    expect(screen.getByText("Write a ship log")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Heading 1" })).toBeInTheDocument();
  });

  it("does not render slash commands for non-slash queries", () => {
    const { rerender } = render(
      <FolioEditor value={createEmptyFolioDocument()} onChange={vi.fn()} initialSlashQuery="" />,
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

  it("provides grouped slash command display metadata", () => {
    const commands = createDefaultFolioCommands();
    const heading = commands.find((command) => command.name === "heading1");
    const image = commands.find((command) => command.name === "image");

    expect(heading).toMatchObject({
      group: "Basic",
      description: "Large section heading",
      icon: "Heading1",
    });
    expect(image).toMatchObject({
      group: "Media",
      description: "Embed an image by URL",
      icon: "Image",
    });
  });

  it("renders slash commands with groups, icons, descriptions, and active state", () => {
    const commands: FolioCommandContribution[] = [
      {
        name: "paragraph",
        label: "Text",
        group: "Basic",
        description: "Start with plain text",
        icon: "Text",
        action: () => true,
      },
      {
        name: "image",
        label: "Image",
        group: "Media",
        description: "Embed an image by URL",
        icon: "Image",
        action: () => true,
      },
    ];

    render(<SlashMenu activeIndex={1} commands={commands} editor={null} query="/" />);

    expect(screen.getByText("Basic")).toBeInTheDocument();
    expect(screen.getByText("Media")).toBeInTheDocument();
    expect(screen.getByText("Start with plain text")).toBeInTheDocument();
    expect(screen.getByText("Embed an image by URL")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Image/ })).toHaveAttribute("aria-current", "true");
  });

  it("moves active slash command selection in grouped display order", () => {
    render(
      <FolioEditor value={createEmptyFolioDocument()} onChange={vi.fn()} initialSlashQuery="/" />,
    );

    const editorRoot = screen.getByTestId("folio-editor");

    for (let index = 0; index < 7; index += 1) {
      fireEvent.keyDown(editorRoot, { key: "ArrowDown" });
    }

    expect(screen.getByRole("menuitem", { name: "Image" })).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("menuitem", { name: "Quote" })).not.toHaveAttribute(
      "aria-current",
      "true",
    );
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

  it("hides the text formatting toolbar until text is selected", () => {
    render(<FolioEditor value={documentWithText("Selectable")} onChange={vi.fn()} />);

    expect(screen.queryByRole("toolbar", { name: "Text formatting" })).not.toBeInTheDocument();
  });

  it("does not render contextual block controls before a block is active", () => {
    render(<FolioEditor value={createEmptyFolioDocument()} onChange={vi.fn()} />);

    expect(screen.getByRole("toolbar", { name: "Document actions" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add block below" })).not.toBeInTheDocument();
  });

  it("renders accessible block side controls when visible", () => {
    render(<BlockSideControls visible onAddBlock={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Add block below" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Drag block" })).toBeInTheDocument();
  });

  it("forwards block controls class names to contextual side controls", () => {
    const editorRoot = document.createElement("div");
    const activeBlock = document.createElement("p");
    editorRoot.append(activeBlock);

    vi.spyOn(editorRoot, "getBoundingClientRect").mockReturnValue({
      bottom: 120,
      height: 120,
      left: 0,
      right: 600,
      top: 0,
      width: 600,
      x: 0,
      y: 0,
      toJSON: () => undefined,
    });
    vi.spyOn(activeBlock, "getBoundingClientRect").mockReturnValue({
      bottom: 60,
      height: 24,
      left: 0,
      right: 600,
      top: 36,
      width: 600,
      x: 0,
      y: 36,
      toJSON: () => undefined,
    });

    render(
      <BlockInteractionLayer
        activeBlock={activeBlock}
        editorRoot={editorRoot}
        onOpenBlockMenu={vi.fn()}
        sideControlsClassName="custom-block-controls"
      />,
    );

    expect(screen.getByTestId("folio-block-side-controls")).toHaveClass("custom-block-controls");
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
