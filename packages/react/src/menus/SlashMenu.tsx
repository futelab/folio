import { useMemo } from "react";
import type { CSSProperties } from "react";
import type { KeyboardEvent } from "react";
import type { Editor } from "@tiptap/core";
import { createDefaultFolioCommands } from "@futelab/folio-core/browser";
import type { FolioCommandContribution } from "@futelab/folio-core/browser";
import { getSlashMenuCommands } from "./slashMenuUtils";

export interface SlashMenuProps {
  editor: Editor | null;
  query?: string;
  commands?: FolioCommandContribution[];
  className?: string;
  style?: CSSProperties;
  activeIndex?: number;
  onActiveIndexChange?: (index: number) => void;
  onCommandSelect?: (command: FolioCommandContribution) => void;
  onRequestClose?: () => void;
}

function getMenuItems(menu: HTMLElement): HTMLButtonElement[] {
  return Array.from(
    menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'),
  );
}

function focusMenuItem(
  menu: HTMLElement,
  currentItem: EventTarget | null,
  nextIndex: (currentIndex: number, itemCount: number) => number,
): void {
  const items = getMenuItems(menu);
  if (!items.length) return;

  const currentIndex =
    currentItem instanceof HTMLButtonElement ? items.indexOf(currentItem) : -1;
  const targetIndex = nextIndex(currentIndex, items.length);

  items[targetIndex]?.focus();
}

function handleMenuKeyDown(
  event: KeyboardEvent<HTMLDivElement>,
  onRequestClose?: () => void,
): void {
  const menu = event.currentTarget;

  switch (event.key) {
    case "ArrowDown":
      event.preventDefault();
      focusMenuItem(menu, event.target, (currentIndex, itemCount) =>
        (currentIndex + 1 + itemCount) % itemCount,
      );
      break;
    case "ArrowUp":
      event.preventDefault();
      focusMenuItem(menu, event.target, (currentIndex, itemCount) =>
        (currentIndex - 1 + itemCount) % itemCount,
      );
      break;
    case "Home":
      event.preventDefault();
      focusMenuItem(menu, event.target, () => 0);
      break;
    case "End":
      event.preventDefault();
      focusMenuItem(menu, event.target, (_currentIndex, itemCount) => itemCount - 1);
      break;
    case "Escape":
      event.preventDefault();
      onRequestClose?.();
      if (event.target instanceof HTMLElement) {
        event.target.blur();
      }
      break;
  }
}

export function SlashMenu({
  editor,
  query,
  commands,
  className,
  style,
  activeIndex,
  onActiveIndexChange,
  onCommandSelect,
  onRequestClose,
}: SlashMenuProps) {
  const defaultCommands = useMemo(() => createDefaultFolioCommands(), []);
  const availableCommands = commands ?? defaultCommands;

  const filteredCommands = getSlashMenuCommands(availableCommands, query);

  if (!filteredCommands.length) return null;

  return (
    <div
      aria-label="Slash commands"
      className={className ?? "folio-slash-menu"}
      onKeyDown={(event) => handleMenuKeyDown(event, onRequestClose)}
      role="menu"
      style={style}
    >
      {filteredCommands.map((command, index) => {
        const isActive = index === activeIndex;

        return (
          <button
            aria-selected={isActive ? "true" : undefined}
            className="folio-slash-menu__item"
            data-active={isActive ? "true" : undefined}
            key={command.name}
            onClick={() => {
              if (onCommandSelect) {
                onCommandSelect(command);
                return;
              }

              command.action({ editor });
            }}
            onFocus={() => onActiveIndexChange?.(index)}
            onMouseEnter={() => onActiveIndexChange?.(index)}
            role="menuitem"
            type="button"
          >
            {command.label}
          </button>
        );
      })}
    </div>
  );
}
