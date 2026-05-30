import { useMemo } from "react";
import type { KeyboardEvent } from "react";
import type { Editor } from "@tiptap/core";
import { createDefaultFolioCommands } from "@futelab/folio-core/browser";
import type { FolioCommandContribution } from "@futelab/folio-core/browser";

export interface SlashMenuProps {
  editor: Editor | null;
  query?: string;
  commands?: FolioCommandContribution[];
  className?: string;
}

function normalizeSlashQuery(query: string): string {
  return query.replace(/^\//, "").trim().toLowerCase();
}

function commandMatchesQuery(
  command: FolioCommandContribution,
  query: string,
): boolean {
  if (!query) return true;

  const searchableText = [
    command.label,
    command.name,
    ...(command.keywords ?? []),
  ].map((value) => value.toLowerCase());

  return searchableText.some((value) => value.includes(query));
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

function handleMenuKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
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
}: SlashMenuProps) {
  const defaultCommands = useMemo(() => createDefaultFolioCommands(), []);
  const availableCommands = commands ?? defaultCommands;

  if (!query?.startsWith("/")) {
    return null;
  }

  const normalizedQuery = normalizeSlashQuery(query);
  const filteredCommands = availableCommands.filter((command) =>
    commandMatchesQuery(command, normalizedQuery),
  );

  return (
    <div
      aria-label="Slash commands"
      className={className ?? "folio-slash-menu"}
      onKeyDown={handleMenuKeyDown}
      role="menu"
    >
      {filteredCommands.map((command) => (
        <button
          className="folio-slash-menu__item"
          key={command.name}
          onClick={() => command.action({ editor })}
          role="menuitem"
          type="button"
        >
          {command.label}
        </button>
      ))}
    </div>
  );
}
