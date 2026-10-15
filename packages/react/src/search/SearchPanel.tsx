import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import type { FolioSearchController } from "./useFolioSearch";

export interface FolioSearchLabels {
  title: string;
  find: string;
  replaceWith: string;
  caseSensitive: string;
  wholeWord: string;
  previous: string;
  next: string;
  replace: string;
  replaceAll: string;
  close: string;
  noMatches: string;
  count: string;
  limited: string;
}
const defaults: FolioSearchLabels = {
  title: "Find and replace",
  find: "Find in document",
  replaceWith: "Replace with",
  caseSensitive: "Match case",
  wholeWord: "Whole word",
  previous: "Previous match",
  next: "Next match",
  replace: "Replace",
  replaceAll: "Replace all",
  close: "Close search",
  noMatches: "No matches",
  count: "{current} of {total}",
  limited: "{count}+ matches. Refine your search to replace all.",
};
export interface SearchPanelProps {
  search: FolioSearchController;
  onClose: () => void;
  labels?: Partial<FolioSearchLabels>;
  className?: string;
}

/** Presentation only: the host decides where to render it and handles Ctrl/Cmd+F. */
export function SearchPanel({ search, onClose, labels, className }: SearchPanelProps) {
  const copy = { ...defaults, ...labels };
  const input = useRef<HTMLInputElement>(null);
  const [replacement, setReplacement] = useState("");
  useEffect(() => {
    input.current?.focus();
  }, []);
  const count =
    !search.query || !search.matches.length
      ? copy.noMatches
      : search.truncated
        ? copy.limited.replace("{count}", String(search.matches.length))
        : copy.count
            .replace("{current}", String(search.currentIndex + 1))
            .replace("{total}", String(search.matches.length));
  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
    } else if (event.key === "Enter" && event.target === input.current) {
      event.preventDefault();
      event.stopPropagation();
      if (event.shiftKey) search.previous();
      else search.next();
    }
  }
  return (
    <section
      aria-label={copy.title}
      className={["folio-search-panel", className].filter(Boolean).join(" ")}
      role="search"
    >
      <div className="folio-search-panel__row">
        <input
          ref={input}
          aria-label={copy.find}
          onChange={(event) => search.setQuery(event.currentTarget.value)}
          onKeyDown={onKeyDown}
          placeholder={copy.find}
          type="search"
          value={search.query}
        />
        <button
          aria-label={copy.previous}
          disabled={!search.matches.length}
          onClick={search.previous}
          onKeyDown={onKeyDown}
          type="button"
        >
          ↑
        </button>
        <button
          aria-label={copy.next}
          disabled={!search.matches.length}
          onClick={search.next}
          onKeyDown={onKeyDown}
          type="button"
        >
          ↓
        </button>
        <button aria-label={copy.close} onClick={onClose} onKeyDown={onKeyDown} type="button">
          ×
        </button>
      </div>
      <output aria-live="polite" className="folio-search-panel__count">
        {count}
      </output>
      <div className="folio-search-panel__options">
        <label>
          <input
            checked={search.caseSensitive}
            onKeyDown={onKeyDown}
            onChange={(event) => search.setCaseSensitive(event.currentTarget.checked)}
            type="checkbox"
          />
          {copy.caseSensitive}
        </label>
        <label>
          <input
            checked={search.wholeWord}
            onKeyDown={onKeyDown}
            onChange={(event) => search.setWholeWord(event.currentTarget.checked)}
            type="checkbox"
          />
          {copy.wholeWord}
        </label>
      </div>
      <div className="folio-search-panel__row">
        <input
          aria-label={copy.replaceWith}
          disabled={!search.editable}
          onChange={(event) => setReplacement(event.currentTarget.value)}
          onKeyDown={onKeyDown}
          placeholder={copy.replaceWith}
          type="text"
          value={replacement}
        />
        <button
          disabled={!search.canReplace}
          onClick={() => search.replaceCurrent(replacement)}
          onKeyDown={onKeyDown}
          type="button"
        >
          {copy.replace}
        </button>
        <button
          disabled={!search.canReplaceAll}
          onClick={() => search.replaceAll(replacement)}
          onKeyDown={onKeyDown}
          type="button"
        >
          {copy.replaceAll}
        </button>
      </div>
    </section>
  );
}
