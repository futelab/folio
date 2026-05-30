import type { Extensions } from "@tiptap/core";
import { Details, DetailsContent, DetailsSummary } from "@tiptap/extension-details";
import { TableKit } from "@tiptap/extension-table";
import { TaskItem } from "@tiptap/extension-task-item";
import { TaskList } from "@tiptap/extension-task-list";
import { FolioImage } from "../nodes/image";
import { Placeholder } from "@tiptap/extension-placeholder";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import { Highlight } from "@tiptap/extension-highlight";
import { TableOfContents } from "@tiptap/extension-table-of-contents";
import { Mention } from "@tiptap/extension-mention";
import { Markdown } from "@tiptap/markdown";
import { StarterKit } from "@tiptap/starter-kit";
import type { FolioExtension } from "./types";
import { FolioBookmark } from "../nodes/bookmark";
import { FolioCallout } from "../nodes/callout";
import { FolioTableOfContentsNode } from "../nodes/toc";

const FolioTableOfContentsController = TableOfContents.extend({
  name: "folioTableOfContentsController",
});

export interface CreateDefaultTiptapExtensionsOptions {
  folioExtensions?: FolioExtension[];
  placeholder?: string;
  includeMarkdown?: boolean;
}

export function createDefaultTiptapExtensions(
  options: CreateDefaultTiptapExtensionsOptions = {},
): Extensions {
  const externalExtensions = options.folioExtensions?.flatMap(
    (extension) => extension.tiptapExtensions ?? [],
  );

  return [
    StarterKit.configure({
      heading: {
        levels: [1, 2, 3],
      },
      link: {
        openOnClick: false,
      },
    }),
    TableKit.configure({
      table: {
        resizable: true,
      },
    }),
    TaskList,
    TaskItem.configure({
      nested: true,
    }),
    FolioImage.configure({
      HTMLAttributes: {
        class: "folio-image",
      },
    }),
    Placeholder.configure({
      placeholder: options.placeholder ?? "Start writing...",
    }),
    TextStyle,
    Color,
    Highlight.configure({
      multicolor: true,
    }),
    Details,
    DetailsSummary,
    DetailsContent,
    FolioTableOfContentsController,
    FolioTableOfContentsNode,
    Mention.configure({
      HTMLAttributes: {
        class: "folio-mention",
      },
    }),
    FolioCallout,
    FolioBookmark,
    ...(options.includeMarkdown ? [Markdown] : []),
    ...(externalExtensions ?? []),
  ];
}
