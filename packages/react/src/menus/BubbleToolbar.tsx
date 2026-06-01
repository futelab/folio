import type { ComponentType } from "react";
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

export interface BubbleToolbarProps {
  editor: Editor | null;
  className?: string;
  style?: CSSProperties;
}

interface ToolbarAction {
  label: string;
  icon: ComponentType<{ "aria-hidden"?: boolean; size?: number }>;
  isActive: (editor: Editor) => boolean;
  run: (editor: Editor) => boolean;
}

function runEditorChain(editor: Editor | null, callback: (chain: any) => any): boolean {
  try {
    if (!editor) return false;

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

function promptForLinkHref(editor: Editor): string | null {
  if (typeof window === "undefined" || typeof window.prompt !== "function") {
    return null;
  }

  const currentHref = editor.getAttributes("link").href;
  const href = window.prompt(
    "Link URL",
    typeof currentHref === "string" ? currentHref : "",
  );

  return href;
}

const toolbarActions: ToolbarAction[] = [
  {
    label: "Bold",
    icon: Bold,
    isActive: (editor) => isMarkActive(editor, "bold"),
    run: (editor) => runEditorChain(editor, (chain) => chain.toggleBold()),
  },
  {
    label: "Italic",
    icon: Italic,
    isActive: (editor) => isMarkActive(editor, "italic"),
    run: (editor) => runEditorChain(editor, (chain) => chain.toggleItalic()),
  },
  {
    label: "Underline",
    icon: Underline,
    isActive: (editor) => isMarkActive(editor, "underline"),
    run: (editor) => runEditorChain(editor, (chain) => chain.toggleUnderline()),
  },
  {
    label: "Strike",
    icon: Strikethrough,
    isActive: (editor) => isMarkActive(editor, "strike"),
    run: (editor) => runEditorChain(editor, (chain) => chain.toggleStrike()),
  },
  {
    label: "Code",
    icon: Code,
    isActive: (editor) => isMarkActive(editor, "code"),
    run: (editor) => runEditorChain(editor, (chain) => chain.toggleCode()),
  },
  {
    label: "Link",
    icon: LinkIcon,
    isActive: (editor) => isMarkActive(editor, "link"),
    run: (editor) => {
      const href = promptForLinkHref(editor);

      if (href === null) {
        return false;
      }

      if (href === "") {
        return runEditorChain(editor, (chain) =>
          chain.extendMarkRange("link").unsetLink(),
        );
      }

      return runEditorChain(editor, (chain) =>
        chain.extendMarkRange("link").setLink({ href }),
      );
    },
  },
  {
    label: "Highlight",
    icon: Highlighter,
    isActive: (editor) => isMarkActive(editor, "highlight"),
    run: (editor) => runEditorChain(editor, (chain) => chain.toggleHighlight()),
  },
];

export function BubbleToolbar({ editor, className, style }: BubbleToolbarProps) {
  return (
    <div
      aria-label="Text formatting"
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
            disabled={!editor}
            key={action.label}
            onClick={() => {
              if (editor) {
                action.run(editor);
              }
            }}
            title={action.label}
            type="button"
          >
            <Icon aria-hidden size={16} />
          </button>
        );
      })}
    </div>
  );
}
