import { createContext, useContext, useMemo } from "react";
import type { ReactNode, RefObject } from "react";

export interface FolioUIContextValue {
  ownerId: string;
  rootRef: RefObject<HTMLElement | null>;
  portalContainer?: HTMLElement | null;
  /** Runs before a portal control changes focus, allowing selection snapshots. */
  onInteraction?: (event: Event) => void;
}

export interface FolioUIProviderProps extends FolioUIContextValue {
  children: ReactNode;
}

const FolioUIContext = createContext<FolioUIContextValue | null>(null);

export function FolioUIProvider({
  ownerId,
  rootRef,
  portalContainer,
  onInteraction,
  children,
}: FolioUIProviderProps) {
  const value = useMemo(
    () => ({ ownerId, rootRef, portalContainer, onInteraction }),
    [ownerId, rootRef, portalContainer, onInteraction],
  );
  return <FolioUIContext.Provider value={value}>{children}</FolioUIContext.Provider>;
}

export function useFolioUIContext(): FolioUIContextValue | null {
  return useContext(FolioUIContext);
}

/** Includes external portals, and excludes UI owned by a nested editor. */
export function isFolioEditorUIElement(target: EventTarget | null, ownerId: string): boolean {
  if (!target || typeof target !== "object" || !("nodeType" in target)) return false;
  const node = target as Node;
  const element = node.nodeType === 1 ? (node as Element) : node.parentElement;
  return (
    element?.closest("[data-folio-editor-owner]")?.getAttribute("data-folio-editor-owner") ===
    ownerId
  );
}
