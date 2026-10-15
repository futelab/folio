import { assertRevisionSummary } from "./types";
import type { FolioHistoryAdapter, FolioRevision } from "./types";
/** Retains at most maxRevisions snapshots per document; boundary values are cloned. */
export function createMemoryFolioHistoryAdapter(
  options: { maxRevisions?: number; initial?: FolioRevision[] } = {},
): FolioHistoryAdapter {
  const limit = options.maxRevisions ?? 50;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 10_000)
    throw new RangeError("maxRevisions must be a safe integer between 1 and 10000.");
  const revisions = structuredClone(options.initial ?? []);
  const listeners = new Map<string, Set<() => void>>();
  let sequence = 0;
  const clone = <T>(value: T): T => structuredClone(value);
  const check = (signal?: AbortSignal) => {
    if (signal?.aborted) throw new DOMException("Request aborted", "AbortError");
  };
  const newest = (documentId: string) =>
    revisions
      .filter((item) => item.documentId === documentId)
      .reverse()
      .sort((a, b) => b.createdAt - a.createdAt);
  const prune = (documentId: string) => {
    const retain = new Set(newest(documentId).slice(0, limit));
    for (let index = revisions.length - 1; index >= 0; index -= 1)
      if (revisions[index]!.documentId === documentId && !retain.has(revisions[index]!))
        revisions.splice(index, 1);
  };
  const identities = new Set<string>();
  for (const revision of revisions) {
    assertRevisionSummary(revision, revision.documentId);
    const identity = JSON.stringify([revision.documentId, revision.id]);
    if (identities.has(identity))
      throw new Error("Initial history contains duplicate revision IDs.");
    identities.add(identity);
  }
  for (const id of new Set(revisions.map((revision) => revision.documentId))) prune(id);
  return {
    async list(documentId, signal) {
      check(signal);
      return clone(newest(documentId).map(({ document: _document, ...summary }) => summary));
    },
    async load(documentId, id, signal) {
      check(signal);
      const revision = revisions.find((item) => item.documentId === documentId && item.id === id);
      if (!revision) throw new Error("Revision was not found.");
      return clone(revision);
    },
    async create(documentId, input, signal) {
      check(signal);
      const base = globalThis.crypto?.randomUUID?.() ?? `revision-${Date.now()}`;
      let id = base;
      while (revisions.some((revision) => revision.documentId === documentId && revision.id === id))
        id = `${base}-${++sequence}`;
      const revision: FolioRevision = { ...clone(input), documentId, id, createdAt: Date.now() };
      assertRevisionSummary(revision, documentId);
      revisions.push(revision);
      prune(documentId);
      for (const listener of Array.from(listeners.get(documentId) ?? [])) {
        try {
          listener();
        } catch {
          /* Subscriber errors cannot undo persistence. */
        }
      }
      const { document: _document, ...summary } = revision;
      return clone(summary);
    },
    subscribe(documentId, listener) {
      const set = listeners.get(documentId) ?? new Set();
      listeners.set(documentId, set);
      set.add(listener);
      return () => {
        set.delete(listener);
        if (!set.size) listeners.delete(documentId);
      };
    },
  };
}
