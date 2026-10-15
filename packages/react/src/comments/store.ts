import type {
  FolioCommentAnchor,
  FolioCommentReply,
  FolioCommentStore,
  FolioCommentThread,
} from "./types";

function freezeReply(reply: FolioCommentReply): FolioCommentReply {
  return Object.freeze({ ...reply, author: Object.freeze({ ...reply.author }) });
}
function freezeThread(thread: FolioCommentThread): FolioCommentThread {
  return Object.freeze({
    ...freezeReply(thread),
    anchor: Object.freeze({ ...thread.anchor }),
    replies: Object.freeze(thread.replies.map(freezeReply)),
    resolved: thread.resolved,
    updatedAt: thread.updatedAt,
  });
}
export function equalFolioCommentAnchors(a: FolioCommentAnchor, b: FolioCommentAnchor): boolean {
  return (
    a.kind === b.kind &&
    a.from === b.from &&
    a.to === b.to &&
    a.blockId === b.blockId &&
    Boolean(a.orphaned) === Boolean(b.orphaned)
  );
}

/** A stable observable adapter; replace its operations with your persistence API. */
export function createMemoryCommentStore(
  initial: readonly FolioCommentThread[] = [],
): FolioCommentStore {
  let snapshot: readonly FolioCommentThread[] = Object.freeze(initial.map(freezeThread));
  const listeners = new Set<() => void>();
  const publish = (next: readonly FolioCommentThread[]) => {
    snapshot = Object.freeze(next);
    for (const listener of listeners) listener();
  };
  const replace = (id: string, change: (thread: FolioCommentThread) => FolioCommentThread) => {
    const thread = snapshot.find((entry) => entry.id === id);
    if (!thread) throw new Error("Comment thread no longer exists.");
    const next = change(thread);
    if (next !== thread)
      publish(snapshot.map((entry) => (entry.id === id ? freezeThread(next) : entry)));
  };
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    create: (thread) => {
      if (snapshot.some((entry) => entry.id === thread.id))
        throw new Error("Comment ID already exists.");
      publish([...snapshot, freezeThread(thread)]);
    },
    reply: (id, reply) =>
      replace(id, (thread) => ({
        ...thread,
        replies: [...thread.replies, reply],
        updatedAt: reply.createdAt,
      })),
    setResolved: (id, resolved) =>
      replace(id, (thread) =>
        thread.resolved === resolved
          ? thread
          : { ...thread, resolved, updatedAt: new Date().toISOString() },
      ),
    remove: (id) => {
      if (snapshot.some((thread) => thread.id === id))
        publish(snapshot.filter((thread) => thread.id !== id));
    },
    removeReply: (id, replyId) =>
      replace(id, (thread) => ({
        ...thread,
        replies: thread.replies.filter((reply) => reply.id !== replyId),
        updatedAt: new Date().toISOString(),
      })),
    updateAnchor: (id, anchor) => {
      if (snapshot.some((thread) => thread.id === id))
        replace(id, (thread) =>
          equalFolioCommentAnchors(thread.anchor, anchor) ? thread : { ...thread, anchor },
        );
    },
  };
}
