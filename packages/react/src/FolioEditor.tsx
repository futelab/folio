import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { KeyboardEvent } from "react";
import type { Editor } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import {
  createDefaultFolioCommands,
  type FolioCommandContribution,
} from "@futelab/folio-core/browser";
import { BlockControls } from "./blocks/BlockControls";
import { FolioEditorContext } from "./context";
import { BubbleToolbar } from "./menus/BubbleToolbar";
import { SlashMenu } from "./menus/SlashMenu";
import { getSlashMenuCommands } from "./menus/slashMenuUtils";
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

export function FolioEditor(props: FolioEditorProps) {
  const editor = useFolioEditor(props);
  const rootRef = useRef<HTMLDivElement>(null);
  const slashCommands = useMemo(() => createDefaultFolioCommands(), []);
  const [slashQuery, setSlashQuery] = useState(props.initialSlashQuery);
  const [slashMenuStyle, setSlashMenuStyle] = useState<CSSProperties>();
  const [activeSlashCommandIndex, setActiveSlashCommandIndex] = useState(0);
  const filteredSlashCommands = useMemo(
    () => getSlashMenuCommands(slashCommands, slashQuery),
    [slashCommands, slashQuery],
  );
  const activeSlashCommandIndexForMenu = Math.min(
    activeSlashCommandIndex,
    Math.max(filteredSlashCommands.length - 1, 0),
  );

  const closeSlashMenu = useCallback(() => {
    setSlashQuery(undefined);
    setSlashMenuStyle(undefined);
    setActiveSlashCommandIndex(0);
  }, []);

  useEffect(() => {
    if (!editor) return undefined;

    const syncSlashQuery = () => {
      const nextQuery = getActiveSlashQuery(editor);

      setSlashQuery(nextQuery);
      setSlashMenuStyle(
        nextQuery ? getSlashMenuPosition(editor, rootRef.current) : undefined,
      );
      setActiveSlashCommandIndex(0);
    };

    editor.on("update", syncSlashQuery);
    editor.on("selectionUpdate", syncSlashQuery);

    return () => {
      editor.off("update", syncSlashQuery);
      editor.off("selectionUpdate", syncSlashQuery);
    };
  }, [editor]);

  useEffect(() => {
    if (!slashQuery) return undefined;

    const updateSlashMenuPosition = () => {
      setSlashMenuStyle(getSlashMenuPosition(editor, rootRef.current));
    };

    window.addEventListener("resize", updateSlashMenuPosition);
    window.addEventListener("scroll", updateSlashMenuPosition, true);

    return () => {
      window.removeEventListener("resize", updateSlashMenuPosition);
      window.removeEventListener("scroll", updateSlashMenuPosition, true);
    };
  }, [editor, slashQuery]);

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

      if (event.key === "Escape") {
        if (slashQuery) {
          event.preventDefault();
          event.stopPropagation();
          closeSlashMenu();
        }

        return;
      }

      if (!slashQuery || !filteredSlashCommands.length) {
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        event.stopPropagation();
        setActiveSlashCommandIndex(
          (currentIndex) => (currentIndex + 1) % filteredSlashCommands.length,
        );
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        event.stopPropagation();
        setActiveSlashCommandIndex(
          (currentIndex) =>
            (currentIndex - 1 + filteredSlashCommands.length) %
            filteredSlashCommands.length,
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
        setActiveSlashCommandIndex(filteredSlashCommands.length - 1);
        return;
      }

      if (event.key === "Enter") {
        const command = filteredSlashCommands[activeSlashCommandIndexForMenu];

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
      filteredSlashCommands,
      runSlashCommand,
      slashQuery,
    ],
  );

  const handleSlashCommandSelect = useCallback(
    (command: FolioCommandContribution) => {
      runSlashCommand(command);
    },
    [runSlashCommand],
  );

  return (
    <FolioEditorContext.Provider value={{ editor }}>
      <div
        ref={rootRef}
        className={classNames("folio-editor", props.className, props.classNames?.root)}
        data-testid="folio-editor"
        onKeyDownCapture={handleKeyDownCapture}
      >
        <BlockControls
          className={classNames(
            "folio-editor__block-controls",
            props.classNames?.blockControls,
          )}
          editor={editor}
        />
        <EditorContent
          className={classNames("folio-editor__content", props.classNames?.content)}
          editor={editor}
        />
        <BubbleToolbar
          className={classNames(
            "folio-editor__bubble-toolbar",
            props.classNames?.bubbleToolbar,
          )}
          editor={editor}
        />
        <SlashMenu
          className={classNames("folio-editor__slash-menu", props.classNames?.slashMenu)}
          activeIndex={activeSlashCommandIndexForMenu}
          commands={slashCommands}
          editor={editor}
          onActiveIndexChange={setActiveSlashCommandIndex}
          onCommandSelect={handleSlashCommandSelect}
          onRequestClose={closeSlashMenu}
          query={slashQuery}
          style={slashMenuStyle}
        />
      </div>
    </FolioEditorContext.Provider>
  );
}
