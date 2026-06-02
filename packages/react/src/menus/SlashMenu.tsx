import { useEffect, useMemo, useRef } from "react";
import type { CSSProperties } from "react";
import type { KeyboardEvent } from "react";
import type { Editor } from "@tiptap/core";
import { createDefaultFolioCommands } from "@futelab/folio-core/browser";
import type { FolioCommandContribution } from "@futelab/folio-core/browser";
import {
  Bookmark,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Image,
  List,
  ListOrdered,
  ListTodo,
  ListTree,
  Minus,
  PanelTop,
  Quote,
  Table,
  Text,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  getSlashMenuCommands,
  groupSlashMenuCommands,
} from "./slashMenuUtils";
import type { FolioMessages } from "../i18n";
import { resolveFolioMessages } from "../i18n";

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

function getMenuItems(menu: HTMLElement): HTMLButtonElement[] {
  return Array.from(
    menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'),
  );
}

const commandIcons = {
  Bookmark,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Image,
  List,
  ListOrdered,
  ListTodo,
  ListTree,
  Minus,
  PanelTop,
  Quote,
  Table,
  Text,
} satisfies Record<
  NonNullable<FolioCommandContribution["icon"]>,
  LucideIcon
>;

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

function getGroupLabel(group: string, messages: FolioMessages): string {
  const groups = messages.ui.slashMenu.groups as Record<string, string>;

  return groups[group] ?? group;
}

export function SlashMenu({
  editor,
  query,
  commands,
  className,
  messages,
  style,
  activeIndex,
  onActiveIndexChange,
  onCommandSelect,
  onRequestClose,
}: SlashMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const resolvedMessages = resolveFolioMessages({ messages });
  const defaultCommands = useMemo(
    () => createDefaultFolioCommands({ messages: resolvedMessages }),
    [resolvedMessages],
  );
  const availableCommands = commands ?? defaultCommands;

  const filteredCommands = getSlashMenuCommands(availableCommands, query);
  const groupedCommands = groupSlashMenuCommands(filteredCommands);
  const displayedCommands = groupedCommands.flatMap((group) => group.commands);

  useEffect(() => {
    if (activeIndex === undefined || !menuRef.current) return;

    const activeItem = getMenuItems(menuRef.current)[activeIndex];

    if (typeof activeItem?.scrollIntoView !== "function") return;

    activeItem.scrollIntoView({ block: "nearest" });
  }, [activeIndex, displayedCommands.length]);

  if (!filteredCommands.length) return null;

  return (
    <div
      aria-label={resolvedMessages.ui.slashMenu.label}
      className={className ?? "folio-slash-menu"}
      onKeyDown={(event) => handleMenuKeyDown(event, onRequestClose)}
      ref={menuRef}
      role="menu"
      style={style}
    >
      {groupedCommands.map((group) => (
        <div className="folio-slash-menu__group" key={group.group}>
          <div className="folio-slash-menu__group-label">
            {getGroupLabel(group.group, resolvedMessages)}
          </div>
          {group.commands.map((command) => {
            const index = displayedCommands.indexOf(command);
            const isActive = index === activeIndex;
            const Icon = command.icon
              ? (commandIcons[command.icon] ?? Text)
              : Text;

            return (
              <button
                aria-label={command.label}
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
                <span className="folio-slash-menu__item-icon">
                  <Icon aria-hidden size={17} />
                </span>
                <span className="folio-slash-menu__item-copy">
                  <span className="folio-slash-menu__item-label">
                    {command.label}
                  </span>
                  {command.description ? (
                    <span className="folio-slash-menu__item-description">
                      {command.description}
                    </span>
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
