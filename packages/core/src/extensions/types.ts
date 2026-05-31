import type { Extension } from "@tiptap/core";
import type { FolioJSONContent } from "../document";

export type FolioCommandAction = (context: FolioCommandContext) => boolean;

export interface FolioCommandContext {
  editor: unknown;
  attrs?: Record<string, unknown>;
}

export interface FolioBlockContribution {
  name: string;
  label?: string;
}

export interface FolioMarkContribution {
  name: string;
  label?: string;
}

export type FolioCommandGroup = "Basic" | "Lists" | "Media" | "Advanced";

export type FolioCommandIcon =
  | "Text"
  | "Heading1"
  | "Heading2"
  | "Heading3"
  | "List"
  | "ListOrdered"
  | "ListTodo"
  | "Quote"
  | "Code"
  | "Minus"
  | "Table"
  | "Image"
  | "Bookmark"
  | "PanelTop"
  | "ListTree";

export interface FolioCommandContribution {
  name: string;
  label: string;
  group?: FolioCommandGroup;
  description?: string;
  icon?: FolioCommandIcon;
  keywords?: string[];
  action: FolioCommandAction;
}

export interface FolioRendererContribution {
  type: string;
  render: (node: FolioJSONContent) => unknown;
}

export interface FolioExtension {
  name: string;
  blocks?: FolioBlockContribution[];
  marks?: FolioMarkContribution[];
  commands?: FolioCommandContribution[];
  renderers?: FolioRendererContribution[];
  tiptapExtensions?: Extension[];
}
