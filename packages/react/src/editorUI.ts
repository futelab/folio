import type { ComponentProps, ComponentType, ReactNode } from "react";
import type { Editor } from "@tiptap/core";
import type { FolioMessages } from "./i18n";
import type { FolioEditorLabels } from "./editorLabels";
import type { BubbleToolbar } from "./menus/BubbleToolbar";
import type { SlashMenu } from "./menus/SlashMenu";
import type { MediaDialog } from "./menus/MediaDialog";
import type { MentionPicker } from "./menus/MentionPicker";
import type { BlockActionMenu } from "./blocks/BlockActionMenu";
import type { FolioHistoryPanel } from "./history/FolioHistoryPanel";
import type { SearchPanel } from "./search";
import type { FolioCommentsPanel } from "./comments";

export type FolioToolbarMode = "default" | "compact" | "floating";
export type FolioToolbarAction =
  | "insertBlock"
  | "undo"
  | "redo"
  | "image"
  | "bookmark"
  | "link"
  | "mention"
  | "editMedia"
  | "moveUp"
  | "moveDown"
  | "table"
  | "find"
  | "layout"
  | "comments"
  | "history";
export interface FolioEditorUIOptions {
  toolbar?: FolioToolbarMode | false;
  toolbarActions?: FolioToolbarAction[];
  blockControls?: boolean;
  bubbleToolbar?: boolean;
  slashMenu?: boolean;
  tableControls?: boolean;
  search?: boolean;
}
export interface FolioToolbarProps {
  editor: Editor;
  mode: FolioToolbarMode;
  messages: FolioMessages;
  labels: FolioEditorLabels;
  documentId?: string;
  /** The complete default toolbar, which can be placed, cloned, or replaced. */
  children: ReactNode;
}
export interface FolioEditorComponents {
  toolbar?: ComponentType<FolioToolbarProps>;
  bubbleToolbar?: ComponentType<ComponentProps<typeof BubbleToolbar>>;
  slashMenu?: ComponentType<ComponentProps<typeof SlashMenu>>;
  blockActionMenu?: ComponentType<ComponentProps<typeof BlockActionMenu>>;
  mediaDialog?: ComponentType<ComponentProps<typeof MediaDialog>>;
  mentionPicker?: ComponentType<ComponentProps<typeof MentionPicker>>;
  historyPanel?: ComponentType<ComponentProps<typeof FolioHistoryPanel>>;
  searchPanel?: ComponentType<ComponentProps<typeof SearchPanel>>;
  commentsPanel?: ComponentType<ComponentProps<typeof FolioCommentsPanel>>;
}
