import { useState, type ComponentType } from "react";
import type { CSSProperties } from "react";
import type { Editor } from "@tiptap/core";
import {
  Bold,
  Code,
  Highlighter,
  Italic,
  Link as LinkIcon,
  Strikethrough,
  Underline,
} from "lucide-react";
import type { FolioMessages } from "../i18n";
import { resolveFolioMessages } from "../i18n";
import { resolveEditorLabels, type FolioEditorLabels } from "../editorLabels";
import { MediaDialog } from "./MediaDialog";

export interface BubbleToolbarProps {
  editor: Editor | null;
  className?: string;
  messages?: FolioMessages;
  style?: CSSProperties;
  labels?: FolioEditorLabels;
  onEditLink?: () => void;
  onError?: (error: Error) => void;
}

interface ToolbarAction {
  label: string;
  icon: ComponentType<{ "aria-hidden"?: boolean; size?: number }>;
  isActive: (editor: Editor) => boolean;
  run: (editor: Editor) => boolean;
}

function runEditorChain(editor: Editor | null, callback: (chain: any) => any): boolean {
  try {
    if (!editor?.isEditable) return false;

    const chain = callback(editor.chain().focus());
    if (!chain || typeof chain.run !== "function") return false;

    const result = chain.run();
    return typeof result === "boolean" ? result : false;
  } catch {
    return false;
  }
}

function isMarkActive(editor: Editor | null, markName: string): boolean {
  try {
    return editor?.isActive(markName) ?? false;
  } catch {
    return false;
  }
}

function createToolbarActions(messages: FolioMessages, editLink: () => void): ToolbarAction[] {
  const labels = messages.ui.bubbleToolbar;

  return [
    {
      label: labels.bold,
      icon: Bold,
      isActive: (editor) => isMarkActive(editor, "bold"),
      run: (editor) => runEditorChain(editor, (chain) => chain.toggleBold()),
    },
    {
      label: labels.italic,
      icon: Italic,
      isActive: (editor) => isMarkActive(editor, "italic"),
      run: (editor) => runEditorChain(editor, (chain) => chain.toggleItalic()),
    },
    {
      label: labels.underline,
      icon: Underline,
      isActive: (editor) => isMarkActive(editor, "underline"),
      run: (editor) => runEditorChain(editor, (chain) => chain.toggleUnderline()),
    },
    {
      label: labels.strike,
      icon: Strikethrough,
      isActive: (editor) => isMarkActive(editor, "strike"),
      run: (editor) => runEditorChain(editor, (chain) => chain.toggleStrike()),
    },
    {
      label: labels.code,
      icon: Code,
      isActive: (editor) => isMarkActive(editor, "code"),
      run: (editor) => runEditorChain(editor, (chain) => chain.toggleCode()),
    },
    {
      label: labels.link,
      icon: LinkIcon,
      isActive: (editor) => isMarkActive(editor, "link"),
      run: () => {
        editLink();
        return true;
      },
    },
    {
      label: labels.highlight,
      icon: Highlighter,
      isActive: (editor) => isMarkActive(editor, "highlight"),
      run: (editor) => runEditorChain(editor, (chain) => chain.toggleHighlight()),
    },
  ];
}

export function BubbleToolbar({
  editor,
  className,
  messages,
  style,
  labels = resolveEditorLabels(),
  onEditLink,
  onError,
}: BubbleToolbarProps) {
  const [linkSelection, setLinkSelection] = useState<{ from: number; to: number; href: string }>();
  const resolvedMessages = resolveFolioMessages({ messages });
  const toolbarActions = createToolbarActions(resolvedMessages, () => {
    if (!editor?.isEditable) return;
    if (onEditLink) {
      onEditLink();
      return;
    }
    setLinkSelection({
      from: editor.state.selection.from,
      to: editor.state.selection.to,
      href: String(editor.getAttributes("link").href ?? ""),
    });
  });

  if (!editor?.isEditable) return null;

  return (
    <>
      <div
        aria-label={resolvedMessages.ui.bubbleToolbar.label}
        className={className ?? "folio-bubble-toolbar"}
        role="toolbar"
        style={style}
      >
        {toolbarActions.map((action) => {
          const Icon = action.icon;

          return (
            <button
              aria-label={action.label}
              aria-pressed={editor ? action.isActive(editor) : false}
              className="folio-bubble-toolbar__button"
              disabled={!editor.isEditable}
              key={action.label}
              onClick={() => {
                if (editor.isEditable) {
                  if (!action.run(editor)) onError?.(new Error(labels.actionFailed));
                }
              }}
              onMouseDown={(event) => event.preventDefault()}
              title={action.label}
              type="button"
            >
              <Icon aria-hidden size={16} />
            </button>
          );
        })}
      </div>
      {linkSelection ? (
        <MediaDialog
          initial={{ href: linkSelection.href }}
          kind="link"
          labels={labels}
          onClose={() => setLinkSelection(undefined)}
          onError={onError}
          onSave={({ href }) =>
            runEditorChain(editor, (chain) => {
              const selected = chain
                .setTextSelection({ from: linkSelection.from, to: linkSelection.to })
                .extendMarkRange("link");
              return href ? selected.setLink({ href }) : selected.unsetLink();
            })
          }
        />
      ) : null}
    </>
  );
}
