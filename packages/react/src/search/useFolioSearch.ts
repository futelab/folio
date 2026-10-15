import { useCallback, useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { closeHistory } from "@tiptap/pm/history";
import { Plugin, PluginKey, TextSelection, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { defaultFolioDocumentLimits } from "@futelab/folio-core/browser";

export interface FolioSearchMatch {
  from: number;
  to: number;
}
export interface FolioSearchOptions {
  /** Defaults to 2000, capped at 10000. Refine the query when results are truncated. */
  maxMatches?: number;
  onError?: (error: Error) => void;
}
export interface FolioSearchSnapshot {
  query: string;
  caseSensitive: boolean;
  wholeWord: boolean;
  matches: readonly FolioSearchMatch[];
  /** Zero-based, or -1 when there are no matches. */
  currentIndex: number;
  truncated: boolean;
  editable: boolean;
}
export interface FolioSearchController extends FolioSearchSnapshot {
  setQuery: (query: string) => void;
  setCaseSensitive: (enabled: boolean) => void;
  setWholeWord: (enabled: boolean) => void;
  next: () => boolean;
  previous: () => boolean;
  replaceCurrent: (text: string) => boolean;
  /** Returns the number replaced. Refuses partial replacement when results are truncated. */
  replaceAll: (text: string) => number;
  canReplace: boolean;
  canReplaceAll: boolean;
}

interface SearchPreferences {
  query: string;
  caseSensitive: boolean;
  wholeWord: boolean;
  maxMatches: number;
}
interface SearchState extends SearchPreferences {
  matches: FolioSearchMatch[];
  currentIndex: number;
  truncated: boolean;
  decorations: DecorationSet;
}
const searchKey = new PluginKey<SearchState>("folioSearch");
const wordEnd = /[\p{L}\p{N}_]$/u;
const wordStart = /^[\p{L}\p{N}_]/u;
const emptySnapshot: FolioSearchSnapshot = {
  query: "",
  caseSensitive: false,
  wholeWord: false,
  matches: [],
  currentIndex: -1,
  truncated: false,
  editable: false,
};
const resultLimit = (value?: number) =>
  Number.isSafeInteger(value) && value! > 0 ? Math.min(value!, 10_000) : 2000;

/** Marks do not split text runs; inline atoms, hard breaks, and block boundaries do. */
function findMatches(document: ProseMirrorNode, preferences: SearchPreferences) {
  const matches: FolioSearchMatch[] = [];
  let truncated = false;
  if (!preferences.query) return { matches, truncated };
  const escaped = preferences.query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(escaped, preferences.caseSensitive ? "gu" : "giu");
  document.descendants((node, pos) => {
    if (truncated) return false;
    if (!node.isTextblock) return;
    let text = "";
    let start = pos + 1;
    const flush = () => {
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while (!truncated && (match = pattern.exec(text))) {
        const end = match.index + match[0].length;
        if (
          preferences.wholeWord &&
          (wordEnd.test(text.slice(0, match.index)) || wordStart.test(text.slice(end)))
        )
          continue;
        if (matches.length >= preferences.maxMatches) {
          truncated = true;
          break;
        }
        matches.push({ from: start + match.index, to: start + end });
      }
      text = "";
    };
    node.forEach((child, offset) => {
      if (truncated) return;
      if (child.isText) {
        if (!text) start = pos + 1 + offset;
        text += child.text!;
      } else flush();
    });
    flush();
    return false;
  });
  return { matches, truncated };
}

function selectedIndex(state: EditorState, matches: FolioSearchMatch[], fallback: number) {
  if (!matches.length) return -1;
  const { from, to, empty } = state.selection;
  const inside = matches.findIndex(
    (match) => from >= match.from && (empty ? from < match.to : to <= match.to),
  );
  if (inside >= 0) return inside;
  return fallback >= 0 && fallback < matches.length ? fallback : 0;
}

function decorate(document: ProseMirrorNode, matches: FolioSearchMatch[], currentIndex: number) {
  return DecorationSet.create(
    document,
    matches.map((match, index) =>
      Decoration.inline(match.from, match.to, {
        class:
          index === currentIndex
            ? "folio-search-match folio-search-match--active"
            : "folio-search-match",
        "data-folio-search-match": index === currentIndex ? "active" : "true",
      }),
    ),
  );
}

/** Search controls retain focus, so scrolling cannot depend on the DOM selection. */
function scrollToSearchResult(editor: Editor, position?: number, preferMatch = true) {
  if (editor.isDestroyed) return;
  const view = editor.view;
  let target = preferMatch
    ? view.dom.querySelector<HTMLElement>('[data-folio-search-match="active"]')
    : null;
  if (!target) {
    const point = Math.max(
      0,
      Math.min(position ?? view.state.selection.from, view.state.doc.content.size),
    );
    const { node } = view.domAtPos(point);
    target = node.nodeType === 1 ? (node as HTMLElement) : node.parentElement;
  }
  target?.scrollIntoView?.({ block: "center", inline: "nearest" });
}

/** Install once per editor surface. It never replaces the editor or its history. */
export function useFolioSearch(
  editor: Editor | null,
  options: FolioSearchOptions = {},
): FolioSearchController {
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  }, [options]);
  const preferences = useRef<SearchPreferences>({
    query: "",
    caseSensitive: false,
    wholeWord: false,
    maxMatches: resultLimit(options.maxMatches),
  });
  const [snapshot, setSnapshot] = useState<FolioSearchSnapshot>(emptySnapshot);
  const report = useCallback((cause: unknown) => {
    try {
      latest.current.onError?.(cause instanceof Error ? cause : new Error(String(cause)));
    } catch {
      /* Search diagnostics must not break editing. */
    }
  }, []);

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    if (searchKey.getState(editor.state)) {
      report(new Error("Install useFolioSearch only once per editor."));
      return;
    }
    const publish = () => {
      const value = searchKey.getState(editor.state);
      if (!value || editor.isDestroyed) return;
      setSnapshot((previous) => {
        if (
          previous.matches === value.matches &&
          previous.currentIndex === value.currentIndex &&
          previous.query === value.query &&
          previous.caseSensitive === value.caseSensitive &&
          previous.wholeWord === value.wholeWord &&
          previous.truncated === value.truncated &&
          previous.editable === editor.isEditable
        )
          return previous;
        return {
          query: value.query,
          caseSensitive: value.caseSensitive,
          wholeWord: value.wholeWord,
          matches: value.matches,
          currentIndex: value.currentIndex,
          truncated: value.truncated,
          editable: editor.isEditable,
        };
      });
    };
    const plugin = new Plugin<SearchState>({
      key: searchKey,
      state: {
        init: (_config, state) => {
          const settings = preferences.current;
          const found = findMatches(state.doc, settings);
          const currentIndex = selectedIndex(state, found.matches, 0);
          return {
            ...settings,
            ...found,
            currentIndex,
            decorations: decorate(state.doc, found.matches, currentIndex),
          };
        },
        apply: (transaction, previous, _oldState, state) => {
          const settings = transaction.getMeta(searchKey) as Partial<SearchPreferences> | undefined;
          if (!settings && !transaction.docChanged && !transaction.selectionSet) return previous;
          const config = { ...previous, ...settings };
          const found =
            settings || transaction.docChanged
              ? findMatches(state.doc, config)
              : { matches: previous.matches, truncated: previous.truncated };
          const nearest = found.matches.findIndex((match) => match.from >= state.selection.from);
          const currentIndex = selectedIndex(
            state,
            found.matches,
            settings || transaction.selectionSet ? Math.max(0, nearest) : previous.currentIndex,
          );
          return {
            ...config,
            ...found,
            currentIndex,
            decorations: decorate(state.doc, found.matches, currentIndex),
          };
        },
      },
      props: {
        decorations: (state) => searchKey.getState(state)?.decorations ?? DecorationSet.empty,
      },
      view: () => ({ update: publish }),
    });
    editor.registerPlugin(plugin);
    queueMicrotask(publish);
    return () => {
      if (!editor.isDestroyed) editor.unregisterPlugin(searchKey);
    };
  }, [editor, report]);

  const configure = useCallback(
    (settings: Partial<SearchPreferences>) => {
      if (settings.query !== undefined && settings.query.length > 4096) {
        report(new Error("Search queries may contain at most 4096 characters."));
        return;
      }
      preferences.current = { ...preferences.current, ...settings };
      if (editor && !editor.isDestroyed && searchKey.getState(editor.state))
        editor.view.dispatch(editor.state.tr.setMeta(searchKey, settings));
    },
    [editor, report],
  );
  useEffect(() => {
    configure({ maxMatches: resultLimit(options.maxMatches) });
  }, [configure, options.maxMatches]);

  const navigate = (direction: number) => {
    if (!editor || editor.isDestroyed) return false;
    const state = searchKey.getState(editor.state);
    if (!state?.matches.length) return false;
    const index = (state.currentIndex + direction + state.matches.length) % state.matches.length;
    const match = state.matches[index]!;
    editor.view.dispatch(
      editor.state.tr.setSelection(TextSelection.create(editor.state.doc, match.from, match.to)),
    );
    scrollToSearchResult(editor, match.from);
    return true;
  };
  const replace = (text: string, all: boolean): number => {
    if (!editor || editor.isDestroyed || !editor.isEditable) return 0;
    const state = searchKey.getState(editor.state);
    if (!state?.matches.length) return 0;
    if (all && state.truncated) {
      report(new Error("Refine the search before replacing all truncated results."));
      return 0;
    }
    if (text.length > defaultFolioDocumentLimits.maxTextLength) {
      report(new Error("Replacement text exceeds the document size limit."));
      return 0;
    }
    const matches = all ? state.matches : [state.matches[state.currentIndex]!];
    const expectedLength =
      editor.state.doc.textContent.length +
      matches.length * text.length -
      matches.reduce((length, match) => length + match.to - match.from, 0);
    if (expectedLength > defaultFolioDocumentLimits.maxTextLength) {
      report(new Error("Replacement would exceed the document size limit."));
      return 0;
    }
    try {
      const transaction = closeHistory(editor.state.tr);
      for (const match of [...matches].reverse())
        transaction.insertText(text, match.from, match.to);
      if (transaction.doc.textContent.length > defaultFolioDocumentLimits.maxTextLength)
        throw new Error("Replacement would exceed the document size limit.");
      const caret = Math.min(matches[0]!.from + text.length, transaction.doc.content.size);
      transaction.setSelection(TextSelection.near(transaction.doc.resolve(caret)));
      editor.view.dispatch(transaction);
      if (!editor.state.doc.eq(transaction.doc)) return 0;
      editor.view.dispatch(closeHistory(editor.state.tr));
      scrollToSearchResult(editor, caret, !all);
      return matches.length;
    } catch (cause) {
      report(cause);
      return 0;
    }
  };
  const canReplace = Boolean(
    editor && !editor.isDestroyed && snapshot.editable && snapshot.matches.length > 0,
  );
  return {
    ...(editor && !editor.isDestroyed ? snapshot : emptySnapshot),
    setQuery: (query) => configure({ query }),
    setCaseSensitive: (caseSensitive) => configure({ caseSensitive }),
    setWholeWord: (wholeWord) => configure({ wholeWord }),
    next: () => navigate(1),
    previous: () => navigate(-1),
    replaceCurrent: (text) => replace(text, false) > 0,
    replaceAll: (text) => replace(text, true),
    canReplace,
    canReplaceAll: canReplace && !snapshot.truncated,
  };
}
