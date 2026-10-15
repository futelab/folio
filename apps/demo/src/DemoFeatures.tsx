import { useCallback, useSyncExternalStore } from "react";
import {
  FolioEditor,
  createFolioCollaborationRoom,
  createMemoryCommentStore,
  createMemoryFolioHistoryAdapter,
} from "@futelab/folio/react";
import type { FolioEditorProps, FolioToolbarProps } from "@futelab/folio/react";
import type { FolioDocument } from "@futelab/folio/core";

export interface DemoFeatureSettings {
  toolbar: "default" | "compact" | "floating" | "hidden" | "custom";
  portal: boolean;
  plainPaste: boolean;
  peerReadOnly: boolean;
}
export const defaultDemoFeatureSettings: DemoFeatureSettings = {
  toolbar: "default",
  portal: false,
  plainPaste: false,
  peerReadOnly: false,
};
export function createDemoPageFeatures(pages: readonly { id: string; document: FolioDocument }[]) {
  return {
    history: createMemoryFolioHistoryAdapter({
      initial: pages.map((page) => ({
        id: `initial-${page.id}`,
        documentId: page.id,
        document: page.document,
        createdAt: Date.now(),
        label: "Initial demo version",
        author: { id: "maya", name: "Maya" },
      })),
    }),
    comments: new Map(pages.map((page) => [page.id, createMemoryCommentStore()])),
  };
}
export type DemoPageFeatures = ReturnType<typeof createDemoPageFeatures>;
export function createDemoCollaboration(document: FolioDocument) {
  const room = createFolioCollaborationRoom({ initialValue: document });
  return { room, left: room.createPeer(), right: room.createPeer() };
}
export type DemoCollaboration = ReturnType<typeof createDemoCollaboration>;

const featureCopy = {
  en: {
    title: "Feature laboratory",
    toolbar: "Toolbar mode",
    default: "Full toolbar",
    compact: "Compact toolbar",
    floating: "Floating toolbar",
    hidden: "Hidden toolbar",
    custom: "Custom toolbar slot",
    portal: "Mount floating UI outside the editor",
    plainPaste: "Paste as plain text",
    collaboration: "Two-person collaboration",
    peerReadOnly: "Make Bob read-only",
    memory:
      "Comments, versions and the collaboration room live in memory for this demo. They reset after reload. Page documents still save locally.",
    help: "Right-click a block for actions. Shift-click or drag from the gutter to select blocks; use Columns or Find and replace in the full toolbar. Paste an image to try the upload callback.",
    peer: "Bob's editor",
    status: "Room connection",
    synced: "Connected and synced",
    disconnected: "Disconnected",
    customLabel: "Host toolbar slot",
    hostBold: "Host bold action",
  },
  "zh-CN": {
    title: "功能实验室",
    toolbar: "工具栏模式",
    default: "完整工具栏",
    compact: "精简工具栏",
    floating: "浮动工具栏",
    hidden: "隐藏工具栏",
    custom: "自定义工具栏插槽",
    portal: "将浮层挂载到编辑器外部",
    plainPaste: "以纯文本粘贴",
    collaboration: "双人协作",
    peerReadOnly: "将 Bob 设为只读",
    memory:
      "本演示的评论、版本和协作房间只保存在内存中，刷新后会重置。页面正文仍会保存在浏览器本地。",
    help: "右键点击块可打开动作菜单。Shift 点击或从左侧空白处框选可批量操作；完整工具栏提供分栏与查找替换。可粘贴图片体验上传回调。",
    peer: "Bob 的编辑器",
    status: "房间连接",
    synced: "已连接并同步",
    disconnected: "未连接",
    customLabel: "宿主工具栏插槽",
    hostBold: "宿主加粗操作",
  },
} as const;

export function DemoFeatureControls({
  locale,
  settings,
  onChange,
  collaborating,
  onCollaborationChange,
}: {
  locale: "en" | "zh-CN";
  settings: DemoFeatureSettings;
  onChange: (settings: DemoFeatureSettings) => void;
  collaborating: boolean;
  onCollaborationChange: (enabled: boolean) => void;
}) {
  const copy = featureCopy[locale];
  return (
    <>
      <p>{copy.memory}</p>
      <details className="folio-demo__feature-controls">
        <summary>{copy.title}</summary>
        <label>
          {copy.toolbar}
          <select
            aria-label={copy.toolbar}
            value={settings.toolbar}
            onChange={(event) =>
              onChange({
                ...settings,
                toolbar: event.target.value as DemoFeatureSettings["toolbar"],
              })
            }
          >
            {(["default", "compact", "floating", "hidden", "custom"] as const).map((mode) => (
              <option key={mode} value={mode}>
                {copy[mode]}
              </option>
            ))}
          </select>
        </label>
        <label className="folio-demo__toggle">
          <input
            type="checkbox"
            checked={settings.portal}
            onChange={(event) => onChange({ ...settings, portal: event.target.checked })}
          />
          {copy.portal}
        </label>
        <label className="folio-demo__toggle">
          <input
            type="checkbox"
            checked={settings.plainPaste}
            onChange={(event) => onChange({ ...settings, plainPaste: event.target.checked })}
          />
          {copy.plainPaste}
        </label>
        <label className="folio-demo__toggle">
          <input
            type="checkbox"
            checked={collaborating}
            onChange={(event) => onCollaborationChange(event.target.checked)}
          />
          {copy.collaboration}
        </label>
        {collaborating ? (
          <label className="folio-demo__toggle">
            <input
              type="checkbox"
              checked={settings.peerReadOnly}
              onChange={(event) => onChange({ ...settings, peerReadOnly: event.target.checked })}
            />
            {copy.peerReadOnly}
          </label>
        ) : null}
        <p>{copy.help}</p>
      </details>
    </>
  );
}

function DemoToolbar({ editor, children, messages }: FolioToolbarProps) {
  const chinese = messages.ui.placeholder.includes("输入");
  const copy = featureCopy[chinese ? "zh-CN" : "en"];
  return (
    <div className="folio-demo__custom-toolbar" data-testid="demo-custom-toolbar">
      <strong>{copy.customLabel}</strong>
      <button
        type="button"
        aria-pressed={editor.isActive("bold")}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => editor.chain().focus().toggleMark("bold").run()}
      >
        {copy.hostBold}
      </button>
      {children}
    </div>
  );
}
function DemoRoomStatus({
  session,
  locale,
}: {
  session: DemoCollaboration;
  locale: "en" | "zh-CN";
}) {
  const provider = session.left.provider;
  const subscribe = useCallback(
    (listener: () => void) => {
      provider.on?.("status", listener);
      provider.on?.("sync", listener);
      return () => {
        provider.off?.("status", listener);
        provider.off?.("sync", listener);
      };
    },
    [provider],
  );
  const snapshot = useCallback(() => (provider.synced ? "synced" : "disconnected"), [provider]);
  const status = useSyncExternalStore(subscribe, snapshot, snapshot);
  const copy = featureCopy[locale];
  return (
    <p className="folio-demo__room-status" role="status">
      {copy.status}: {copy[status]}
    </p>
  );
}

export function DemoFeatureEditor({
  settings,
  features,
  session,
  ...props
}: FolioEditorProps & {
  settings: DemoFeatureSettings;
  features: DemoPageFeatures;
  session: DemoCollaboration | null;
}) {
  const locale = props.locale === "zh-CN" ? "zh-CN" : "en";
  const store = features.comments.get(props.documentId ?? "");
  const ui = {
    toolbar:
      settings.toolbar === "hidden"
        ? (false as const)
        : settings.toolbar === "custom"
          ? ("compact" as const)
          : settings.toolbar,
  };
  const common = {
    ...props,
    ui,
    portalContainer: settings.portal ? document.body : undefined,
    components: settings.toolbar === "custom" ? { toolbar: DemoToolbar } : undefined,
    clipboard: {
      defaultPaste: settings.plainPaste ? ("plain-text" as const) : ("rich-text" as const),
      uploadImage: props.uploadImage,
    },
    getBlockLink: ({ anchorId }: Parameters<NonNullable<FolioEditorProps["getBlockLink"]>>[0]) => {
      const url = new URL(window.location.href);
      if (props.documentId) url.searchParams.set("page", props.documentId);
      url.hash = anchorId;
      return url.toString();
    },
  };
  const history = {
    adapter: features.history,
    author: { id: "maya", name: "Maya" },
    autoSaveIntervalMs: 30000,
  };
  const comments = store ? { store, user: { id: "maya", name: "Maya" } } : undefined;
  return (
    <>
      {session ? <DemoRoomStatus session={session} locale={locale} /> : null}
      <FolioEditor
        {...common}
        key={session ? "collaboration" : "local"}
        history={history}
        comments={comments}
        collaboration={
          session
            ? {
                document: session.left.document,
                provider: session.left.provider,
                user: { id: "maya", name: "Maya", color: "#2563eb" },
              }
            : undefined
        }
      />
      {session ? (
        <section aria-label={featureCopy[locale].peer} className="folio-demo__collaborator">
          <h2>{featureCopy[locale].peer}</h2>
          <FolioEditor
            {...common}
            documentId={`${props.documentId}-bob`}
            value={undefined}
            onChange={undefined}
            editable={props.editable !== false && !settings.peerReadOnly}
            comments={store ? { store, user: { id: "bob", name: "Bob" } } : undefined}
            collaboration={{
              document: session.right.document,
              provider: session.right.provider,
              user: { id: "bob", name: "Bob", color: "#a855f7" },
            }}
          />
        </section>
      ) : null}
    </>
  );
}
