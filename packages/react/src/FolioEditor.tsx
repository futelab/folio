import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { DragEvent } from "react";
import type { FocusEvent } from "react";
import type { KeyboardEvent } from "react";
import type { MouseEvent } from "react";
import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import type { Selection } from "@tiptap/pm/state";
import { EditorContent } from "@tiptap/react";
import {
  createDefaultFolioCommands,
  type FolioCommandContribution,
} from "@futelab/folio-core/browser";
import { BlockInteractionLayer } from "./blocks/BlockInteractionLayer";
import {
  findBlockElement,
  focusBlockElement,
  getBlockAnchor,
  getCurrentBlockElement,
} from "./blocks/blockDom";
import { FolioEditorContext } from "./context";
import { BubbleToolbar } from "./menus/BubbleToolbar";
import { SlashMenu } from "./menus/SlashMenu";
import {
  getSlashMenuCommands,
  getSlashMenuDisplayCommands,
} from "./menus/slashMenuUtils";
import { focusTableCell, TableControls } from "./tables/TableControls";
import { resolveFolioMessages } from "./i18n";
import { useFolioEditor } from "./useFolioEditor";
import type { UseFolioEditorOptions } from "./useFolioEditor";

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

function classNames(...values: Array<string | undefined>): string {
  return values.filter(Boolean).join(" ");
}

function isSlashMenuEventTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    Boolean(
      target.closest(
        '[role="menu"].folio-editor__slash-menu, [role="menu"].folio-slash-menu',
      ),
    )
  );
}

function isBlockSideControlsEventTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    Boolean(target.closest(".folio-block-side-controls"))
  );
}

function isTableControlsEventTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    Boolean(target.closest(".folio-table-controls"))
  );
}

function isPointInBlockControlsBridge(
  point: { clientX: number; clientY: number },
  block: HTMLElement | null,
  root: HTMLElement | null,
): boolean {
  if (!block || !root?.contains(block)) return false;

  const controls = root.querySelector(".folio-block-side-controls");

  if (!(controls instanceof HTMLElement)) return false;

  const controlsRect = controls.getBoundingClientRect();
  const anchorRect = getBlockAnchor(block).rect;
  const minX = Math.min(controlsRect.right, anchorRect.left) - 2;
  const maxX = Math.max(controlsRect.right, anchorRect.left) + 2;
  const minY = Math.min(controlsRect.top, anchorRect.top) - 6;
  const maxY = Math.max(controlsRect.bottom, anchorRect.bottom) + 6;

  return (
    point.clientX >= minX &&
    point.clientX <= maxX &&
    point.clientY >= minY &&
    point.clientY <= maxY
  );
}

function isPointInTableControlsBridge(
  point: { clientX: number; clientY: number },
  table: HTMLElement | null,
  root: HTMLElement | null,
): boolean {
  if (!table || !root?.contains(table)) return false;

  const controls = root.querySelector(".folio-table-controls");

  if (!(controls instanceof HTMLElement)) return false;

  const tableRect = table.getBoundingClientRect();
  const buttons = Array.from(
    controls.querySelectorAll(".folio-table-controls__button"),
  ).filter((button): button is HTMLElement => button instanceof HTMLElement);

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

  if (!editor || !rootElement || !selection?.empty) return undefined;

  const coords = editor.view.coordsAtPos(selection.from);
  const rootRect = rootElement.getBoundingClientRect();
  const menuWidth = 320;
  const menuMaxHeight = 280;
  const gap = 6;
  const availableWidth = Math.max(rootElement.clientWidth - menuWidth, 0);
  const rawLeft = coords.left - rootRect.left;
  const belowTop = coords.bottom - rootRect.top + gap;
  const aboveTop = coords.top - rootRect.top - menuMaxHeight - gap;
  const shouldOpenAbove =
    coords.bottom + menuMaxHeight + gap > window.innerHeight && aboveTop > 0;

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

  if (!editor || !rootElement || !selection || !isFormattingTextSelection(selection)) {
    return undefined;
  }

  const selectionRect = getTextSelectionRect(editor);

  if (!selectionRect) return undefined;

  const rootRect = rootElement.getBoundingClientRect();
  const toolbarWidth = 280;
  const toolbarHeight = 38;
  const edgeGap = 8;
  const selectionCenter = selectionRect.left + selectionRect.width / 2;
  const minLeft = toolbarWidth / 2 + edgeGap;
  const maxLeft = Math.max(rootElement.clientWidth - toolbarWidth / 2 - edgeGap, minLeft);
  const left = Math.min(
    Math.max(selectionCenter - rootRect.left, minLeft),
    maxLeft,
  );
  const topAbove = selectionRect.top - rootRect.top - edgeGap;
  const hasRoomAbove = selectionRect.top - toolbarHeight - edgeGap > edgeGap;

  if (hasRoomAbove) {
    return {
      left,
      top: topAbove,
      transform: "translate(-50%, -100%)",
    };
  }

  return {
    left,
    top: selectionRect.bottom - rootRect.top + edgeGap,
    transform: "translate(-50%, 0)",
  };
}

function isFormattingTextSelection(selection: Selection): boolean {
  if (selection.empty || selection instanceof NodeSelection) return false;

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
    if (!editor) return false;

    const chain = callback(editor.chain().focus());
    if (!chain || typeof chain.run !== "function") return false;

    const result = chain.run();
    return typeof result === "boolean" ? result : false;
  } catch {
    return false;
  }
}

interface BlockPosition {
  node: ProseMirrorNode;
  pos: number;
}

function getDocumentInsertPosition(
  source: BlockPosition,
  target: BlockPosition,
  placement: "before" | "after",
): number | null {
  const insertPosition =
    placement === "after" ? target.pos + target.node.nodeSize : target.pos;
  const sourceEnd = source.pos + source.node.nodeSize;

  if (insertPosition >= source.pos && insertPosition <= sourceEnd) {
    return null;
  }

  return insertPosition > source.pos
    ? insertPosition - source.node.nodeSize
    : insertPosition;
}

function getTopLevelBlockPosition(
  editor: Editor | null,
  block: HTMLElement | null,
): BlockPosition | null {
  if (!editor || !block || !editor.view.dom.contains(block)) {
    return null;
  }

  let topLevelBlock: HTMLElement = block;

  while (
    topLevelBlock.parentElement &&
    topLevelBlock.parentElement !== editor.view.dom
  ) {
    topLevelBlock = topLevelBlock.parentElement;
  }

  if (topLevelBlock.parentElement !== editor.view.dom) {
    return null;
  }

  const childIndex = Array.from(editor.view.dom.children).indexOf(topLevelBlock);

  if (childIndex < 0 || childIndex >= editor.state.doc.childCount) {
    return null;
  }

  let pos = 0;

  for (let index = 0; index < childIndex; index += 1) {
    pos += editor.state.doc.child(index).nodeSize;
  }

  return {
    node: editor.state.doc.child(childIndex),
    pos,
  };
}

function getDropTargetBlock(
  event: DragEvent<HTMLElement>,
  editor: Editor | null,
): HTMLElement | null {
  if (!editor) return null;

  const directTarget = findBlockElement(event.target, editor.view.dom);

  if (directTarget) return directTarget;

  const elementAtPoint = editor.view.dom.ownerDocument.elementFromPoint(
    event.clientX,
    event.clientY,
  );

  return findBlockElement(elementAtPoint, editor.view.dom);
}

function getDropPlacement(
  event: DragEvent<HTMLElement>,
  targetBlock: HTMLElement,
): "before" | "after" {
  const targetRect = getBlockAnchor(targetBlock).rect;
  const targetMiddle = targetRect.top + targetRect.height / 2;

  return event.clientY > targetMiddle ? "after" : "before";
}

function moveBlock(
  editor: Editor | null,
  sourceBlock: HTMLElement | null,
  targetBlock: HTMLElement | null,
  placement: "before" | "after",
): boolean {
  if (!editor || !sourceBlock || !targetBlock || sourceBlock === targetBlock) {
    return false;
  }

  const source = getTopLevelBlockPosition(editor, sourceBlock);
  const target = getTopLevelBlockPosition(editor, targetBlock);

  if (!source || !target || source.pos === target.pos) return false;

  const sourceEnd = source.pos + source.node.nodeSize;
  const adjustedInsertPosition = getDocumentInsertPosition(
    source,
    target,
    placement,
  );

  if (adjustedInsertPosition === null) return false;

  try {
    const transaction = editor.state.tr
      .delete(source.pos, sourceEnd)
      .insert(adjustedInsertPosition, source.node);
    const selectionPosition = Math.min(
      adjustedInsertPosition + 1,
      transaction.doc.content.size,
    );

    transaction.setSelection(
      TextSelection.near(transaction.doc.resolve(selectionPosition)),
    );
    editor.view.dispatch(transaction.scrollIntoView());
    editor.view.focus();

    return true;
  } catch {
    return false;
  }
}

export function FolioEditor(props: FolioEditorProps) {
  const editor = useFolioEditor(props);
  const rootRef = useRef<HTMLDivElement>(null);
  const draggedBlockRef = useRef<HTMLElement | null>(null);
  const messages = useMemo(
    () => resolveFolioMessages(props),
    [props.locale, props.translations],
  );
  const slashCommands = useMemo(
    () => createDefaultFolioCommands({ messages }),
    [messages],
  );
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
  const activeBlock =
    hoveredBlock ??
    (editorHasFocus || rootHasFocus || blockMenuOpen ? focusedBlock : null);
  const activeTable =
    activeBlock instanceof HTMLElement && activeBlock.matches("table")
      ? activeBlock
      : null;
  const activeMenuQuery = hasTextSelection
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

  const closeSlashMenu = useCallback(() => {
    setSlashQuery(undefined);
    setSlashMenuStyle(undefined);
    setBlockMenuOpen(false);
    setActiveSlashCommandIndex(0);
  }, []);

  const updateHoveredBlock = useCallback((block: HTMLElement | null) => {
    hoveredBlockRef.current = block;
    setHoveredBlock(block);
  }, []);

  useEffect(() => {
    if (!editor) return undefined;

    const syncSlashQuery = () => {
      const nextQuery = getActiveSlashQuery(editor);

      setSlashQuery(nextQuery);
      if (nextQuery) {
        setSlashMenuStyle(getSlashMenuPosition(editor, rootRef.current));
        setBlockMenuOpen(false);
        updateHoveredBlock(null);
      }
      setActiveSlashCommandIndex(0);
    };

    const syncFocusedBlock = () => {
      setFocusedBlock(getCurrentBlockElement(editor));
    };

    const syncEditorFocus = () => {
      setEditorHasFocus(editor.isFocused);
    };

    const syncSelectionState = () => {
      const selection = editor.state.selection;
      const nextHasTextSelection = isFormattingTextSelection(selection);

      if (nextHasTextSelection) {
        closeSlashMenu();
      }

      setHasTextSelection(nextHasTextSelection);
      setBubbleToolbarStyle(
        nextHasTextSelection
          ? getBubbleToolbarPosition(editor, rootRef.current)
          : undefined,
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
  }, [closeSlashMenu, editor, updateHoveredBlock]);

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

      if (!root || !(target instanceof Node) || root.contains(target)) {
        return;
      }

      closeSlashMenu();
    };

    ownerDocument.addEventListener("pointerdown", closeOnOutsidePointerDown, true);

    return () => {
      ownerDocument.removeEventListener(
        "pointerdown",
        closeOnOutsidePointerDown,
        true,
      );
    };
  }, [activeMenuQuery, closeSlashMenu]);

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
      deleteActiveSlashQuery(editor);
      command.action({ editor });
      closeSlashMenu();
    },
    [closeSlashMenu, editor],
  );

  const handleKeyDownCapture = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (isSlashMenuEventTarget(event.target)) {
        return;
      }

      updateHoveredBlock(null);

      if (event.key === "Escape") {
        if (activeMenuQuery) {
          event.preventDefault();
          event.stopPropagation();
          closeSlashMenu();
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
            (currentIndex - 1 + displayedSlashCommands.length) %
            displayedSlashCommands.length,
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
    ],
  );

  const handleSlashCommandSelect = useCallback(
    (command: FolioCommandContribution) => {
      runSlashCommand(command);
    },
    [runSlashCommand],
  );

  const handleOpenBlockMenu = useCallback(() => {
    focusBlockElement(editor, activeBlock);
    setFocusedBlock(activeBlock);
    setBlockMenuOpen(true);
    setSlashQuery(undefined);
    setSlashMenuStyle(getSlashMenuPosition(editor, rootRef.current));
    setActiveSlashCommandIndex(0);
  }, [activeBlock, editor]);

  const handleAddTableRow = useCallback(() => {
    focusTableCell(editor, activeTable);
    runEditorChain(editor, (chain) => chain.addRowAfter());
  }, [activeTable, editor]);

  const handleAddTableColumn = useCallback(() => {
    focusTableCell(editor, activeTable);
    runEditorChain(editor, (chain) => chain.addColumnAfter());
  }, [activeTable, editor]);

  const handleDragBlockStart = useCallback(
    (event: DragEvent<HTMLButtonElement>) => {
      if (!editor || !activeBlock) {
        event.preventDefault();
        return;
      }

      draggedBlockRef.current = activeBlock;
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("application/x-folio-block", "move");
    },
    [activeBlock, editor],
  );

  const handleDragBlockEnd = useCallback(() => {
    draggedBlockRef.current = null;
  }, []);

  const handleDragOver = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (!draggedBlockRef.current || !editor) return;

      const targetBlock = getDropTargetBlock(event, editor);

      if (!targetBlock || targetBlock === draggedBlockRef.current) return;

      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
    },
    [editor],
  );

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      const sourceBlock = draggedBlockRef.current;

      if (!sourceBlock || !editor) return;

      const targetBlock = getDropTargetBlock(event, editor);

      if (!targetBlock) return;

      event.preventDefault();
      event.stopPropagation();

      const moved = moveBlock(
        editor,
        sourceBlock,
        targetBlock,
        getDropPlacement(event, targetBlock),
      );

      draggedBlockRef.current = null;

      if (moved) {
        updateHoveredBlock(targetBlock);
      }
    },
    [editor, updateHoveredBlock],
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
      if (
        isSlashMenuEventTarget(event.target) ||
        isBlockSideControlsEventTarget(event.target) ||
        isTableControlsEventTarget(event.target)
      ) {
        return;
      }

      const nextBlock = findBlockElement(event.target, editor?.view.dom ?? null);

      if (nextBlock) {
        updateHoveredBlock(nextBlock);
        return;
      }

      if (
        isPointInBlockControlsBridge(
          event,
          hoveredBlockRef.current,
          rootRef.current,
        ) ||
        isPointInTableControlsBridge(event, activeTable, rootRef.current)
      ) {
        return;
      }

      updateHoveredBlock(null);
    },
    [activeTable, editor, updateHoveredBlock],
  );

  const handleMouseLeave = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (
        isPointInBlockControlsBridge(
          event,
          hoveredBlockRef.current,
          rootRef.current,
        ) ||
        isPointInTableControlsBridge(event, activeTable, rootRef.current)
      ) {
        return;
      }

      updateHoveredBlock(null);
    },
    [activeTable, updateHoveredBlock],
  );

  const handleFocusCapture = useCallback(() => {
    setRootHasFocus(true);
  }, []);

  const handleBlurCapture = useCallback((event: FocusEvent<HTMLDivElement>) => {
    const nextFocusedElement = event.relatedTarget;

    if (
      nextFocusedElement instanceof Node &&
      event.currentTarget.contains(nextFocusedElement)
    ) {
      return;
    }

    setRootHasFocus(false);
  }, []);

  return (
    <FolioEditorContext.Provider value={{ editor }}>
      <div
        ref={rootRef}
        className={classNames("folio-editor", props.className, props.classNames?.root)}
        data-testid="folio-editor"
        onBlurCapture={handleBlurCapture}
        onFocusCapture={handleFocusCapture}
        onDragOverCapture={handleDragOver}
        onDropCapture={handleDrop}
        onKeyDownCapture={handleKeyDownCapture}
        onMouseDownCapture={handleMouseDownCapture}
        onMouseLeave={handleMouseLeave}
        onMouseMove={handleMouseMove}
      >
        <EditorContent
          className={classNames("folio-editor__content", props.classNames?.content)}
          editor={editor}
        />
        <BlockInteractionLayer
          activeBlock={activeBlock}
          editorRoot={rootRef.current}
          messages={messages}
          onDragBlockEnd={handleDragBlockEnd}
          onDragBlockStart={handleDragBlockStart}
          onOpenBlockMenu={handleOpenBlockMenu}
          sideControlsClassName={props.classNames?.blockControls}
        />
        <TableControls
          editor={editor}
          editorRoot={rootRef.current}
          messages={messages}
          onAddColumn={handleAddTableColumn}
          onAddRow={handleAddTableRow}
          table={activeTable}
        />
        {hasTextSelection ? (
          <BubbleToolbar
            className={classNames(
              "folio-editor__bubble-toolbar",
              props.classNames?.bubbleToolbar,
            )}
            editor={editor}
            messages={messages}
            style={bubbleToolbarStyle}
          />
        ) : null}
        <SlashMenu
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
      </div>
    </FolioEditorContext.Provider>
  );
}
