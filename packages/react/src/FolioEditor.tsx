import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { FocusEvent } from "react";
import type { KeyboardEvent } from "react";
import type { MouseEvent } from "react";
import type { Editor } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
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
  getCurrentBlockElement,
} from "./blocks/blockDom";
import { FolioEditorContext } from "./context";
import { BubbleToolbar } from "./menus/BubbleToolbar";
import { SlashMenu } from "./menus/SlashMenu";
import {
  getSlashMenuCommands,
  getSlashMenuDisplayCommands,
} from "./menus/slashMenuUtils";
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
    Boolean(target.closest('[role="menu"][aria-label="Slash commands"]'))
  );
}

function isBlockSideControlsEventTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    Boolean(target.closest(".folio-block-side-controls"))
  );
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

export function FolioEditor(props: FolioEditorProps) {
  const editor = useFolioEditor(props);
  const rootRef = useRef<HTMLDivElement>(null);
  const slashCommands = useMemo(() => createDefaultFolioCommands(), []);
  const [slashQuery, setSlashQuery] = useState(props.initialSlashQuery);
  const [slashMenuStyle, setSlashMenuStyle] = useState<CSSProperties>();
  const [activeSlashCommandIndex, setActiveSlashCommandIndex] = useState(0);
  const [blockMenuOpen, setBlockMenuOpen] = useState(false);
  const [hoveredBlock, setHoveredBlock] = useState<HTMLElement | null>(null);
  const [focusedBlock, setFocusedBlock] = useState<HTMLElement | null>(null);
  const [editorHasFocus, setEditorHasFocus] = useState(false);
  const [rootHasFocus, setRootHasFocus] = useState(false);
  const [hasTextSelection, setHasTextSelection] = useState(false);
  const activeBlock =
    hoveredBlock ??
    (editorHasFocus || rootHasFocus || blockMenuOpen ? focusedBlock : null);
  const activeMenuQuery = slashQuery ?? (blockMenuOpen ? "/" : undefined);
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

  useEffect(() => {
    if (!editor) return undefined;

    const syncSlashQuery = () => {
      const nextQuery = getActiveSlashQuery(editor);

      setSlashQuery(nextQuery);
      if (nextQuery) {
        setSlashMenuStyle(getSlashMenuPosition(editor, rootRef.current));
        setBlockMenuOpen(false);
        setHoveredBlock(null);
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

      setHasTextSelection(isFormattingTextSelection(selection));
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
  }, [editor]);

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

      setHoveredBlock(null);

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

  const handleMouseMove = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (
        isSlashMenuEventTarget(event.target) ||
        isBlockSideControlsEventTarget(event.target)
      ) {
        return;
      }

      setHoveredBlock(findBlockElement(event.target, editor?.view.dom ?? null));
    },
    [editor],
  );

  const handleMouseLeave = useCallback(() => {
    setHoveredBlock(null);
  }, []);

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
        onKeyDownCapture={handleKeyDownCapture}
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
          onOpenBlockMenu={handleOpenBlockMenu}
          sideControlsClassName={props.classNames?.blockControls}
        />
        {hasTextSelection ? (
          <BubbleToolbar
            className={classNames(
              "folio-editor__bubble-toolbar",
              props.classNames?.bubbleToolbar,
            )}
            editor={editor}
          />
        ) : null}
        <SlashMenu
          className={classNames("folio-editor__slash-menu", props.classNames?.slashMenu)}
          activeIndex={activeSlashCommandIndexForMenu}
          commands={filteredSlashCommands}
          editor={editor}
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
