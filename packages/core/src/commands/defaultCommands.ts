import type { FolioCommandContribution } from "../extensions/types";

function runEditorChain(
  editor: unknown,
  callback: (chain: any) => any,
): boolean {
  try {
    const candidate = editor as { chain?: unknown } | null;
    if (!candidate || typeof candidate.chain !== "function") return false;

    const chain = candidate.chain();
    if (!chain || typeof chain.focus !== "function") return false;

    const focusedChain = chain.focus();
    const commandChain = callback(focusedChain);
    if (!commandChain || typeof commandChain.run !== "function") return false;

    const result = commandChain.run();
    return typeof result === "boolean" ? result : false;
  } catch {
    return false;
  }
}

export function createDefaultFolioCommands(): FolioCommandContribution[] {
  return [
    {
      name: "paragraph",
      label: "Text",
      keywords: ["paragraph", "plain"],
      action: ({ editor }) =>
        runEditorChain(editor, (chain) => chain.setParagraph()),
    },
    {
      name: "heading1",
      label: "Heading 1",
      keywords: ["h1", "title"],
      action: ({ editor }) =>
        runEditorChain(editor, (chain) => chain.toggleHeading({ level: 1 })),
    },
    {
      name: "heading2",
      label: "Heading 2",
      keywords: ["h2", "subtitle"],
      action: ({ editor }) =>
        runEditorChain(editor, (chain) => chain.toggleHeading({ level: 2 })),
    },
    {
      name: "heading3",
      label: "Heading 3",
      keywords: ["h3"],
      action: ({ editor }) =>
        runEditorChain(editor, (chain) => chain.toggleHeading({ level: 3 })),
    },
    {
      name: "bulletList",
      label: "Bulleted list",
      keywords: ["ul", "list"],
      action: ({ editor }) =>
        runEditorChain(editor, (chain) => chain.toggleBulletList()),
    },
    {
      name: "orderedList",
      label: "Numbered list",
      keywords: ["ol", "list"],
      action: ({ editor }) =>
        runEditorChain(editor, (chain) => chain.toggleOrderedList()),
    },
    {
      name: "todoList",
      label: "Todo list",
      keywords: ["task", "check"],
      action: ({ editor }) =>
        runEditorChain(editor, (chain) => chain.toggleTaskList()),
    },
    {
      name: "quote",
      label: "Quote",
      keywords: ["blockquote"],
      action: ({ editor }) =>
        runEditorChain(editor, (chain) => chain.toggleBlockquote()),
    },
    {
      name: "callout",
      label: "Callout",
      keywords: ["note", "aside"],
      action: ({ editor }) =>
        runEditorChain(editor, (chain) =>
          chain.insertContent({
            type: "callout",
            attrs: { tone: "info" },
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Callout" }],
              },
            ],
          }),
        ),
    },
    {
      name: "divider",
      label: "Divider",
      keywords: ["horizontal", "rule"],
      action: ({ editor }) =>
        runEditorChain(editor, (chain) => chain.setHorizontalRule()),
    },
    {
      name: "codeBlock",
      label: "Code block",
      keywords: ["pre", "code"],
      action: ({ editor }) =>
        runEditorChain(editor, (chain) => chain.toggleCodeBlock()),
    },
    {
      name: "table",
      label: "Table",
      keywords: ["grid"],
      action: ({ editor }) =>
        runEditorChain(editor, (chain) =>
          chain.insertTable({ rows: 3, cols: 3, withHeaderRow: true }),
        ),
    },
    {
      name: "image",
      label: "Image",
      keywords: ["photo", "media"],
      action: ({ editor, attrs }) =>
        runEditorChain(editor, (chain) =>
          chain.setImage({ src: String(attrs?.src ?? "") }),
        ),
    },
    {
      name: "bookmark",
      label: "Bookmark",
      keywords: ["link", "embed"],
      action: ({ editor, attrs }) =>
        runEditorChain(editor, (chain) =>
          chain.insertContent({
            type: "bookmark",
            attrs: {
              url: String(attrs?.url ?? ""),
              title: String(attrs?.title ?? attrs?.url ?? ""),
              description: String(attrs?.description ?? ""),
            },
          }),
        ),
    },
    {
      name: "toggle",
      label: "Toggle",
      keywords: ["details", "collapse"],
      action: ({ editor }) =>
        runEditorChain(editor, (chain) => chain.setDetails()),
    },
    {
      name: "toc",
      label: "Table of contents",
      keywords: ["outline"],
      action: ({ editor }) =>
        runEditorChain(editor, (chain) =>
          chain.insertContent({ type: "tableOfContents" }),
        ),
    },
  ];
}
