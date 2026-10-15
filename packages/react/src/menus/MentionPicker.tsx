import { useId, useRef, useState } from "react";
import type { FolioEditorLabels } from "../editorLabels";
import { useDialogNavigation } from "./useDialogNavigation";

export interface FolioMentionItem {
  id: string;
  label: string;
}
interface MentionPickerProps {
  items: FolioMentionItem[];
  labels: FolioEditorLabels;
  query?: string;
  onSelect: (item: FolioMentionItem) => void;
  onClose: () => void;
}
export function MentionPicker({
  items,
  labels,
  query = "",
  onSelect,
  onClose,
}: MentionPickerProps) {
  const id = useId();
  const panelRef = useDialogNavigation(onClose);
  const inputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState(query);
  const [active, setActive] = useState(0);
  const matches = items.filter(
    (item) =>
      item.label.toLocaleLowerCase().includes(search.toLocaleLowerCase()) ||
      item.id.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
  );
  return (
    <div className="folio-dialog-backdrop">
      <div
        aria-label={labels.mention}
        aria-modal="true"
        className="folio-dialog"
        role="dialog"
        tabIndex={-1}
        ref={panelRef}
      >
        <h2>{labels.mention}</h2>
        <label className="folio-dialog__field">
          {labels.searchMentions}
          <input
            aria-controls={`${id}-results`}
            aria-activedescendant={matches[active] ? `${id}-${active}` : undefined}
            onChange={(event) => {
              setSearch(event.target.value);
              setActive(0);
            }}
            ref={inputRef}
            value={search}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return;
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                setActive((value) =>
                  matches.length
                    ? (value + (event.key === "ArrowDown" ? 1 : -1) + matches.length) %
                      matches.length
                    : 0,
                );
              }
              if (event.key === "Enter" && event.target === inputRef.current) {
                event.preventDefault();
                const item = matches[Math.min(active, matches.length - 1)];
                if (item) onSelect(item);
              }
            }}
          />
        </label>
        <div className="folio-mention-options" id={`${id}-results`} role="listbox">
          {matches.map((item, index) => (
            <button
              aria-selected={index === active}
              id={`${id}-${index}`}
              key={item.id}
              onClick={() => onSelect(item)}
              role="option"
              type="button"
            >
              {item.label}
            </button>
          ))}
          {!matches.length ? <p role="status">{labels.noMentions}</p> : null}
        </div>
        <button onClick={onClose} type="button">
          {labels.cancel}
        </button>
      </div>
    </div>
  );
}
