import type { Editor, JSONContent } from "@tiptap/core";
import type { CSSProperties, Context, ReactElement, ReactNode } from "react";
import {
  BlockControls as InternalBlockControls,
  BlockInteractionLayer as InternalBlockInteractionLayer,
  BlockSideControls as InternalBlockSideControls,
  BubbleToolbar as InternalBubbleToolbar,
  FolioDragHandle as InternalFolioDragHandle,
  FolioEditor as InternalFolioEditor,
  FolioEditorContext as InternalFolioEditorContext,
  FolioReader as InternalFolioReader,
  SlashMenu as InternalSlashMenu,
  renderFolioNode as internalRenderFolioNode,
  useFolioEditor as internalUseFolioEditor,
  useFolioEditorContext as internalUseFolioEditorContext,
} from "../../react/src";
import type {
  FolioI18nOptions,
  FolioCommandContribution,
  FolioDocument,
  FolioExtension,
  FolioMessages,
} from "./core";

export const folioReactVersion = "0.1.0-alpha.0";

export {
  createFolioMessages,
  defaultFolioTranslations,
} from "./core";

export type {
  BuiltInFolioLocale,
  FolioDeepPartial,
  FolioI18nOptions,
  FolioLocale,
  FolioMessages,
  FolioTranslations,
} from "./core";

export interface BlockControlsProps {
  editor: Editor | null;
  className?: string;
  messages?: FolioMessages;
}

export const BlockControls = InternalBlockControls as (
  props: BlockControlsProps,
) => ReactElement;

export interface BlockInteractionLayerProps {
  activeBlock: HTMLElement | null;
  editorRoot: HTMLElement | null;
  className?: string;
  messages?: FolioMessages;
  sideControlsClassName?: string;
  onOpenBlockMenu: () => void;
}

export const BlockInteractionLayer = InternalBlockInteractionLayer as (
  props: BlockInteractionLayerProps,
) => ReactElement;

export interface BlockSideControlsProps {
  className?: string;
  messages?: FolioMessages;
  style?: CSSProperties;
  visible: boolean;
  onAddBlock: () => void;
}

export const BlockSideControls = InternalBlockSideControls as (
  props: BlockSideControlsProps,
) => ReactElement | null;

export interface FolioDragHandleProps {
  editor: Editor | null;
  className?: string;
  messages?: FolioMessages;
}

export const FolioDragHandle = InternalFolioDragHandle as (
  props: FolioDragHandleProps,
) => ReactElement;

export interface FolioEditorContextValue {
  editor: Editor | null;
}

export const FolioEditorContext =
  InternalFolioEditorContext as Context<FolioEditorContextValue>;

export const useFolioEditorContext = internalUseFolioEditorContext as
  () => FolioEditorContextValue;

export interface UseFolioEditorOptions extends FolioI18nOptions {
  value?: FolioDocument;
  defaultValue?: FolioDocument;
  onChange?: (value: FolioDocument) => void;
  editable?: boolean;
  extensions?: FolioExtension[];
  placeholder?: string;
}

export const useFolioEditor = internalUseFolioEditor as (
  options?: UseFolioEditorOptions,
) => Editor | null;

export interface FolioEditorClassNames {
  root?: string;
  content?: string;
  blockControls?: string;
  bubbleToolbar?: string;
  slashMenu?: string;
}

export interface FolioEditorProps extends UseFolioEditorOptions {
  className?: string;
  classNames?: FolioEditorClassNames;
  initialSlashQuery?: string;
}

export const FolioEditor = InternalFolioEditor as (
  props: FolioEditorProps,
) => ReactElement;

export interface FolioReaderProps {
  value: FolioDocument;
  className?: string;
  classNames?: {
    root?: string;
  };
}

export const FolioReader = InternalFolioReader as (
  props: FolioReaderProps,
) => ReactElement;

export interface BubbleToolbarProps {
  editor: Editor | null;
  className?: string;
  messages?: FolioMessages;
  style?: CSSProperties;
}

export const BubbleToolbar = InternalBubbleToolbar as (
  props: BubbleToolbarProps,
) => ReactElement;

export interface SlashMenuProps {
  editor: Editor | null;
  query?: string;
  commands?: FolioCommandContribution[];
  className?: string;
  messages?: FolioMessages;
  style?: CSSProperties;
  activeIndex?: number;
  onActiveIndexChange?: (index: number) => void;
  onCommandSelect?: (command: FolioCommandContribution) => void;
  onRequestClose?: () => void;
}

export const SlashMenu = InternalSlashMenu as (
  props: SlashMenuProps,
) => ReactElement | null;

export const renderFolioNode = internalRenderFolioNode as (
  node: FolioDocument | JSONContent,
) => ReactNode;
