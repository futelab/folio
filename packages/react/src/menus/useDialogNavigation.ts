import { useEffect, useRef } from "react";

/** Keeps keyboard navigation inside a modal and restores the invoking control. */
export function useDialogNavigation(onClose: () => void) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const panel = panelRef.current;
    const previous = document.activeElement;
    panel?.querySelector<HTMLInputElement>("input")?.focus();
    function handleKey(event: KeyboardEvent) {
      if (event.isComposing || event.keyCode === 229 || !panel) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeRef.current();
      }
      if (event.key === "Tab") {
        const items = Array.from(
          panel.querySelectorAll<HTMLElement>("button:not(:disabled),input:not(:disabled)"),
        );
        const first = items[0];
        const last = items.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    }
    panel?.addEventListener("keydown", handleKey);
    return () => {
      panel?.removeEventListener("keydown", handleKey);
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);
  return panelRef;
}
