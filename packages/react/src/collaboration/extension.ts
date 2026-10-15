import { Extension, type AnyExtension } from "@tiptap/core";
import { Collaboration, isChangeOrigin } from "@tiptap/extension-collaboration";
import { Plugin, type Transaction } from "@tiptap/pm/state";
import type { Schema } from "@tiptap/pm/model";
import { prosemirrorJSONToYXmlFragment, yCursorPlugin } from "@tiptap/y-tiptap";
import type { FolioDocument } from "@futelab/folio-core/browser";
import type { Doc } from "yjs";
import type {
  FolioCollaborationOptions,
  FolioCollaborationStatus,
  FolioCollaborationUser,
} from "./types";

/** Seed an authoritative room once, before attaching or connecting its editors. */
export function initializeFolioCollaboration(
  document: Doc,
  schema: Schema,
  value: FolioDocument,
  field = "default",
): boolean {
  const fragment = document.getXmlFragment(field);
  const initialized = document.getMap<boolean>("folio:initialized");
  if (fragment.length || initialized.get(field)) return false;
  schema.nodeFromJSON(value).check();
  document.transact(() => {
    prosemirrorJSONToYXmlFragment(schema, value, fragment);
    initialized.set(field, true);
  }, "folio:initialize");
  return true;
}

/** StarterKit's ProseMirror history must not compete with Yjs's local undo. */
export function withoutFolioHistory(extensions: AnyExtension[]): AnyExtension[] {
  return extensions.map((extension) =>
    extension.name === "starterKit" ? extension.configure({ undoRedo: false }) : extension,
  );
}

export function isFolioCollaborationTransaction(transaction: Transaction): boolean {
  return isChangeOrigin(transaction);
}

export function normalizeFolioCollaborationUser(
  user?: Partial<FolioCollaborationUser>,
): FolioCollaborationUser {
  return {
    id: typeof user?.id === "string" ? user.id.slice(0, 200) : "anonymous",
    name: typeof user?.name === "string" ? user.name.slice(0, 200) : "Anonymous",
    color:
      typeof user?.color === "string" && /^#[\da-f]{6}$/iu.test(user.color)
        ? user.color
        : "#2563eb",
  };
}

export function createFolioCollaborationExtensions(
  options: FolioCollaborationOptions,
  canWrite: () => boolean = () => true,
): AnyExtension[] {
  const provider = options.provider;
  const awareness = provider?.awareness;
  if (options.document.isDestroyed) throw new Error("Cannot collaborate on a destroyed Y.Doc.");
  if (awareness && awareness.doc !== options.document)
    throw new Error("Provider awareness must belong to the collaboration document.");
  const field = options.field ?? "default";
  const collaboration = Collaboration.extend({
    addCommands() {
      const commands = this.parent?.();
      return {
        undo: () => (props) =>
          Boolean(canWrite() && this.editor.isEditable && commands?.undo?.()(props)),
        redo: () => (props) =>
          Boolean(canWrite() && this.editor.isEditable && commands?.redo?.()(props)),
      };
    },
  }).configure({ document: options.document, field });
  const presence = Extension.create({
    name: "folioCollaborationPresence",
    onBeforeCreate() {
      const editor = this.editor;
      let disposed = false;
      let lastStatus: FolioCollaborationStatus | undefined;
      const report = (status: FolioCollaborationStatus) => {
        if (!disposed && status !== lastStatus) {
          lastStatus = status;
          options.onStatusChange?.(status);
        }
      };
      const fail = (cause: unknown) => {
        if (disposed) return;
        report("error");
        options.onError?.(cause instanceof Error ? cause : new Error(String(cause)));
      };
      const status = (event: unknown) => {
        const value =
          typeof event === "string" ? event : (event as { status?: unknown } | null)?.status;
        if (value === "connected" || value === "connecting" || value === "disconnected")
          report(value);
      };
      const sync = (event: unknown) => {
        if (event === true) report("synced");
      };
      const previousUser = awareness?.getLocalState()?.user;
      const publishedUser = normalizeFolioCollaborationUser(options.user);
      awareness?.setLocalStateField("user", publishedUser);
      provider?.on?.("status", status);
      provider?.on?.("sync", sync);
      report(provider ? (provider.synced ? "synced" : "connecting") : "connected");
      if (options.manageConnection !== false)
        try {
          Promise.resolve(provider?.connect?.()).catch(fail);
        } catch (cause) {
          fail(cause);
        }
      const cleanup = () => {
        if (disposed) return;
        disposed = true;
        provider?.off?.("status", status);
        provider?.off?.("sync", sync);
        awareness?.setLocalStateField("cursor", null);
        if (
          awareness?.getLocalState()?.user?.id === normalizeFolioCollaborationUser(options.user).id
        )
          awareness.setLocalStateField("user", previousUser ?? null);
        if (options.manageConnection !== false)
          try {
            Promise.resolve(provider?.disconnect?.()).catch(() => {});
          } catch {
            /* The transport is already gone. */
          }
        options.onStatusChange?.("disconnected");
        editor.off("destroy", cleanup);
      };
      editor.on("destroy", cleanup);
    },
    addProseMirrorPlugins() {
      const editor = this.editor;
      return [
        new Plugin({
          filterTransaction: (transaction) =>
            !transaction.docChanged ||
            (canWrite() && editor.isEditable) ||
            isChangeOrigin(transaction),
        }),
        ...(awareness
          ? [
              yCursorPlugin(awareness, {
                cursorBuilder: (remote, clientId) => {
                  const user = normalizeFolioCollaborationUser(remote);
                  const cursor = editor.view.dom.ownerDocument.createElement("span");
                  cursor.className = "folio-collaboration-cursor";
                  cursor.setAttribute("aria-hidden", "true");
                  cursor.setAttribute("data-client-id", String(clientId));
                  cursor.style.cssText = `border-left:2px solid ${user.color};position:relative;pointer-events:none;`;
                  const label = cursor.ownerDocument.createElement("span");
                  label.textContent = user.name;
                  label.style.cssText = `position:absolute;left:-2px;bottom:100%;background:${user.color};color:white;font:11px sans-serif;padding:2px 4px;white-space:nowrap;`;
                  cursor.append(label);
                  return cursor;
                },
                selectionBuilder: (remote) => ({
                  class: "folio-collaboration-selection",
                  style: `background-color:${normalizeFolioCollaborationUser(remote).color}33;`,
                }),
              }),
            ]
          : []),
      ];
    },
  });
  return [collaboration, presence];
}
