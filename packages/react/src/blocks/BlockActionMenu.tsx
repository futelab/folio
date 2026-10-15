import { useCallback, useEffect, useLayoutEffect, useRef, useSyncExternalStore } from "react";
import type { Editor } from "@tiptap/core";

export type FolioBlockAction =
  | "copy"
  | "duplicate"
  | "delete"
  | "copyLink"
  | "moveUp"
  | "moveDown"
  | "convert"
  | "color"
  | "highlight";
export interface FolioBlockActionValue {
  type?: string;
  attrs?: Record<string, unknown>;
  color?: string;
}
export interface FolioBlockMenuLabels {
  menu: string;
  copy: string;
  duplicate: string;
  delete: string;
  copyLink: string;
  moveUp: string;
  moveDown: string;
  convert: string;
  color: string;
  highlight: string;
  defaultColor: string;
  paragraph: string;
  heading1: string;
  heading2: string;
  heading3: string;
  bulletList: string;
  orderedList: string;
  taskList: string;
  blockquote: string;
  codeBlock: string;
  callout: string;
  gray: string;
  red: string;
  orange: string;
  green: string;
  blue: string;
  purple: string;
  selected: string;
}
const english: FolioBlockMenuLabels = {
  menu: "Block actions",
  copy: "Copy blocks",
  duplicate: "Duplicate blocks",
  delete: "Delete blocks",
  copyLink: "Copy block link",
  moveUp: "Move block up",
  moveDown: "Move block down",
  convert: "Turn into",
  color: "Text color",
  highlight: "Background color",
  defaultColor: "Default",
  paragraph: "Text",
  heading1: "Heading 1",
  heading2: "Heading 2",
  heading3: "Heading 3",
  bulletList: "Bulleted list",
  orderedList: "Numbered list",
  taskList: "Task list",
  blockquote: "Quote",
  codeBlock: "Code block",
  callout: "Callout",
  gray: "Gray",
  red: "Red",
  orange: "Orange",
  green: "Green",
  blue: "Blue",
  purple: "Purple",
  selected: "blocks selected",
};
const chinese: FolioBlockMenuLabels = {
  menu: "块操作",
  copy: "复制块",
  duplicate: "创建块副本",
  delete: "删除块",
  copyLink: "复制块链接",
  moveUp: "上移块",
  moveDown: "下移块",
  convert: "转换为",
  color: "文字颜色",
  highlight: "背景颜色",
  defaultColor: "默认",
  paragraph: "正文",
  heading1: "一级标题",
  heading2: "二级标题",
  heading3: "三级标题",
  bulletList: "无序列表",
  orderedList: "有序列表",
  taskList: "待办列表",
  blockquote: "引用",
  codeBlock: "代码块",
  callout: "提示块",
  gray: "灰色",
  red: "红色",
  orange: "橙色",
  green: "绿色",
  blue: "蓝色",
  purple: "紫色",
  selected: "个块已选中",
};
export function resolveBlockMenuLabels(
  locale?: string,
  overrides?: Partial<FolioBlockMenuLabels>,
): FolioBlockMenuLabels {
  return { ...(locale?.toLowerCase().startsWith("zh") ? chinese : english), ...overrides };
}
export interface BlockActionMenuProps {
  editor: Editor;
  open: boolean;
  anchor: HTMLElement | null;
  labels: FolioBlockMenuLabels;
  selectionCount: number;
  className?: string;
  canCopyLink?: boolean;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  canConvert: (type: string, attrs?: Record<string, unknown>) => boolean;
  onAction: (action: FolioBlockAction, value?: FolioBlockActionValue) => void;
  onClose: () => void;
}
const useBrowserLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;
const conversions: Array<[keyof FolioBlockMenuLabels, string, Record<string, unknown>?]> = [
  ["paragraph", "paragraph"],
  ["heading1", "heading", { level: 1 }],
  ["heading2", "heading", { level: 2 }],
  ["heading3", "heading", { level: 3 }],
  ["bulletList", "bulletList"],
  ["orderedList", "orderedList"],
  ["taskList", "taskList"],
  ["blockquote", "blockquote"],
  ["codeBlock", "codeBlock"],
  ["callout", "callout"],
];
const palette: Array<[keyof FolioBlockMenuLabels, string, string]> = [
  ["gray", "#787774", "#f1f1ef"],
  ["red", "#c53030", "#ffe5e5"],
  ["orange", "#b45309", "#fff1da"],
  ["green", "#28704a", "#e5f3e9"],
  ["blue", "#2165a5", "#e3efff"],
  ["purple", "#7443a8", "#f1e5ff"],
];

export function BlockActionMenu(props: BlockActionMenuProps) {
  const layerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const subscribe = useCallback(
    (notify: () => void) => {
      props.editor.on("update", notify);
      props.editor.on("transaction", notify);
      props.editor.on("destroy", notify);
      return () => {
        props.editor.off("update", notify);
        props.editor.off("transaction", notify);
        props.editor.off("destroy", notify);
      };
    },
    [props.editor],
  );
  const editable = useSyncExternalStore(
    subscribe,
    () => !props.editor.isDestroyed && props.editor.isEditable,
    () => false,
  );
  const act = (action: FolioBlockAction, value?: FolioBlockActionValue) => {
    if (
      props.editor.isDestroyed ||
      (!props.editor.isEditable && action !== "copy" && action !== "copyLink")
    )
      return;
    props.onAction(action, value);
  };
  useBrowserLayoutEffect(() => {
    const layer = layerRef.current;
    const menu = menuRef.current;
    const anchor = props.anchor;
    const ownerWindow = anchor?.ownerDocument.defaultView;
    if (!props.open || !layer || !menu || !anchor || !ownerWindow) return;
    let frame: number | undefined;
    const position = () => {
      const layerRect = layer.getBoundingClientRect();
      const layerStyle = ownerWindow.getComputedStyle(layer);
      const scaleX = layerRect.width / (parseFloat(layerStyle.width) || layer.offsetWidth) || 1;
      const scaleY = layerRect.height / (parseFloat(layerStyle.height) || layer.offsetHeight) || 1;
      const anchorRect = anchor.getBoundingClientRect();
      const menuRect = menu.getBoundingClientRect();
      const left = Math.max(
        8,
        Math.min(anchorRect.left - 48 * scaleX, ownerWindow.innerWidth - menuRect.width - 8),
      );
      const preferred = anchorRect.top + Math.min(anchorRect.height, 28 * scaleY);
      const top = Math.max(8, Math.min(preferred, ownerWindow.innerHeight - menuRect.height - 8));
      menu.style.left = `${(left - layerRect.left) / scaleX}px`;
      menu.style.top = `${(top - layerRect.top) / scaleY}px`;
    };
    const schedule = () => {
      if (frame !== undefined) return;
      frame = ownerWindow.requestAnimationFrame(() => {
        frame = undefined;
        position();
      });
    };
    position();
    const observer = ownerWindow.ResizeObserver
      ? new ownerWindow.ResizeObserver(schedule)
      : undefined;
    observer?.observe(anchor);
    observer?.observe(menu);
    ownerWindow.addEventListener("scroll", schedule, true);
    ownerWindow.addEventListener("resize", schedule);
    return () => {
      observer?.disconnect();
      ownerWindow.removeEventListener("scroll", schedule, true);
      ownerWindow.removeEventListener("resize", schedule);
      if (frame !== undefined) ownerWindow.cancelAnimationFrame(frame);
    };
  }, [props.open, props.anchor]);
  useEffect(() => {
    if (props.open)
      menuRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  }, [props.open]);
  if (!props.open) return null;
  const { labels } = props;
  const actions: Array<[FolioBlockAction, string, boolean?]> = [
    ["copy", labels.copy],
    ["duplicate", labels.duplicate, !editable],
    ["copyLink", labels.copyLink, !props.canCopyLink],
    ["moveUp", labels.moveUp, !editable || !props.canMoveUp],
    ["moveDown", labels.moveDown, !editable || !props.canMoveDown],
    ["delete", labels.delete, !editable],
  ];
  return (
    <div className="folio-block-action-layer" ref={layerRef}>
      <div
        aria-label={labels.menu}
        className={["folio-block-action-menu", props.className].filter(Boolean).join(" ")}
        ref={menuRef}
        role="menu"
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            props.onClose();
            return;
          }
          if (event.target instanceof HTMLSelectElement) return;
          const items = Array.from(
            event.currentTarget.querySelectorAll<HTMLElement>(
              "button:not(:disabled), select:not(:disabled)",
            ),
          );
          const index = items.indexOf(event.target as HTMLElement);
          const next =
            event.key === "ArrowDown"
              ? (index + 1) % items.length
              : event.key === "ArrowUp"
                ? (index - 1 + items.length) % items.length
                : event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? items.length - 1
                    : -1;
          if (next >= 0) {
            event.preventDefault();
            event.stopPropagation();
            items[next]?.focus();
          }
        }}
      >
        <div aria-live="polite" className="folio-block-action-menu__count">
          {props.selectionCount} {labels.selected}
        </div>
        {actions.map(([action, label, disabled]) => (
          <button
            disabled={disabled}
            key={action}
            onClick={() => act(action)}
            onMouseDown={(event) => event.preventDefault()}
            role="menuitem"
            type="button"
          >
            {label}
          </button>
        ))}
        <div className="folio-block-action-menu__settings" role="group" aria-label={labels.convert}>
          <label>
            <span>{labels.convert}</span>
            <select
              aria-label={labels.convert}
              disabled={!editable}
              value=""
              onChange={(event) => {
                const conversion = conversions[Number(event.target.value)];
                if (conversion) act("convert", { type: conversion[1], attrs: conversion[2] });
              }}
            >
              <option value="">{labels.convert}…</option>
              {conversions.map(([label, type, attrs], index) => (
                <option
                  disabled={!editable || !props.canConvert(type, attrs)}
                  key={index}
                  value={index}
                >
                  {labels[label]}
                </option>
              ))}
            </select>
          </label>
          {(["color", "highlight"] as const).map((kind) => (
            <label key={kind}>
              <span>{labels[kind]}</span>
              <select
                aria-label={labels[kind]}
                disabled={!editable}
                value=""
                onChange={(event) =>
                  act(kind, {
                    color: event.target.value === "default" ? undefined : event.target.value,
                  })
                }
              >
                <option value="" disabled>
                  {labels[kind]}…
                </option>
                <option value="default">{labels.defaultColor}</option>
                {palette.map(([label, text, background]) => (
                  <option key={label} value={kind === "color" ? text : background}>
                    {labels[label]}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
