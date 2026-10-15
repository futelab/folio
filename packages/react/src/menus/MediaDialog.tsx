import { useEffect, useId, useRef, useState } from "react";
import { sanitizeFolioUrl } from "@futelab/folio-core/browser";
import type { FolioEditorLabels } from "../editorLabels";
import { useDialogNavigation } from "./useDialogNavigation";

export interface FolioImageUploadResult {
  src: string;
  alt?: string;
  caption?: string;
}
export type FolioImageUpload = (file: File) => Promise<string | FolioImageUploadResult>;
export type FolioMediaKind = "image" | "bookmark" | "link";

interface MediaDialogProps {
  kind: FolioMediaKind;
  labels: FolioEditorLabels;
  initial?: Record<string, string>;
  uploadImage?: FolioImageUpload;
  onSave: (attributes: Record<string, string>) => boolean;
  onClose: () => void;
  onError?: (error: Error) => void;
}

export function MediaDialog({
  kind,
  labels,
  initial = {},
  uploadImage,
  onSave,
  onClose,
  onError,
}: MediaDialogProps) {
  const id = useId();
  const panelRef = useDialogNavigation(onClose);
  const request = useRef(0);
  const [lastFile, setLastFile] = useState<File>();
  const [values, setValues] = useState<Record<string, string>>(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  useEffect(() => {
    return () => {
      request.current += 1;
    };
  }, []);

  function report(cause: unknown) {
    const next = cause instanceof Error ? cause : new Error(String(cause));
    setError(next.message);
    onError?.(next);
  }
  async function upload(file: File) {
    if (!uploadImage) return;
    setLastFile(file);
    const token = ++request.current;
    setPending(true);
    setError(undefined);
    try {
      const result = await uploadImage(file);
      if (token !== request.current) return;
      const attributes = typeof result === "string" ? { src: result } : result;
      const src = sanitizeFolioUrl(attributes.src, { kind: "image" });
      if (!src) throw new Error(labels.invalidUrl);
      setValues((current) => ({ ...current, ...attributes, src }));
    } catch (cause) {
      if (token === request.current) report(cause);
    } finally {
      if (token === request.current) setPending(false);
    }
  }
  function save(remove = false) {
    if (pending) return;
    const field = kind === "image" ? "src" : kind === "link" ? "href" : "url";
    const url = remove
      ? ""
      : sanitizeFolioUrl(values[field], { kind: kind === "image" ? "image" : "link" });
    if (!remove && !url) {
      report(new Error(labels.invalidUrl));
      return;
    }
    try {
      if (!onSave({ ...values, [field]: url ?? "" })) throw new Error(labels.actionFailed);
      onClose();
    } catch (cause) {
      report(cause);
    }
  }
  const fields: Array<[string, string]> =
    kind === "image"
      ? [
          ["src", labels.url],
          ["alt", labels.alt],
          ["caption", labels.caption],
        ]
      : kind === "bookmark"
        ? [
            ["url", labels.url],
            ["title", labels.title],
            ["description", labels.description],
          ]
        : [["href", labels.url]];

  return (
    <div className="folio-dialog-backdrop">
      <div
        aria-labelledby={`${id}-title`}
        aria-modal="true"
        className="folio-dialog"
        ref={panelRef}
        role="dialog"
        tabIndex={-1}
      >
        <h2 id={`${id}-title`}>{labels[kind]}</h2>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          {fields.map(([name, label]) => (
            <label className="folio-dialog__field" htmlFor={`${id}-${name}`} key={name}>
              {label}
              <input
                autoComplete="off"
                disabled={pending}
                id={`${id}-${name}`}
                onChange={(event) =>
                  setValues((current) => ({ ...current, [name]: event.target.value }))
                }
                value={values[name] ?? ""}
              />
            </label>
          ))}
          {kind === "image" && uploadImage ? (
            <label className="folio-dialog__field" htmlFor={`${id}-file`}>
              {labels.upload}
              <input
                accept="image/*"
                disabled={pending}
                id={`${id}-file`}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void upload(file);
                }}
                type="file"
              />
            </label>
          ) : null}
          {pending ? <p role="status">{labels.uploading}</p> : null}
          {error ? (
            <p className="folio-editor-error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="folio-dialog__actions">
            {error && lastFile && uploadImage ? (
              <button disabled={pending} onClick={() => void upload(lastFile)} type="button">
                {labels.retry}
              </button>
            ) : null}
            {kind === "link" && initial.href ? (
              <button disabled={pending} onClick={() => save(true)} type="button">
                {labels.removeLink}
              </button>
            ) : null}
            <button onClick={onClose} type="button">
              {labels.cancel}
            </button>
            <button disabled={pending} type="submit">
              {labels.save}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
