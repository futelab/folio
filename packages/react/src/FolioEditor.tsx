import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CSSProperties } from "react";
import type { DragEvent } from "react";
import type { FocusEvent } from "react";
import type { KeyboardEvent } from "react";
import type { MouseEvent } from "react";
import type { Editor } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import type { Selection } from "@tiptap/pm/state";
import { EditorContent } from "@tiptap/react";
import {
  createDefaultFolioCommands,
  createFolioExtensionRegistry,
  type FolioCommandContribution,
} from "@futelab/folio-core/browser";
import { BlockInteractionLayer } from "./blocks/BlockInteractionLayer";
import {
  getTopLevelBlockPosition,
  getTopLevelBlocks,
  getLayoutBlockPosition,
  moveBlock,
} from "./blocks/blockDrag";
import { useBlockDrag } from "./blocks/useBlockDrag";
import { findBlockElement, getBlockAnchor, getCurrentBlockElement } from "./blocks/blockDom";
import { FolioEditorContext } from "./context";
import { BubbleToolbar } from "./menus/BubbleToolbar";
import { SlashMenu } from "./menus/SlashMenu";
import { getSlashMenuCommands, getSlashMenuDisplayCommands } from "./menus/slashMenuUtils";
import { TableControls } from "./tables/TableControls";
import { resolveFolioMessages } from "./i18n";
import { useFolioEditor } from "./useFolioEditor";
import type { UseFolioEditorOptions } from "./useFolioEditor";
import { resolveEditorLabels, type FolioEditorLabels } from "./editorLabels";
import { MediaDialog, type FolioImageUpload, type FolioMediaKind } from "./menus/MediaDialog";
import { MentionPicker, type FolioMentionItem } from "./menus/MentionPicker";
import {
  BlockActionMenu,
  resolveBlockMenuLabels,
  type FolioBlockMenuLabels,
  type FolioBlockAction,
  type FolioBlockActionValue,
} from "./blocks/BlockActionMenu";
import {
  BlockSelection,
  setBlockSelection,
  clearBlockSelection,
  getSelectedBlocks,
  deleteSelectedBlocks,
  duplicateSelectedBlocks,
  convertSelectedBlocks,
  canConvertSelectedBlocks,
  moveSelectedBlocks,
} from "./blocks/blockSelection";
import { useBlockSelection } from "./blocks/useBlockSelection";
import {
  getSelectedBlockLink,
  writeFolioClipboardText,
  type FolioBlockLinkResolver,
} from "./blocks/blockActions";
import {
  createColumns,
  removeColumns,
  setColumnWidths,
  resolveLayoutBlock,
  moveBlockRange,
} from "./blocks/blockLayout";
import { copyFolioSelection } from "./clipboard";
import { FolioUIProvider, FolioFloatingPortal, isFolioEditorUIElement } from "./ui";
import { useFolioSearch, SearchPanel, type FolioSearchLabels } from "./search";
import {
  useFolioHistory,
  FolioHistoryPanel,
  resolveHistoryLabels,
  type FolioHistoryOptions,
} from "./history";
import { FolioCommentsPanel } from "./comments";
import type {
  FolioEditorComponents,
  FolioEditorUIOptions,
  FolioToolbarAction,
  FolioToolbarMode,
} from "./editorUI";

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
  uploadImage?: FolioImageUpload;
  mentionSuggestions?: FolioMentionItem[];
  labels?: Partial<FolioEditorLabels>;
  blockMenuLabels?: Partial<FolioBlockMenuLabels>;
  ui?: FolioEditorUIOptions;
  components?: FolioEditorComponents;
  portalContainer?: HTMLElement | null;
  getBlockLink?: FolioBlockLinkResolver;
  history?: FolioHistoryOptions;
}

function classNames(...values: Array<string | undefined>): string {
  return values.filter(Boolean).join(" ");
}

function isSlashMenuEventTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    Boolean(
      target.closest('[role="menu"].folio-editor__slash-menu, [role="menu"].folio-slash-menu'),
    )
  );
}

function isBlockSideControlsEventTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest(".folio-block-side-controls"));
}

function isTableControlsEventTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest(".folio-table-controls"));
}

function ownedControl(root: HTMLElement, selector: string): HTMLElement | null {
  const local = root.querySelector<HTMLElement>(selector);
  if (local) return local;
  const owner = root.dataset.folioEditorOwner;
  return (
    Array.from(root.ownerDocument.querySelectorAll<HTMLElement>(selector)).find(
      (element) =>
        element.closest<HTMLElement>("[data-folio-editor-owner]")?.dataset.folioEditorOwner ===
        owner,
    ) ?? null
  );
}

function isPointInBlockControlsBridge(
  point: { clientX: number; clientY: number },
  block: HTMLElement | null,
  root: HTMLElement | null,
): boolean {
  if (!block || !root?.contains(block)) return false;

  const controls = ownedControl(root, ".folio-block-side-controls");

  if (!(controls instanceof HTMLElement)) return false;

  const controlsRect = controls.getBoundingClientRect();
  const anchor = getBlockAnchor(block);
  const anchorRect = anchor.rect;
  const anchorBottom =
    anchor.alignment === "start"
      ? anchorRect.top + Math.min(controlsRect.height, anchorRect.height)
      : anchorRect.bottom;
  const minX = Math.min(controlsRect.right, anchorRect.left) - 2;
  const maxX = Math.max(controlsRect.right, anchorRect.left) + 2;
  const minY = Math.min(controlsRect.top, anchorRect.top) - 6;
  const maxY = Math.max(controlsRect.bottom, anchorBottom) + 6;

  return (
    point.clientX >= minX && point.clientX <= maxX && point.clientY >= minY && point.clientY <= maxY
  );
}

function isPointInTableControlsBridge(
  point: { clientX: number; clientY: number },
  table: HTMLElement | null,
  root: HTMLElement | null,
): boolean {
  if (!table || !root?.contains(table)) return false;

  const controls = ownedControl(root, ".folio-table-controls");

  if (!(controls instanceof HTMLElement)) return false;

  const tableRect = table.getBoundingClientRect();
  const buttons = Array.from(controls.querySelectorAll(".folio-table-controls__button")).filter(
    (button): button is HTMLElement => button instanceof HTMLElement,
  );

  return buttons.some((button) => {
    const buttonRect = button.getBoundingClientRect();
    const minX = Math.min(tableRect.left, buttonRect.left) - 2;
    const maxX = Math.max(tableRect.right, buttonRect.right) + 2;
    const minY = Math.min(tableRect.top, buttonRect.top) - 2;
    const maxY = Math.max(tableRect.bottom, buttonRect.bottom) + 2;

    return (
      point.clientX >= minX &&
      point.clientX <= maxX &&
      point.clientY >= minY &&
      point.clientY <= maxY
    );
  });
}

function getActiveSlashQuery(editor: Editor | null): string | undefined {
  const selection = editor?.state.selection;

  if (!selection?.empty) return undefined;

  const { $from } = selection;
  if (!$from.parent.isTextblock) return undefined;

  const textBeforeCursor = $from.parent.textBetween(0, $from.parentOffset, "\n", "\0");
  const match = /(?:^|\s)\/([^\s/]*)$/.exec(textBeforeCursor);

  return match ? `/${match[1] ?? ""}` : undefined;
}

function deleteActiveSlashQuery(editor: Editor | null): boolean {
  const selection = editor?.state.selection;

  if (!editor || !selection?.empty) return false;

  const { $from } = selection;
  if (!$from.parent.isTextblock) return false;

  const textBeforeCursor = $from.parent.textBetween(0, $from.parentOffset, "\n", "\0");
  const activeQuery = /(?:^|\s)\/([^\s/]*)$/.exec(textBeforeCursor);

  if (!activeQuery) return false;

  const slashIndex = textBeforeCursor.lastIndexOf("/");

  return editor
    .chain()
    .focus()
    .deleteRange({
      from: $from.start() + slashIndex,
      to: $from.pos,
    })
    .run();
}

function getSlashMenuPosition(
  editor: Editor | null,
  rootElement: HTMLElement | null,
): CSSProperties | undefined {
  const selection = editor?.state.selection;

  if (!editor || editor.isDestroyed || !rootElement || !selection?.empty) return undefined;

  const coords = editor.view.coordsAtPos(selection.from);
  const rootRect = rootElement.getBoundingClientRect();
  const scaleX = rootElement.offsetWidth ? rootRect.width / rootElement.offsetWidth || 1 : 1;
  const scaleY = rootElement.offsetHeight ? rootRect.height / rootElement.offsetHeight || 1 : 1;
  const menuWidth = 320;
  const menuMaxHeight = 280;
  const gap = 6;
  const availableWidth = Math.max(rootElement.clientWidth - menuWidth, 0);
  const rawLeft =
    (coords.left - rootRect.left) / scaleX - rootElement.clientLeft + rootElement.scrollLeft;
  const belowTop =
    (coords.bottom - rootRect.top) / scaleY - rootElement.clientTop + rootElement.scrollTop + gap;
  const aboveTop =
    (coords.top - rootRect.top) / scaleY -
    rootElement.clientTop +
    rootElement.scrollTop -
    menuMaxHeight -
    gap;
  const shouldOpenAbove =
    coords.bottom + (menuMaxHeight + gap) * scaleY > window.innerHeight && aboveTop > 0;

  return {
    left: Math.min(Math.max(rawLeft, 0), availableWidth),
    top: shouldOpenAbove ? aboveTop : belowTop,
  };
}

interface SelectionRect {
  bottom: number;
  height: number;
  left: number;
  right: number;
  top: number;
  width: number;
}

function getTextSelectionRect(editor: Editor): SelectionRect | null {
  const ownerDocument = editor.view.dom.ownerDocument;
  const domSelection = ownerDocument.getSelection();

  if (domSelection?.rangeCount) {
    const range = domSelection.getRangeAt(0);
    const ancestor = range.commonAncestorContainer;

    if (editor.view.dom.contains(ancestor)) {
      const rect = range.getBoundingClientRect();

      if (rect.width > 0 || rect.height > 0) {
        return rect;
      }

      const firstRect = Array.from(range.getClientRects()).find(
        (clientRect) => clientRect.width > 0 || clientRect.height > 0,
      );

      if (firstRect) {
        return firstRect;
      }
    }
  }

  const { from, to } = editor.state.selection;
  const start = editor.view.coordsAtPos(from);
  const end = editor.view.coordsAtPos(to);
  const left = Math.min(start.left, end.left);
  const right = Math.max(start.right, end.right);
  const top = Math.min(start.top, end.top);
  const bottom = Math.max(start.bottom, end.bottom);

  return {
    bottom,
    height: bottom - top,
    left,
    right,
    top,
    width: right - left,
  };
}

function getBubbleToolbarPosition(
  editor: Editor | null,
  rootElement: HTMLElement | null,
): CSSProperties | undefined {
  const selection = editor?.state.selection;

  if (
    !editor ||
    editor.isDestroyed ||
    !rootElement ||
    !selection ||
    !isFormattingTextSelection(selection)
  ) {
    return undefined;
  }

  const selectionRect = getTextSelectionRect(editor);

  if (!selectionRect) return undefined;

  const rootRect = rootElement.getBoundingClientRect();
  const scaleX = rootElement.offsetWidth ? rootRect.width / rootElement.offsetWidth || 1 : 1;
  const scaleY = rootElement.offsetHeight ? rootRect.height / rootElement.offsetHeight || 1 : 1;
  const toolbarWidth = 280;
  const toolbarHeight = 38;
  const edgeGap = 8;
  const selectionCenter = selectionRect.left + selectionRect.width / 2;
  const minLeft = toolbarWidth / 2 + edgeGap;
  const maxLeft = Math.max(rootElement.clientWidth - toolbarWidth / 2 - edgeGap, minLeft);
  const left = Math.min(
    Math.max(
      (selectionCenter - rootRect.left) / scaleX - rootElement.clientLeft + rootElement.scrollLeft,
      minLeft,
    ),
    maxLeft,
  );
  const topAbove =
    (selectionRect.top - rootRect.top) / scaleY -
    rootElement.clientTop +
    rootElement.scrollTop -
    edgeGap;
  const hasRoomAbove = selectionRect.top - (toolbarHeight + edgeGap) * scaleY > edgeGap;

  if (hasRoomAbove) {
    return {
      left,
      top: topAbove,
      transform: "translate(-50%, -100%)",
    };
  }

  return {
    left,
    top:
      (selectionRect.bottom - rootRect.top) / scaleY -
      rootElement.clientTop +
      rootElement.scrollTop +
      edgeGap,
    transform: "translate(-50%, 0)",
  };
}

function isFormattingTextSelection(selection: Selection): boolean {
  if (selection.empty || selection instanceof NodeSelection || selection instanceof BlockSelection)
    return false;

  let hasText = false;

  selection.content().content.descendants((node) => {
    if (node.isText && Boolean(node.text?.trim())) {
      hasText = true;
      return false;
    }

    return !hasText;
  });

  return hasText;
}

function runEditorChain(editor: Editor | null, callback: (chain: any) => any): boolean {
  try {
    if (!editor?.isEditable) return false;

    const chain = callback(editor.chain().focus());
    if (!chain || typeof chain.run !== "function") return false;

    const result = chain.run();
    return typeof result === "boolean" ? result : false;
  } catch {
    return false;
  }
}

export function FolioEditor(props: FolioEditorProps) {
  const onError = props.onError;
  const [editorError, setEditorError] = useState<Error>();
  const reportError = useCallback(
    (error: Error) => {
      setEditorError(error);
      onError?.(error);
    },
    [onError],
  );
  const editor = useFolioEditor({
    ...props,
    clipboard: {
      ...props.clipboard,
      uploadImage: props.clipboard?.uploadImage ?? props.uploadImage,
    },
    onError: reportError,
  });
  const writable =
    props.editable !== false && Boolean(editor && !editor.isDestroyed && editor.isEditable);
  const labels = useMemo(
    () => resolveEditorLabels(props.locale, props.labels),
    [props.locale, props.labels],
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const ownerId = useId();
  const { selecting, marqueeRef } = useBlockSelection(
    editor,
    rootRef,
    ownerId,
    writable && props.ui?.blockControls !== false,
  );
  const search = useFolioSearch(editor, { onError: reportError });
  const searchQuerySetter = useRef(search.setQuery);
  searchQuerySetter.current = search.setQuery;
  const [searchOpen, setSearchOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const history = useFolioHistory(editor, props.documentId, props.history, props.extensions);
  const [actionAnchor, setActionAnchor] = useState<HTMLElement | null>(null);
  const blockLabels = useMemo(
    () => resolveBlockMenuLabels(props.locale, props.blockMenuLabels),
    [props.locale, props.blockMenuLabels],
  );
  const chinese = props.locale?.startsWith("zh");
  const featureLabels = {
    find: chinese ? "查找替换" : "Find and replace",
    columns: chinese ? "分栏" : "Columns",
    removeColumns: chinese ? "拆分栏" : "Remove columns",
    widths: chinese ? "列宽" : "Column widths",
    comments: chinese ? "评论" : "Comments",
    history: chinese ? "版本历史" : "Version history",
    comment: chinese ? "添加评论" : "Add comment",
    commentBody: chinese ? "评论内容" : "Comment text",
    close: chinese ? "关闭" : "Close",
    browsing: chinese ? "文档浏览" : "Document browsing",
  };
  const searchLabels: Partial<FolioSearchLabels> | undefined = chinese
    ? {
        title: "查找替换",
        find: "查找内容",
        replaceWith: "替换为",
        caseSensitive: "区分大小写",
        wholeWord: "全词匹配",
        previous: "上一处",
        next: "下一处",
        replace: "替换",
        replaceAll: "全部替换",
        close: "关闭查找",
        noMatches: "无匹配",
        count: "第 {current} / {total} 处",
        limited: "超过 {count} 处，请缩小查找范围",
      }
    : undefined;
  const toolbarMode: FolioToolbarMode = props.ui?.toolbar || "default";
  const toolbarAllows = (action: FolioToolbarAction) =>
    props.ui?.toolbarActions
      ? props.ui.toolbarActions.includes(action)
      : toolbarMode !== "compact" ||
        ["insertBlock", "undo", "redo", "find", "comments", "history"].includes(action);
  const ToolbarSlot = props.components?.toolbar;
  const BubbleSlot = props.components?.bubbleToolbar ?? BubbleToolbar;
  const SlashSlot = props.components?.slashMenu ?? SlashMenu;
  const ActionSlot = props.components?.blockActionMenu ?? BlockActionMenu;
  const MediaSlot = props.components?.mediaDialog ?? MediaDialog;
  const MentionSlot = props.components?.mentionPicker ?? MentionPicker;
  const SearchSlot = props.components?.searchPanel ?? SearchPanel;
  const HistorySlot = props.components?.historyPanel ?? FolioHistoryPanel;
  const CommentsSlot = props.components?.commentsPanel ?? FolioCommentsPanel;
  const {
    draggedBlock,
    indicatorRef,
    start: startBlockDrag,
    end: endBlockDrag,
  } = useBlockDrag(editor, rootRef, writable, props.documentId);
  const messages = useMemo(
    () => resolveFolioMessages({ locale: props.locale, translations: props.translations }),
    [props.locale, props.translations],
  );
  const slashCommands = useMemo(() => {
    const commands = new Map(
      createDefaultFolioCommands({ messages }).map((command) => [command.name, command]),
    );
    const customNames = new Set<string>();
    try {
      for (const command of createFolioExtensionRegistry(props.extensions).commands) {
        commands.set(command.name, command);
        customNames.add(command.name);
      }
    } catch {
      /* useFolioEditor reports invalid extension configuration. */
    }
    return Array.from(commands.values()).filter(
      (command) =>
        command.name !== "mention" ||
        customNames.has(command.name) ||
        Boolean(props.mentionSuggestions?.length),
    );
  }, [messages, props.extensions, props.mentionSuggestions]);
  const [slashQuery, setSlashQuery] = useState(props.initialSlashQuery);
  const [slashMenuStyle, setSlashMenuStyle] = useState<CSSProperties>();
  const [activeSlashCommandIndex, setActiveSlashCommandIndex] = useState(0);
  const [blockMenuOpen, setBlockMenuOpen] = useState(false);
  const [hoveredBlock, setHoveredBlock] = useState<HTMLElement | null>(null);
  const hoveredBlockRef = useRef<HTMLElement | null>(null);
  const [focusedBlock, setFocusedBlock] = useState<HTMLElement | null>(null);
  const [editorHasFocus, setEditorHasFocus] = useState(false);
  const [rootHasFocus, setRootHasFocus] = useState(false);
  const [hasTextSelection, setHasTextSelection] = useState(false);
  const [bubbleToolbarStyle, setBubbleToolbarStyle] = useState<CSSProperties>();
  const [, setTransactionVersion] = useState(0);
  const [mediaDialog, setMediaDialog] = useState<{
    kind: FolioMediaKind;
    initial: Record<string, string>;
    selection: Selection;
    nodePosition?: number;
    originalAttributes: Record<string, unknown>;
    editor: Editor;
  }>();
  const [mentionRange, setMentionRange] = useState<{ from: number; to: number; query: string }>();
  const editorDOM = editor && !editor.isDestroyed ? editor.view.dom : null;
  const connectedHoveredBlock =
    hoveredBlock && editorDOM?.contains(hoveredBlock) ? hoveredBlock : null;
  const connectedFocusedBlock =
    focusedBlock && editorDOM?.contains(focusedBlock) ? focusedBlock : null;
  const activeBlock =
    draggedBlock ??
    connectedHoveredBlock ??
    (editorHasFocus || rootHasFocus || blockMenuOpen || actionAnchor
      ? connectedFocusedBlock
      : null);
  const activeTable = activeBlock?.matches("table") ? activeBlock : null;
  const tableSelectionActive = Boolean(editor?.isActive("table"));
  const selectedMedia =
    editor?.state.selection instanceof NodeSelection &&
    (editor.state.selection.node.type.name === "image" ||
      editor.state.selection.node.type.name === "bookmark")
      ? (editor.state.selection.node.type.name as "image" | "bookmark")
      : undefined;
  const editableMedia =
    selectedMedia ??
    (activeBlock?.matches(".folio-bookmark")
      ? "bookmark"
      : activeBlock?.matches(".folio-image, [data-folio-image]")
        ? "image"
        : undefined);
  const activeMenuQuery =
    hasTextSelection || props.ui?.slashMenu === false
      ? undefined
      : (slashQuery ?? (blockMenuOpen ? "/" : undefined));
  const filteredSlashCommands = useMemo(
    () => getSlashMenuCommands(slashCommands, activeMenuQuery),
    [activeMenuQuery, slashCommands],
  );
  const displayedSlashCommands = useMemo(
    () => getSlashMenuDisplayCommands(filteredSlashCommands),
    [filteredSlashCommands],
  );
  const activeSlashCommandIndexForMenu = Math.min(
    activeSlashCommandIndex,
    Math.max(displayedSlashCommands.length - 1, 0),
  );
  const selectedBlocks = editor ? getSelectedBlocks(editor) : [];
  const selectedFirst = selectedBlocks[0];
  const selectedLast = selectedBlocks.at(-1);
  const selectedParent =
    selectedFirst && editor ? editor.state.doc.resolve(selectedFirst.pos).parent : undefined;
  const canMoveSelectionUp = Boolean(selectedFirst && selectedFirst.index > 0);
  const canMoveSelectionDown = Boolean(
    selectedLast && selectedParent && selectedLast.index + 1 < selectedParent.childCount,
  );
  const activeColumns = (() => {
    if (!editor) return null;
    const { $from } = editor.state.selection;
    if ($from.nodeAfter?.type.name === "columns") return { pos: $from.pos, node: $from.nodeAfter };
    for (let depth = $from.depth; depth > 0; depth--)
      if ($from.node(depth).type.name === "columns")
        return { pos: $from.before(depth), node: $from.node(depth) };
    return null;
  })();
  const columnsLinked = Boolean(
    activeColumns &&
    (activeColumns.node.attrs.folioBlockId ||
      Array.from({ length: activeColumns.node.childCount }, (_, index) =>
        activeColumns.node.child(index),
      ).some((column) => column.attrs.folioBlockId)),
  );
  const closeActions = useCallback(() => {
    setActionAnchor(null);
    if (editor && !editor.isDestroyed) editor.view.dom.focus({ preventScroll: true });
  }, [editor]);
  const closeSearch = () => {
    searchQuerySetter.current("");
    setSearchOpen(false);
    editor?.commands.focus();
  };

  useEffect(() => {
    setMediaDialog(undefined);
    setMentionRange(undefined);
    setActionAnchor(null);
    setSearchOpen(false);
    searchQuerySetter.current("");
    setHistoryOpen(false);
    setCommentsOpen(false);
  }, [editor, props.documentId]);

  useEffect(() => {
    if (props.ui?.search === false) {
      searchQuerySetter.current("");
      setSearchOpen(false);
    }
  }, [props.ui?.search]);

  useEffect(() => {
    if (props.editable === false) {
      setMediaDialog(undefined);
      setMentionRange(undefined);
      setBlockMenuOpen(false);
      setSlashQuery(undefined);
      setActionAnchor(null);
    }
  }, [props.editable]);

  const openMedia = useCallback(
    (kind: FolioMediaKind, editExisting = false) => {
      if (!editor?.isEditable || props.editable === false) return;
      const source = editExisting ? getTopLevelBlockPosition(editor, activeBlock) : null;
      const selection = editor.state.selection;
      const selected =
        editExisting && selection instanceof NodeSelection && selection.node.type.name === kind
          ? { node: selection.node, pos: selection.from }
          : null;
      const existing = selected ?? (source?.node.type.name === kind ? source : null);
      const attributes =
        kind === "link" ? editor.getAttributes("link") : (existing?.node.attrs ?? {});
      const fields =
        kind === "image"
          ? ["src", "alt", "caption"]
          : kind === "bookmark"
            ? ["url", "title", "description"]
            : ["href"];
      const initial = Object.fromEntries(
        fields
          .filter((field) => attributes[field] != null)
          .map((field) => [field, String(attributes[field])]),
      );
      setMediaDialog({
        kind,
        initial,
        originalAttributes: attributes,
        nodePosition: existing?.pos,
        selection: editor.state.selection,
        editor,
      });
    },
    [activeBlock, editor, props.editable],
  );

  const saveMedia = useCallback(
    (attributes: Record<string, string>) => {
      if (!writable || !editor || mediaDialog?.editor !== editor) return false;
      const chain = editor
        .chain()
        .focus()
        .command(({ tr }) => {
          tr.setSelection(mediaDialog.selection);
          return true;
        });
      if (mediaDialog.kind === "link") {
        const range = chain.extendMarkRange("link");
        return attributes.href
          ? range.setLink({ href: attributes.href }).run()
          : range.unsetLink().run();
      }
      if (mediaDialog.nodePosition !== undefined) {
        return chain
          .command(({ tr }) => {
            tr.setNodeMarkup(mediaDialog.nodePosition!, undefined, {
              ...mediaDialog.originalAttributes,
              ...attributes,
            });
            return true;
          })
          .run();
      }
      const content = { type: mediaDialog.kind, attrs: attributes };
      return chain.insertContent(content).run();
    },
    [editor, mediaDialog, writable],
  );

  const moveActiveBlock = useCallback(
    (direction: -1 | 1) => {
      if (!writable || !editor) return;
      const nestedSource = getLayoutBlockPosition(
        editor,
        activeBlock ?? getCurrentBlockElement(editor),
      );
      const nested = nestedSource && resolveLayoutBlock(editor, nestedSource.pos);
      if (nested && nested.parentPos !== null) {
        const parent = editor.state.doc.nodeAt(nested.parentPos);
        if (parent && nested.index + direction >= 0 && nested.index + direction < parent.childCount)
          moveBlockRange(editor, nested, {
            parentPos: nested.parentPos,
            index: nested.index + (direction < 0 ? -1 : 2),
          });
        return;
      }
      if (editor.state.selection instanceof BlockSelection) {
        const blocks = getSelectedBlocks(editor);
        const all = getTopLevelBlocks(editor);
        const first = blocks[0],
          last = blocks.at(-1);
        const target =
          first && last ? all[(direction < 0 ? first.index : last.index) + direction] : undefined;
        if (target)
          moveSelectedBlocks(editor, target.pos + (direction > 0 ? target.node.nodeSize : 0));
        return;
      }
      const source = activeBlock ?? getCurrentBlockElement(editor);
      const position = getTopLevelBlockPosition(editor, source);
      if (!position) return;
      const children = getTopLevelBlocks(editor).map(({ element }) => element);
      const sourceElement =
        source && children.find((child) => child === source || child.contains(source));
      const target = sourceElement ? children[children.indexOf(sourceElement) + direction] : null;
      if (target instanceof HTMLElement) {
        moveBlock(editor, source, target, direction < 0 ? "before" : "after");
        setHoveredBlock(null);
      }
    },
    [activeBlock, editor, writable],
  );

  const closeSlashMenu = useCallback(() => {
    setSlashQuery(undefined);
    setSlashMenuStyle(undefined);
    setBlockMenuOpen(false);
    setActiveSlashCommandIndex(0);
  }, []);

  const handleOpenBlockActions = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      if (!editor || !writable) return;
      const source = getLayoutBlockPosition(editor, activeBlock ?? getCurrentBlockElement(editor));
      if (!source) return;
      const selection = editor.state.selection;
      const inside =
        selection instanceof BlockSelection &&
        source.pos >= selection.from &&
        source.pos < selection.to;
      const topLevel = editor.state.doc.resolve(source.pos).depth === 0;
      if (!topLevel)
        editor.view.dispatch(
          editor.state.tr
            .setSelection(NodeSelection.create(editor.state.doc, source.pos))
            .setMeta("addToHistory", false),
        );
      else if (event.shiftKey && selection instanceof BlockSelection)
        setBlockSelection(editor, selection.anchorBlock, source.pos);
      else if (!inside) setBlockSelection(editor, source.pos);
      closeSlashMenu();
      setActionAnchor(activeBlock ?? event.currentTarget);
    },
    [editor, writable, activeBlock, closeSlashMenu],
  );

  const handleBlockAction = useCallback(
    async (action: FolioBlockAction, value?: FolioBlockActionValue) => {
      if (!editor || editor.isDestroyed || !writable) return;
      try {
        let result = true;
        if (action === "copy") result = await copyFolioSelection(editor);
        else if (action === "duplicate") result = duplicateSelectedBlocks(editor);
        else if (action === "delete") result = deleteSelectedBlocks(editor);
        else if (action === "copyLink")
          await writeFolioClipboardText(
            editor,
            await getSelectedBlockLink(editor, props.documentId, props.getBlockLink),
          );
        else if (action === "moveUp" || action === "moveDown")
          moveActiveBlock(action === "moveUp" ? -1 : 1);
        else if (action === "convert")
          result = Boolean(value?.type && convertSelectedBlocks(editor, value.type, value.attrs));
        else if (action === "color")
          result = value?.color
            ? editor.chain().setColor(value.color).run()
            : editor.chain().unsetColor().run();
        else if (action === "highlight")
          result = value?.color
            ? editor.chain().setHighlight({ color: value.color }).run()
            : editor.chain().unsetHighlight().run();
        if (!result) reportError(new Error(labels.actionFailed));
      } catch (error) {
        reportError(error instanceof Error ? error : new Error(String(error)));
      } finally {
        closeActions();
      }
    },
    [
      editor,
      writable,
      props.documentId,
      props.getBlockLink,
      moveActiveBlock,
      reportError,
      labels.actionFailed,
      closeActions,
    ],
  );

  useEffect(() => {
    if (!actionAnchor || !editor) return;
    const onDown = (event: PointerEvent) => {
      const element = event.target instanceof Element ? event.target : null;
      if (element?.closest(".folio-block-action-menu, .folio-block-side-controls")) return;
      setActionAnchor(null);
    };
    const onTransaction = () => {
      if (
        !(editor.state.selection instanceof BlockSelection) &&
        !(editor.state.selection instanceof NodeSelection)
      )
        setActionAnchor(null);
    };
    const ownerDocument = editor.view.dom.ownerDocument;
    ownerDocument.addEventListener("pointerdown", onDown, true);
    editor.on("transaction", onTransaction);
    return () => {
      ownerDocument.removeEventListener("pointerdown", onDown, true);
      editor.off("transaction", onTransaction);
    };
  }, [actionAnchor, editor]);

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const ownerWindow = editor.view.dom.ownerDocument.defaultView;
    if (!ownerWindow) return;
    const scroll = () => {
      let id: string;
      try {
        id = decodeURIComponent(ownerWindow.location.hash.slice(1));
      } catch {
        return;
      }
      if (!id) return;
      const target = editor.view.dom.ownerDocument.getElementById(id);
      if (target && editor.view.dom.contains(target)) target.scrollIntoView({ block: "center" });
    };
    const frame = ownerWindow.requestAnimationFrame(scroll);
    ownerWindow.addEventListener("hashchange", scroll);
    return () => {
      ownerWindow.cancelAnimationFrame(frame);
      ownerWindow.removeEventListener("hashchange", scroll);
    };
  }, [editor]);

  const updateHoveredBlock = useCallback((block: HTMLElement | null) => {
    hoveredBlockRef.current = block;
    setHoveredBlock(block);
  }, []);

  useEffect(() => {
    if (!editor) return undefined;

    const syncSlashQuery = () => {
      if (!editor.isEditable || props.editable === false) return;
      const nextQuery = getActiveSlashQuery(editor);

      setSlashQuery(nextQuery);
      if (nextQuery) {
        setSlashMenuStyle(getSlashMenuPosition(editor, rootRef.current));
        setBlockMenuOpen(false);
        updateHoveredBlock(null);
      }
      setActiveSlashCommandIndex(0);
      if (
        !nextQuery &&
        props.mentionSuggestions?.length &&
        !mediaDialog &&
        !mentionRange &&
        editor.state.selection.empty &&
        editor.view.composing === false
      ) {
        const { $from } = editor.state.selection;
        if ($from.parent.isTextblock) {
          const match = /(?:^|\s)@([^\s@]*)$/u.exec(
            $from.parent.textBetween(0, $from.parentOffset),
          );
          if (match)
            setMentionRange({
              from: $from.pos - (match[1]?.length ?? 0) - 1,
              to: $from.pos,
              query: match[1] ?? "",
            });
        }
      }
    };

    const syncFocusedBlock = () => {
      setFocusedBlock(getCurrentBlockElement(editor));
    };

    const syncEditorFocus = () => {
      setEditorHasFocus(editor.isFocused);
    };

    const syncSelectionState = () => {
      setTransactionVersion((version) => version + 1);
      const selection = editor.state.selection;
      const nextHasTextSelection = isFormattingTextSelection(selection);

      if (nextHasTextSelection) {
        closeSlashMenu();
      }

      setHasTextSelection(nextHasTextSelection);
      setBubbleToolbarStyle(
        nextHasTextSelection ? getBubbleToolbarPosition(editor, rootRef.current) : undefined,
      );
    };

    editor.on("update", syncSlashQuery);
    editor.on("update", syncFocusedBlock);
    editor.on("focus", syncFocusedBlock);
    editor.on("focus", syncEditorFocus);
    editor.on("blur", syncEditorFocus);
    editor.on("selectionUpdate", syncSlashQuery);
    editor.on("selectionUpdate", syncFocusedBlock);
    editor.on("selectionUpdate", syncSelectionState);
    editor.on("transaction", syncSelectionState);

    syncFocusedBlock();
    syncEditorFocus();
    syncSelectionState();

    return () => {
      editor.off("update", syncSlashQuery);
      editor.off("update", syncFocusedBlock);
      editor.off("focus", syncFocusedBlock);
      editor.off("focus", syncEditorFocus);
      editor.off("blur", syncEditorFocus);
      editor.off("selectionUpdate", syncSlashQuery);
      editor.off("selectionUpdate", syncFocusedBlock);
      editor.off("selectionUpdate", syncSelectionState);
      editor.off("transaction", syncSelectionState);
    };
  }, [
    closeSlashMenu,
    editor,
    updateHoveredBlock,
    props.editable,
    props.mentionSuggestions,
    mediaDialog,
    mentionRange,
  ]);

  useEffect(() => {
    if (!activeMenuQuery) return undefined;

    const updateSlashMenuPosition = () => {
      setSlashMenuStyle(getSlashMenuPosition(editor, rootRef.current));
    };

    window.addEventListener("resize", updateSlashMenuPosition);
    window.addEventListener("scroll", updateSlashMenuPosition, true);

    return () => {
      window.removeEventListener("resize", updateSlashMenuPosition);
      window.removeEventListener("scroll", updateSlashMenuPosition, true);
    };
  }, [activeMenuQuery, editor]);

  useEffect(() => {
    if (!activeMenuQuery) return undefined;

    const ownerDocument = rootRef.current?.ownerDocument ?? document;

    const closeOnOutsidePointerDown = (event: PointerEvent) => {
      const root = rootRef.current;
      const target = event.target;

      if (
        !root ||
        !(target instanceof Node) ||
        root.contains(target) ||
        isFolioEditorUIElement(target, ownerId)
      ) {
        return;
      }

      closeSlashMenu();
    };

    ownerDocument.addEventListener("pointerdown", closeOnOutsidePointerDown, true);

    return () => {
      ownerDocument.removeEventListener("pointerdown", closeOnOutsidePointerDown, true);
    };
  }, [activeMenuQuery, closeSlashMenu, ownerId]);

  useEffect(() => {
    if (!hasTextSelection) return undefined;

    const updateBubbleToolbarPosition = () => {
      setBubbleToolbarStyle(getBubbleToolbarPosition(editor, rootRef.current));
    };

    window.addEventListener("resize", updateBubbleToolbarPosition);
    window.addEventListener("scroll", updateBubbleToolbarPosition, true);

    return () => {
      window.removeEventListener("resize", updateBubbleToolbarPosition);
      window.removeEventListener("scroll", updateBubbleToolbarPosition, true);
    };
  }, [editor, hasTextSelection]);

  const runSlashCommand = useCallback(
    (command: FolioCommandContribution) => {
      if (!editor?.isEditable || props.editable === false) return;
      deleteActiveSlashQuery(editor);
      closeSlashMenu();
      const customCommand = props.extensions?.some((extension) =>
        extension.commands?.some((item) => item.name === command.name),
      );
      if (!customCommand && (command.name === "image" || command.name === "bookmark")) {
        openMedia(command.name);
        return;
      }
      if (!customCommand && command.name === "mention") {
        setMentionRange({
          from: editor.state.selection.from,
          to: editor.state.selection.to,
          query: "",
        });
        return;
      }
      try {
        if (!command.action({ editor })) reportError(new Error(labels.actionFailed));
      } catch (error) {
        reportError(error instanceof Error ? error : new Error(String(error)));
      }
    },
    [
      closeSlashMenu,
      editor,
      labels.actionFailed,
      openMedia,
      props.editable,
      props.extensions,
      reportError,
    ],
  );

  const handleKeyDownCapture = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.nativeEvent.isComposing || event.keyCode === 229 || editor?.view.composing) return;
      if (
        (event.ctrlKey || event.metaKey) &&
        !event.altKey &&
        event.key.toLowerCase() === "f" &&
        props.ui?.search !== false
      ) {
        event.preventDefault();
        event.stopPropagation();
        setSearchOpen(true);
        return;
      }
      if (!writable || (event.target instanceof Element && event.target.closest('[role="dialog"]')))
        return;
      if (
        event.target instanceof Element &&
        event.target.closest(".folio-search-panel, .folio-block-action-menu, .folio-comments-panel")
      )
        return;
      if (isSlashMenuEventTarget(event.target)) {
        return;
      }
      if (
        event.target !== event.currentTarget &&
        event.target instanceof Node &&
        !editor?.view.dom.contains(event.target)
      )
        return;

      if (
        event.altKey &&
        event.shiftKey &&
        (event.key === "ArrowUp" || event.key === "ArrowDown")
      ) {
        event.preventDefault();
        event.stopPropagation();
        moveActiveBlock(event.key === "ArrowUp" ? -1 : 1);
        return;
      }
      updateHoveredBlock(null);

      if (editor && !activeMenuQuery && editor.state.selection instanceof BlockSelection) {
        const selection = editor.state.selection;
        const blocks = getTopLevelBlocks(editor);
        let handled = true;
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a")
          setBlockSelection(editor, 0, blocks.at(-1)?.pos ?? 0);
        else if (event.key === "Delete" || event.key === "Backspace") deleteSelectedBlocks(editor);
        else if (event.key === "Escape" || event.key === "Enter") {
          clearBlockSelection(editor);
          editor.view.focus();
        } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
          const index = blocks.findIndex((block) => block.pos === selection.headBlock);
          const head = blocks[index + (event.key === "ArrowUp" ? -1 : 1)];
          if (head)
            setBlockSelection(editor, event.shiftKey ? selection.anchorBlock : head.pos, head.pos);
        } else handled = false;
        if (handled) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
      }

      if (event.key === "Escape") {
        if (activeMenuQuery) {
          event.preventDefault();
          event.stopPropagation();
          closeSlashMenu();
        } else if (editor) {
          const block = getTopLevelBlockPosition(editor, getCurrentBlockElement(editor));
          if (block) {
            setBlockSelection(editor, block.pos);
            event.preventDefault();
            event.stopPropagation();
          }
        }

        return;
      }

      if (!activeMenuQuery || !displayedSlashCommands.length) {
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        event.stopPropagation();
        setActiveSlashCommandIndex(
          (currentIndex) => (currentIndex + 1) % displayedSlashCommands.length,
        );
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        event.stopPropagation();
        setActiveSlashCommandIndex(
          (currentIndex) =>
            (currentIndex - 1 + displayedSlashCommands.length) % displayedSlashCommands.length,
        );
        return;
      }

      if (event.key === "Home") {
        event.preventDefault();
        event.stopPropagation();
        setActiveSlashCommandIndex(0);
        return;
      }

      if (event.key === "End") {
        event.preventDefault();
        event.stopPropagation();
        setActiveSlashCommandIndex(displayedSlashCommands.length - 1);
        return;
      }

      if (event.key === "Enter") {
        const command = displayedSlashCommands[activeSlashCommandIndexForMenu];

        if (command) {
          event.preventDefault();
          event.stopPropagation();
          runSlashCommand(command);
        }
      }
    },
    [
      activeSlashCommandIndexForMenu,
      closeSlashMenu,
      displayedSlashCommands,
      runSlashCommand,
      activeMenuQuery,
      updateHoveredBlock,
      writable,
      editor,
      moveActiveBlock,
      props.ui?.search,
    ],
  );

  const handleSlashCommandSelect = useCallback(
    (command: FolioCommandContribution) => {
      runSlashCommand(command);
    },
    [runSlashCommand],
  );

  const handleOpenBlockMenu = useCallback(() => {
    if (!writable || !editor) return;
    const source = getTopLevelBlockPosition(editor, activeBlock ?? getCurrentBlockElement(editor));
    const position = source ? source.pos + source.node.nodeSize : editor.state.doc.content.size;
    if (
      !editor
        .chain()
        .focus()
        .insertContentAt(position, { type: "paragraph" })
        .setTextSelection(position + 1)
        .run()
    )
      return;
    setFocusedBlock(getCurrentBlockElement(editor));
    updateHoveredBlock(null);
    setBlockMenuOpen(true);
    setSlashQuery(undefined);
    setSlashMenuStyle(getSlashMenuPosition(editor, rootRef.current));
    setActiveSlashCommandIndex(0);
  }, [activeBlock, editor, updateHoveredBlock, writable]);

  const focusLastTableCell = useCallback(() => {
    if (!writable || !editor || !activeTable) return false;
    const row =
      activeTable instanceof HTMLTableElement
        ? activeTable.rows.item(activeTable.rows.length - 1)
        : null;
    const lastCell = row?.cells.item(row.cells.length - 1);
    if (!lastCell) return false;
    return editor
      .chain()
      .focus()
      .setTextSelection(editor.view.posAtDOM(lastCell, 0) + 1)
      .run();
  }, [activeTable, editor, writable]);

  const handleAddTableRow = useCallback(() => {
    if (focusLastTableCell()) runEditorChain(editor, (chain) => chain.addRowAfter());
  }, [editor, focusLastTableCell]);

  const handleAddTableColumn = useCallback(() => {
    if (focusLastTableCell()) runEditorChain(editor, (chain) => chain.addColumnAfter());
  }, [editor, focusLastTableCell]);

  const handleDragBlockStart = useCallback(
    (event: DragEvent<HTMLButtonElement>) => {
      closeSlashMenu();
      setActionAnchor(null);
      startBlockDrag(event, activeBlock);
    },
    [activeBlock, startBlockDrag, closeSlashMenu],
  );

  const handleMouseDownCapture = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (
        !blockMenuOpen ||
        isSlashMenuEventTarget(event.target) ||
        isBlockSideControlsEventTarget(event.target) ||
        isTableControlsEventTarget(event.target)
      ) {
        return;
      }

      if (event.target instanceof Node && editor?.view.dom.contains(event.target)) {
        closeSlashMenu();
      }
    },
    [blockMenuOpen, closeSlashMenu, editor],
  );

  const handleMouseMove = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (draggedBlock || actionAnchor) return;
      if (
        isSlashMenuEventTarget(event.target) ||
        isBlockSideControlsEventTarget(event.target) ||
        isTableControlsEventTarget(event.target) ||
        (event.target instanceof Element && Boolean(event.target.closest(".folio-editor-actions")))
      ) {
        return;
      }

      let nextBlock = findBlockElement(event.target, editor?.view.dom ?? null);
      if (
        !nextBlock &&
        event.target instanceof Element &&
        event.target.closest(".folio-block-selection-gutter") &&
        editor
      ) {
        nextBlock =
          getTopLevelBlocks(editor).find(({ element }) => {
            const rect = element.getBoundingClientRect();
            return event.clientY >= rect.top - 4 && event.clientY <= rect.bottom + 4;
          })?.element ?? null;
      }

      const currentBlock = hoveredBlockRef.current;
      // A nested block's gutter belongs to its parent in the DOM. Keep the
      // hovered block while crossing to its controls instead of selecting that
      // parent; a real sibling block must still become the next hover target.
      if (
        (!nextBlock ||
          nextBlock === currentBlock ||
          (currentBlock && nextBlock.contains(currentBlock))) &&
        isPointInBlockControlsBridge(event, currentBlock, rootRef.current)
      ) {
        return;
      }

      if (nextBlock) {
        updateHoveredBlock(nextBlock);
        return;
      }

      if (isPointInTableControlsBridge(event, activeTable, rootRef.current)) {
        return;
      }

      updateHoveredBlock(null);
    },
    [activeTable, draggedBlock, actionAnchor, editor, updateHoveredBlock],
  );

  const handleMouseLeave = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (draggedBlock || actionAnchor) return;
      if (isFolioEditorUIElement(event.relatedTarget, ownerId)) return;
      if (
        isPointInBlockControlsBridge(event, hoveredBlockRef.current, rootRef.current) ||
        isPointInTableControlsBridge(event, activeTable, rootRef.current)
      ) {
        return;
      }

      updateHoveredBlock(null);
    },
    [activeTable, draggedBlock, actionAnchor, updateHoveredBlock, ownerId],
  );

  const handleFocusCapture = useCallback(() => {
    setRootHasFocus(true);
  }, []);

  const handleBlurCapture = useCallback(
    (event: FocusEvent<HTMLDivElement>) => {
      const nextFocusedElement = event.relatedTarget;

      if (
        nextFocusedElement instanceof Node &&
        (event.currentTarget.contains(nextFocusedElement) ||
          isFolioEditorUIElement(nextFocusedElement, ownerId))
      ) {
        return;
      }

      setRootHasFocus(false);
    },
    [ownerId],
  );

  const defaultToolbar =
    writable && editor ? (
      <div
        aria-label={labels.actions}
        className={`folio-editor-actions folio-editor-actions--${toolbarMode}`}
        role="toolbar"
        tabIndex={-1}
        onMouseDown={(event) => {
          if (event.target instanceof Element && event.target.closest("button"))
            event.preventDefault();
        }}
      >
        {toolbarAllows("insertBlock") ? (
          <button onClick={handleOpenBlockMenu} type="button">
            {messages.ui.blockControls.insertBlock}
          </button>
        ) : null}
        {toolbarAllows("undo") ? (
          <button
            disabled={!editor.can().undo()}
            onClick={() => editor.chain().focus().undo().run()}
            type="button"
          >
            {labels.undo}
          </button>
        ) : null}
        {toolbarAllows("redo") ? (
          <button
            disabled={!editor.can().redo()}
            onClick={() => editor.chain().focus().redo().run()}
            type="button"
          >
            {labels.redo}
          </button>
        ) : null}
        {toolbarAllows("image") ? (
          <button onClick={() => openMedia("image")} type="button">
            {labels.image}
          </button>
        ) : null}
        {toolbarAllows("bookmark") ? (
          <button onClick={() => openMedia("bookmark")} type="button">
            {labels.bookmark}
          </button>
        ) : null}
        {toolbarAllows("link") ? (
          <button onClick={() => openMedia("link")} type="button">
            {labels.link}
          </button>
        ) : null}
        {toolbarAllows("mention") && props.mentionSuggestions?.length ? (
          <button
            onClick={() =>
              setMentionRange({
                from: editor.state.selection.from,
                to: editor.state.selection.to,
                query: "",
              })
            }
            type="button"
          >
            {labels.mention}
          </button>
        ) : null}
        {toolbarAllows("editMedia") && editableMedia ? (
          <button onClick={() => openMedia(editableMedia, true)} type="button">
            {labels.editMedia}
          </button>
        ) : null}
        {toolbarAllows("moveUp") ? (
          <button
            aria-keyshortcuts="Alt+Shift+ArrowUp"
            disabled={!activeBlock}
            onClick={() => moveActiveBlock(-1)}
            type="button"
          >
            {labels.moveUp}
          </button>
        ) : null}
        {toolbarAllows("moveDown") ? (
          <button
            aria-keyshortcuts="Alt+Shift+ArrowDown"
            disabled={!activeBlock}
            onClick={() => moveActiveBlock(1)}
            type="button"
          >
            {labels.moveDown}
          </button>
        ) : null}
        {toolbarAllows("table") && tableSelectionActive ? (
          <div aria-label={labels.tableActions} className="folio-table-actions" role="group">
            {(
              [
                [labels.deleteRow, "deleteRow"],
                [labels.deleteColumn, "deleteColumn"],
                [labels.headerRow, "toggleHeaderRow"],
                [labels.headerColumn, "toggleHeaderColumn"],
                [labels.mergeCells, "mergeCells"],
                [labels.splitCell, "splitCell"],
                [labels.deleteTable, "deleteTable"],
              ] as const
            ).map(([label, command]) => (
              <button
                disabled={!editor.can()[command]()}
                key={command}
                onClick={() => {
                  if (!runEditorChain(editor, (chain) => chain[command]()))
                    reportError(new Error(labels.actionFailed));
                }}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>
        ) : null}
        {toolbarAllows("find") && props.ui?.search !== false ? (
          <button onClick={() => setSearchOpen(true)} type="button">
            {featureLabels.find}
          </button>
        ) : null}
        {toolbarAllows("layout") ? (
          <div className="folio-layout-actions" role="group" aria-label={featureLabels.columns}>
            <button
              onClick={() => {
                if (!createColumns(editor, 2)) reportError(new Error(labels.actionFailed));
              }}
              type="button"
            >
              {chinese ? "两栏" : "2 columns"}
            </button>
            <button
              onClick={() => {
                if (!createColumns(editor, 3)) reportError(new Error(labels.actionFailed));
              }}
              type="button"
            >
              {chinese ? "三栏" : "3 columns"}
            </button>
            {activeColumns ? (
              <>
                <button
                  disabled={columnsLinked}
                  title={
                    columnsLinked
                      ? chinese
                        ? "此分栏有块链接，拆分会丢失锚点"
                        : "This layout has linked anchors that would be lost when unwrapped"
                      : undefined
                  }
                  onClick={() => {
                    if (!removeColumns(editor, activeColumns.pos))
                      reportError(new Error(labels.actionFailed));
                  }}
                  type="button"
                >
                  {featureLabels.removeColumns}
                </button>
                <select
                  aria-label={featureLabels.widths}
                  value=""
                  onChange={(event) => {
                    const widths = event.currentTarget.value.split(",").map(Number);
                    if (!setColumnWidths(editor, activeColumns.pos, widths))
                      reportError(new Error(labels.actionFailed));
                  }}
                >
                  <option value="">{featureLabels.widths}</option>
                  {activeColumns.node.childCount === 2 ? (
                    <>
                      <option value="1,1">50 / 50</option>
                      <option value="2,1">67 / 33</option>
                      <option value="1,2">33 / 67</option>
                    </>
                  ) : (
                    <>
                      <option value="1,1,1">33 / 33 / 33</option>
                      <option value="2,1,1">50 / 25 / 25</option>
                      <option value="1,2,1">25 / 50 / 25</option>
                      <option value="1,1,2">25 / 25 / 50</option>
                    </>
                  )}
                </select>
              </>
            ) : null}
          </div>
        ) : null}
        {toolbarAllows("comments") && props.comments ? (
          <button
            aria-expanded={commentsOpen}
            onClick={() => setCommentsOpen((value) => !value)}
            type="button"
          >
            {featureLabels.comments}
          </button>
        ) : null}
        {toolbarAllows("history") && props.history ? (
          <button onClick={() => setHistoryOpen(true)} type="button">
            {featureLabels.history}
          </button>
        ) : null}
      </div>
    ) : null;

  const toolbarContent =
    defaultToolbar ??
    (!writable ? (
      <div className="folio-editor-view-actions" role="toolbar" aria-label={featureLabels.browsing}>
        {toolbarAllows("find") && props.ui?.search !== false ? (
          <button type="button" onClick={() => setSearchOpen(true)}>
            {featureLabels.find}
          </button>
        ) : null}
        {toolbarAllows("comments") && props.comments ? (
          <button
            type="button"
            aria-expanded={commentsOpen}
            onClick={() => setCommentsOpen((value) => !value)}
          >
            {featureLabels.comments}
          </button>
        ) : null}
        {toolbarAllows("history") && props.history ? (
          <button type="button" onClick={() => setHistoryOpen(true)}>
            {featureLabels.history}
          </button>
        ) : null}
      </div>
    ) : null);
  return (
    <FolioEditorContext.Provider value={{ editor }}>
      <FolioUIProvider
        ownerId={ownerId}
        rootRef={rootRef}
        portalContainer={props.portalContainer}
        onInteraction={() => setRootHasFocus(true)}
      >
        <div
          ref={rootRef}
          className={classNames("folio-editor", props.className, props.classNames?.root)}
          data-testid="folio-editor"
          data-folio-editor-owner={ownerId}
          onBlurCapture={handleBlurCapture}
          onFocusCapture={handleFocusCapture}
          onContextMenu={(event) => {
            if (!editor || !writable || !editor.view.dom.contains(event.target as Node)) return;
            if (
              !editor.state.selection.empty &&
              !(editor.state.selection instanceof BlockSelection) &&
              !(editor.state.selection instanceof NodeSelection)
            )
              return;
            const block = findBlockElement(event.target, editor.view.dom);
            const source = getLayoutBlockPosition(editor, block);
            if (!source) return;
            event.preventDefault();
            const selection = editor.state.selection;
            if (editor.state.doc.resolve(source.pos).depth > 0)
              editor.view.dispatch(
                editor.state.tr
                  .setSelection(NodeSelection.create(editor.state.doc, source.pos))
                  .setMeta("addToHistory", false),
              );
            else if (
              !(selection instanceof BlockSelection) ||
              source.pos < selection.from ||
              source.pos >= selection.to
            )
              setBlockSelection(editor, source.pos);
            closeSlashMenu();
            setActionAnchor(block);
          }}
          data-block-dragging={draggedBlock ? "true" : undefined}
          onKeyDownCapture={handleKeyDownCapture}
          onMouseDownCapture={handleMouseDownCapture}
          onMouseLeave={handleMouseLeave}
          onMouseMove={handleMouseMove}
          onPointerDown={(event) => {
            if (event.pointerType === "touch" && writable) {
              const block = findBlockElement(event.target, editor?.view.dom ?? null);
              if (block) updateHoveredBlock(block);
            }
          }}
        >
          {props.ui?.toolbar !== false && editor ? (
            ToolbarSlot ? (
              <ToolbarSlot
                editor={editor}
                mode={toolbarMode}
                messages={messages}
                labels={labels}
                documentId={props.documentId}
              >
                {toolbarContent}
              </ToolbarSlot>
            ) : (
              toolbarContent
            )
          ) : null}
          {editorError ? (
            <div className="folio-editor-error" role="alert">
              {editorError.message}
              <button
                aria-label={labels.cancel}
                onClick={() => setEditorError(undefined)}
                type="button"
              >
                ×
              </button>
            </div>
          ) : null}
          {searchOpen && props.ui?.search !== false ? (
            <FolioFloatingPortal coordinateSpace="viewport">
              <SearchSlot search={search} labels={searchLabels} onClose={closeSearch} />
            </FolioFloatingPortal>
          ) : null}
          {historyOpen && props.history && editor ? (
            <FolioFloatingPortal coordinateSpace="viewport">
              <HistorySlot
                editor={editor}
                history={history}
                labels={resolveHistoryLabels(props.locale)}
                locale={props.locale}
                extensions={props.extensions}
                onClose={() => {
                  setHistoryOpen(false);
                  editor.commands.focus();
                }}
              />
            </FolioFloatingPortal>
          ) : null}
          {commentsOpen && props.comments ? (
            <section className="folio-comments-container">
              <button type="button" onClick={() => setCommentsOpen(false)}>
                {featureLabels.close}
              </button>
              <CommentsSlot
                editor={editor}
                options={props.comments}
                labels={
                  chinese
                    ? {
                        title: "评论",
                        draft: "评论内容",
                        addText: "评论选中文字",
                        addBlock: "评论当前块",
                        reply: "回复",
                        resolve: "解决",
                        reopen: "重新打开",
                        remove: "删除",
                        resolved: "已解决",
                        orphaned: "原文已删除",
                        empty: "暂无评论",
                        pending: "保存评论中…",
                      }
                    : undefined
                }
              />
            </section>
          ) : null}
          {writable && props.ui?.blockControls !== false ? (
            <div aria-hidden="true" className="folio-block-selection-gutter" />
          ) : null}
          {selecting && typeof document !== "undefined"
            ? createPortal(
                <div
                  aria-hidden="true"
                  className="folio-block-selection-marquee"
                  ref={marqueeRef}
                />,
                rootRef.current?.ownerDocument.body ?? document.body,
              )
            : null}
          {writable && editor && actionAnchor ? (
            <FolioFloatingPortal>
              <ActionSlot
                editor={editor}
                open
                anchor={actionAnchor}
                labels={blockLabels}
                selectionCount={selectedBlocks.length}
                canCopyLink={selectedBlocks.length === 1}
                canMoveUp={canMoveSelectionUp}
                canMoveDown={canMoveSelectionDown}
                canConvert={(type, attrs) => canConvertSelectedBlocks(editor, type, attrs)}
                onAction={(action, value) => {
                  void handleBlockAction(action, value);
                }}
                onClose={closeActions}
              />
            </FolioFloatingPortal>
          ) : null}
          <EditorContent
            className={classNames("folio-editor__content", props.classNames?.content)}
            editor={editor}
          />
          {writable && props.ui?.blockControls !== false ? (
            <FolioFloatingPortal>
              <BlockInteractionLayer
                activeBlock={activeBlock}
                editorRoot={rootRef.current}
                messages={messages}
                onDragBlockEnd={endBlockDrag}
                onDragBlockStart={handleDragBlockStart}
                onOpenBlockMenu={handleOpenBlockMenu}
                onOpenBlockActions={handleOpenBlockActions}
                sideControlsClassName={props.classNames?.blockControls}
              />
            </FolioFloatingPortal>
          ) : null}
          {writable ? (
            <div aria-hidden="true" className="folio-block-drag-layer">
              <div
                ref={indicatorRef}
                aria-hidden="true"
                className="folio-block-drop-indicator"
                style={{ visibility: "hidden" }}
              />
            </div>
          ) : null}
          {writable && !draggedBlock && props.ui?.tableControls !== false ? (
            <FolioFloatingPortal>
              <TableControls
                editor={editor}
                editorRoot={rootRef.current}
                messages={messages}
                onAddColumn={handleAddTableColumn}
                onAddRow={handleAddTableRow}
                table={activeTable}
              />
            </FolioFloatingPortal>
          ) : null}
          {writable &&
          props.ui?.bubbleToolbar !== false &&
          !actionAnchor &&
          !draggedBlock &&
          hasTextSelection &&
          !searchOpen &&
          !mediaDialog &&
          !mentionRange ? (
            <FolioFloatingPortal>
              <BubbleSlot
                className={classNames(
                  "folio-editor__bubble-toolbar",
                  props.classNames?.bubbleToolbar,
                )}
                editor={editor}
                messages={messages}
                style={bubbleToolbarStyle}
                labels={labels}
                onEditLink={() => openMedia("link")}
                onError={reportError}
              />
            </FolioFloatingPortal>
          ) : null}
          {props.editable !== false &&
          props.ui?.slashMenu !== false &&
          !actionAnchor &&
          !mediaDialog &&
          !mentionRange ? (
            <FolioFloatingPortal>
              <SlashSlot
                className={classNames("folio-editor__slash-menu", props.classNames?.slashMenu)}
                activeIndex={activeSlashCommandIndexForMenu}
                commands={filteredSlashCommands}
                editor={editor}
                messages={messages}
                onActiveIndexChange={setActiveSlashCommandIndex}
                onCommandSelect={handleSlashCommandSelect}
                onRequestClose={closeSlashMenu}
                query={activeMenuQuery}
                style={slashMenuStyle}
              />
            </FolioFloatingPortal>
          ) : null}
          {writable && mediaDialog ? (
            <FolioFloatingPortal coordinateSpace="viewport">
              <MediaSlot
                initial={mediaDialog.initial}
                kind={mediaDialog.kind}
                labels={labels}
                onClose={() => {
                  setMediaDialog(undefined);
                  editor?.commands.focus();
                }}
                onError={onError}
                onSave={saveMedia}
                uploadImage={props.uploadImage}
              />
            </FolioFloatingPortal>
          ) : null}
          {writable && mentionRange ? (
            <FolioFloatingPortal coordinateSpace="viewport">
              <MentionSlot
                items={props.mentionSuggestions ?? []}
                labels={labels}
                onClose={() => {
                  setMentionRange(undefined);
                  editor?.commands.focus();
                }}
                onSelect={(item) => {
                  if (!editor?.isEditable) return;
                  try {
                    const result = editor
                      .chain()
                      .focus()
                      .deleteRange(mentionRange)
                      .insertContent([
                        { type: "mention", attrs: { id: item.id, label: item.label } },
                        { type: "text", text: " " },
                      ])
                      .run();
                    if (!result) reportError(new Error(labels.actionFailed));
                    setMentionRange(undefined);
                  } catch (error) {
                    reportError(error instanceof Error ? error : new Error(String(error)));
                  }
                }}
                query={mentionRange.query}
              />
            </FolioFloatingPortal>
          ) : null}
        </div>
      </FolioUIProvider>
    </FolioEditorContext.Provider>
  );
}
