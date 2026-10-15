import { useState, useSyncExternalStore } from "react";
import type { FormEvent } from "react";
import type { FolioCommentsPanelLabels, FolioCommentsPanelProps } from "./types";
import {
  createFolioCommentThread,
  removeFolioComment,
  removeFolioCommentReply,
  replyToFolioComment,
  resolveFolioComment,
  selectFolioCommentThread,
} from "./actions";

const defaultLabels: FolioCommentsPanelLabels = {
  title: "Comments",
  draft: "Comment text",
  addText: "Comment on selection",
  addBlock: "Comment on block",
  reply: "Reply",
  resolve: "Resolve",
  reopen: "Reopen",
  remove: "Remove",
  resolved: "Resolved",
  orphaned: "Original content was removed",
  empty: "No comments yet",
  pending: "Saving comment…",
};

export function FolioCommentsPanel({
  editor,
  options,
  labels: customLabels,
  className,
  onSelectThread,
}: FolioCommentsPanelProps) {
  const threads = useSyncExternalStore(
    options.store.subscribe,
    options.store.getSnapshot,
    options.store.getSnapshot,
  );
  const labels = { ...defaultLabels, ...customLabels };
  const [draft, setDraft] = useState("");
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  async function run(action: () => Promise<unknown>) {
    if (pending) return;
    setPending(true);
    setError(undefined);
    try {
      await action();
    } catch (cause) {
      const next = cause instanceof Error ? cause : new Error(String(cause));
      setError(next.message);
      options.onError?.(next);
    } finally {
      setPending(false);
    }
  }
  const add = (kind: "text" | "block") =>
    run(async () => {
      await createFolioCommentThread(editor, options, { body: draft, kind });
      setDraft("");
    });
  function submit(event: FormEvent) {
    event.preventDefault();
    void add("text");
  }
  return (
    <aside aria-label={labels.title} className={className ?? "folio-comments-panel"}>
      <h2>{labels.title}</h2>
      <form onSubmit={submit}>
        <label>
          {labels.draft}
          <textarea
            value={draft}
            maxLength={10000}
            onChange={(event) => setDraft(event.target.value)}
          />
        </label>
        <div>
          <button type="submit" disabled={pending || !editor || !draft.trim()}>
            {labels.addText}
          </button>
          <button
            type="button"
            disabled={pending || !editor || !draft.trim()}
            onClick={() => void add("block")}
          >
            {labels.addBlock}
          </button>
        </div>
      </form>
      {error ? <p role="alert">{error}</p> : null}
      {pending ? <p role="status">{labels.pending}</p> : null}
      {!threads.length ? <p>{labels.empty}</p> : null}
      <ol>
        {threads.map((thread) => (
          <li key={thread.id} data-comment-thread={thread.id} data-resolved={thread.resolved}>
            <button
              type="button"
              onClick={() => {
                selectFolioCommentThread(editor, thread.id);
                onSelectThread?.(thread);
              }}
              disabled={thread.anchor.orphaned}
            >
              {thread.author.name}
            </button>
            <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{thread.body}</p>
            <time dateTime={thread.createdAt}>{thread.createdAt}</time>
            {thread.resolved ? <p>{labels.resolved}</p> : null}
            {thread.anchor.orphaned ? <p>{labels.orphaned}</p> : null}
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                void run(() => resolveFolioComment(options, thread.id, !thread.resolved))
              }
            >
              {thread.resolved ? labels.reopen : labels.resolve}
            </button>
            {options.can || thread.author.id === options.user.id ? (
              <button
                type="button"
                disabled={pending}
                onClick={() => void run(() => removeFolioComment(options, thread.id))}
              >
                {labels.remove}
              </button>
            ) : null}
            <ol>
              {thread.replies.map((reply) => (
                <li key={reply.id}>
                  <strong>{reply.author.name}</strong>
                  <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{reply.body}</p>
                  {options.store.removeReply &&
                  (options.can || reply.author.id === options.user.id) ? (
                    <button
                      type="button"
                      disabled={pending}
                      aria-label={`${labels.remove}: ${reply.body}`}
                      onClick={() =>
                        void run(() => removeFolioCommentReply(options, thread.id, reply.id))
                      }
                    >
                      {labels.remove}
                    </button>
                  ) : null}
                </li>
              ))}
            </ol>
            {!thread.resolved ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void run(async () => {
                    await replyToFolioComment(options, thread.id, replyDrafts[thread.id] ?? "");
                    setReplyDrafts((current) => ({ ...current, [thread.id]: "" }));
                  });
                }}
              >
                <label>
                  {labels.reply}
                  <textarea
                    value={replyDrafts[thread.id] ?? ""}
                    maxLength={10000}
                    onChange={(event) =>
                      setReplyDrafts((current) => ({ ...current, [thread.id]: event.target.value }))
                    }
                  />
                </label>
                <button type="submit" disabled={pending || !replyDrafts[thread.id]?.trim()}>
                  {labels.reply}
                </button>
              </form>
            ) : null}
          </li>
        ))}
      </ol>
    </aside>
  );
}
