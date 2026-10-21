import type { EditorState } from "@tiptap/pm/state";
import type { FolioCommandContribution } from "../extensions/types";
import { createFolioMessages } from "../i18n";
import type { FolioI18nOptions, FolioMessages } from "../i18n";
import { sanitizeFolioUrl } from "../security";

function runEditorChain(editor: unknown, callback: (chain: any) => any): boolean {
  try {
    const candidate = editor as {
      chain?: unknown;
      isEditable?: boolean;
      isDestroyed?: boolean;
    } | null;
    if (
      !candidate ||
      candidate.isEditable === false ||
      candidate.isDestroyed === true ||
      typeof candidate.chain !== "function"
    )
      return false;

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

function isPlainParagraphSelection(editor: unknown): boolean {
  const state = (editor as { state?: EditorState } | null)?.state;
  if (!state) return false;
  const paragraph = state.schema.nodes.paragraph;
  let found = false;
  let onlyParagraphs = true;
  state.doc.nodesBetween(state.selection.from, state.selection.to, (node) => {
    // Do not treat a paragraph inside a list/quote as a plain paragraph:
    // the normal command still needs to normalize its surrounding blocks.
    if (node.type === paragraph) found = true;
    else onlyParagraphs = false;
    return false;
  });
  return found && onlyParagraphs;
}

const commandMetadata = {
  paragraph: {
    group: "Basic",
    icon: "Text",
  },
  heading1: {
    group: "Basic",
    icon: "Heading1",
  },
  heading2: {
    group: "Basic",
    icon: "Heading2",
  },
  heading3: {
    group: "Basic",
    icon: "Heading3",
  },
  bulletList: {
    group: "Lists",
    icon: "List",
  },
  orderedList: {
    group: "Lists",
    icon: "ListOrdered",
  },
  todoList: {
    group: "Lists",
    icon: "ListTodo",
  },
  quote: {
    group: "Advanced",
    icon: "Quote",
  },
  callout: {
    group: "Advanced",
    icon: "PanelTop",
  },
  divider: {
    group: "Advanced",
    icon: "Minus",
  },
  codeBlock: {
    group: "Advanced",
    icon: "Code",
  },
  table: {
    group: "Advanced",
    icon: "Table",
  },
  image: {
    group: "Media",
    icon: "Image",
  },
  bookmark: {
    group: "Media",
    icon: "Bookmark",
  },
  mention: { group: "Advanced", icon: "Text" },
  toggle: {
    group: "Advanced",
    icon: "PanelTop",
  },
  toc: {
    group: "Advanced",
    icon: "ListTree",
  },
} satisfies Record<
  string,
  {
    group: NonNullable<FolioCommandContribution["group"]>;
    icon: NonNullable<FolioCommandContribution["icon"]>;
  }
>;

export interface CreateDefaultFolioCommandsOptions extends FolioI18nOptions {
  messages?: FolioMessages;
}

export function createDefaultFolioCommands(
  options: CreateDefaultFolioCommandsOptions = {},
): FolioCommandContribution[] {
  const messages = options.messages ?? createFolioMessages(options.locale, options.translations);
  const commandMessages = messages.commands;

  return [
    {
      name: "paragraph",
      label: commandMessages.paragraph.label,
      ...commandMetadata.paragraph,
      description: commandMessages.paragraph.description,
      keywords: [...commandMessages.paragraph.keywords],
      // Tiptap reports false when setParagraph has nothing to convert. Choosing
      // Text in the block menu is still successful and must preserve content,
      // marks, block IDs and selection without rewriting the existing node.
      action: ({ editor }) =>
        runEditorChain(editor, (chain) =>
          isPlainParagraphSelection(editor) ? chain : chain.setParagraph(),
        ),
    },
    {
      name: "heading1",
      label: commandMessages.heading1.label,
      ...commandMetadata.heading1,
      description: commandMessages.heading1.description,
      keywords: [...commandMessages.heading1.keywords],
      action: ({ editor }) => runEditorChain(editor, (chain) => chain.toggleHeading({ level: 1 })),
    },
    {
      name: "heading2",
      label: commandMessages.heading2.label,
      ...commandMetadata.heading2,
      description: commandMessages.heading2.description,
      keywords: [...commandMessages.heading2.keywords],
      action: ({ editor }) => runEditorChain(editor, (chain) => chain.toggleHeading({ level: 2 })),
    },
    {
      name: "heading3",
      label: commandMessages.heading3.label,
      ...commandMetadata.heading3,
      description: commandMessages.heading3.description,
      keywords: [...commandMessages.heading3.keywords],
      action: ({ editor }) => runEditorChain(editor, (chain) => chain.toggleHeading({ level: 3 })),
    },
    {
      name: "bulletList",
      label: commandMessages.bulletList.label,
      ...commandMetadata.bulletList,
      description: commandMessages.bulletList.description,
      keywords: [...commandMessages.bulletList.keywords],
      action: ({ editor }) => runEditorChain(editor, (chain) => chain.toggleBulletList()),
    },
    {
      name: "orderedList",
      label: commandMessages.orderedList.label,
      ...commandMetadata.orderedList,
      description: commandMessages.orderedList.description,
      keywords: [...commandMessages.orderedList.keywords],
      action: ({ editor }) => runEditorChain(editor, (chain) => chain.toggleOrderedList()),
    },
    {
      name: "todoList",
      label: commandMessages.taskList.label,
      ...commandMetadata.todoList,
      description: commandMessages.taskList.description,
      keywords: [...commandMessages.taskList.keywords],
      action: ({ editor }) => runEditorChain(editor, (chain) => chain.toggleTaskList()),
    },
    {
      name: "quote",
      label: commandMessages.quote.label,
      ...commandMetadata.quote,
      description: commandMessages.quote.description,
      keywords: [...commandMessages.quote.keywords],
      action: ({ editor }) => runEditorChain(editor, (chain) => chain.toggleBlockquote()),
    },
    {
      name: "callout",
      label: commandMessages.callout.label,
      ...commandMetadata.callout,
      description: commandMessages.callout.description,
      keywords: [...commandMessages.callout.keywords],
      action: ({ editor }) =>
        runEditorChain(editor, (chain) =>
          chain.insertContent({
            type: "callout",
            attrs: { tone: "info" },
            content: [
              {
                type: "paragraph",
                content: [
                  {
                    type: "text",
                    text: commandMessages.callout.defaultText ?? commandMessages.callout.label,
                  },
                ],
              },
            ],
          }),
        ),
    },
    {
      name: "divider",
      label: commandMessages.divider.label,
      ...commandMetadata.divider,
      description: commandMessages.divider.description,
      keywords: [...commandMessages.divider.keywords],
      action: ({ editor }) => runEditorChain(editor, (chain) => chain.setHorizontalRule()),
    },
    {
      name: "codeBlock",
      label: commandMessages.codeBlock.label,
      ...commandMetadata.codeBlock,
      description: commandMessages.codeBlock.description,
      keywords: [...commandMessages.codeBlock.keywords],
      action: ({ editor }) => runEditorChain(editor, (chain) => chain.toggleCodeBlock()),
    },
    {
      name: "table",
      label: commandMessages.table.label,
      ...commandMetadata.table,
      description: commandMessages.table.description,
      keywords: [...commandMessages.table.keywords],
      action: ({ editor }) =>
        runEditorChain(editor, (chain) =>
          chain.insertTable({ rows: 3, cols: 3, withHeaderRow: true }),
        ),
    },
    {
      name: "image",
      label: commandMessages.image.label,
      ...commandMetadata.image,
      description: commandMessages.image.description,
      keywords: [...commandMessages.image.keywords],
      action: ({ editor, attrs }) => {
        const src = sanitizeFolioUrl(attrs?.src, { kind: "image" });
        if (!src) return false;
        return runEditorChain(editor, (chain) =>
          chain.setImage({
            src,
            ...(attrs?.alt !== undefined ? { alt: String(attrs.alt) } : {}),
            ...(attrs?.title !== undefined ? { title: String(attrs.title) } : {}),
            ...(attrs?.caption !== undefined ? { caption: String(attrs.caption) } : {}),
          }),
        );
      },
    },
    {
      name: "bookmark",
      label: commandMessages.bookmark.label,
      ...commandMetadata.bookmark,
      description: commandMessages.bookmark.description,
      keywords: [...commandMessages.bookmark.keywords],
      action: ({ editor, attrs }) => {
        const url = sanitizeFolioUrl(String(attrs?.url ?? ""), { kind: "link" });
        if (!url) return false;
        return runEditorChain(editor, (chain) =>
          chain.insertContent({
            type: "bookmark",
            attrs: {
              url,
              title: String(attrs?.title ?? attrs?.url ?? ""),
              description: String(attrs?.description ?? ""),
            },
          }),
        );
      },
    },
    {
      name: "mention",
      label: commandMessages.mention.label,
      ...commandMetadata.mention,
      description: commandMessages.mention.description,
      keywords: [...commandMessages.mention.keywords],
      action: ({ editor, attrs }) => {
        const id = String(attrs?.id ?? attrs?.label ?? "").trim();
        if (!id) return false;
        return runEditorChain(editor, (chain) =>
          chain.insertContent({
            type: "mention",
            attrs: { id, label: String(attrs?.label ?? id) },
          }),
        );
      },
    },
    {
      name: "toggle",
      label: commandMessages.toggle.label,
      ...commandMetadata.toggle,
      description: commandMessages.toggle.description,
      keywords: [...commandMessages.toggle.keywords],
      action: ({ editor }) => runEditorChain(editor, (chain) => chain.setDetails()),
    },
    {
      name: "toc",
      label: commandMessages.toc.label,
      ...commandMetadata.toc,
      description: commandMessages.toc.description,
      keywords: [...commandMessages.toc.keywords],
      action: ({ editor }) =>
        runEditorChain(editor, (chain) => chain.insertContent({ type: "tableOfContents" })),
    },
  ];
}
