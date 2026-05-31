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

const commandMetadata = {
  paragraph: {
    group: "Basic",
    description: "Start with plain text",
    icon: "Text",
  },
  heading1: {
    group: "Basic",
    description: "Large section heading",
    icon: "Heading1",
  },
  heading2: {
    group: "Basic",
    description: "Medium section heading",
    icon: "Heading2",
  },
  heading3: {
    group: "Basic",
    description: "Small section heading",
    icon: "Heading3",
  },
  bulletList: {
    group: "Lists",
    description: "Create a bulleted list",
    icon: "List",
  },
  orderedList: {
    group: "Lists",
    description: "Create a numbered list",
    icon: "ListOrdered",
  },
  todoList: {
    group: "Lists",
    description: "Track tasks with checkboxes",
    icon: "ListTodo",
  },
  quote: {
    group: "Advanced",
    description: "Capture a quote or excerpt",
    icon: "Quote",
  },
  callout: {
    group: "Advanced",
    description: "Highlight information in a callout",
    icon: "PanelTop",
  },
  divider: {
    group: "Advanced",
    description: "Add a horizontal divider",
    icon: "Minus",
  },
  codeBlock: {
    group: "Advanced",
    description: "Write code with formatting",
    icon: "Code",
  },
  table: {
    group: "Advanced",
    description: "Insert a simple table",
    icon: "Table",
  },
  image: {
    group: "Media",
    description: "Embed an image by URL",
    icon: "Image",
  },
  bookmark: {
    group: "Media",
    description: "Save a rich link bookmark",
    icon: "Bookmark",
  },
  toggle: {
    group: "Advanced",
    description: "Create a collapsible section",
    icon: "PanelTop",
  },
  toc: {
    group: "Advanced",
    description: "Insert a table of contents",
    icon: "ListTree",
  },
} satisfies Record<
  string,
  {
    group: NonNullable<FolioCommandContribution["group"]>;
    description: string;
    icon: NonNullable<FolioCommandContribution["icon"]>;
  }
>;

export function createDefaultFolioCommands(): FolioCommandContribution[] {
  return [
    {
      name: "paragraph",
      label: "Text",
      ...commandMetadata.paragraph,
      keywords: ["paragraph", "plain"],
      action: ({ editor }) =>
        runEditorChain(editor, (chain) => chain.setParagraph()),
    },
    {
      name: "heading1",
      label: "Heading 1",
      ...commandMetadata.heading1,
      keywords: ["h1", "title"],
      action: ({ editor }) =>
        runEditorChain(editor, (chain) => chain.toggleHeading({ level: 1 })),
    },
    {
      name: "heading2",
      label: "Heading 2",
      ...commandMetadata.heading2,
      keywords: ["h2", "subtitle"],
      action: ({ editor }) =>
        runEditorChain(editor, (chain) => chain.toggleHeading({ level: 2 })),
    },
    {
      name: "heading3",
      label: "Heading 3",
      ...commandMetadata.heading3,
      keywords: ["h3"],
      action: ({ editor }) =>
        runEditorChain(editor, (chain) => chain.toggleHeading({ level: 3 })),
    },
    {
      name: "bulletList",
      label: "Bulleted list",
      ...commandMetadata.bulletList,
      keywords: ["ul", "list"],
      action: ({ editor }) =>
        runEditorChain(editor, (chain) => chain.toggleBulletList()),
    },
    {
      name: "orderedList",
      label: "Numbered list",
      ...commandMetadata.orderedList,
      keywords: ["ol", "list"],
      action: ({ editor }) =>
        runEditorChain(editor, (chain) => chain.toggleOrderedList()),
    },
    {
      name: "todoList",
      label: "Todo list",
      ...commandMetadata.todoList,
      keywords: ["task", "check"],
      action: ({ editor }) =>
        runEditorChain(editor, (chain) => chain.toggleTaskList()),
    },
    {
      name: "quote",
      label: "Quote",
      ...commandMetadata.quote,
      keywords: ["blockquote"],
      action: ({ editor }) =>
        runEditorChain(editor, (chain) => chain.toggleBlockquote()),
    },
    {
      name: "callout",
      label: "Callout",
      ...commandMetadata.callout,
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
      ...commandMetadata.divider,
      keywords: ["horizontal", "rule"],
      action: ({ editor }) =>
        runEditorChain(editor, (chain) => chain.setHorizontalRule()),
    },
    {
      name: "codeBlock",
      label: "Code block",
      ...commandMetadata.codeBlock,
      keywords: ["pre", "code"],
      action: ({ editor }) =>
        runEditorChain(editor, (chain) => chain.toggleCodeBlock()),
    },
    {
      name: "table",
      label: "Table",
      ...commandMetadata.table,
      keywords: ["grid"],
      action: ({ editor }) =>
        runEditorChain(editor, (chain) =>
          chain.insertTable({ rows: 3, cols: 3, withHeaderRow: true }),
        ),
    },
    {
      name: "image",
      label: "Image",
      ...commandMetadata.image,
      keywords: ["photo", "media"],
      action: ({ editor, attrs }) =>
        runEditorChain(editor, (chain) =>
          chain.setImage({ src: String(attrs?.src ?? "") }),
        ),
    },
    {
      name: "bookmark",
      label: "Bookmark",
      ...commandMetadata.bookmark,
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
      ...commandMetadata.toggle,
      keywords: ["details", "collapse"],
      action: ({ editor }) =>
        runEditorChain(editor, (chain) => chain.setDetails()),
    },
    {
      name: "toc",
      label: "Table of contents",
      ...commandMetadata.toc,
      keywords: ["outline"],
      action: ({ editor }) =>
        runEditorChain(editor, (chain) =>
          chain.insertContent({ type: "tableOfContents" }),
        ),
    },
  ];
}
