# 编辑能力与接入

本文介绍 Folio 0.2.0 的编辑能力与接入方式。下面的 API 由 `@futelab/folio/react` 导出；阅读器和转换器仍使用各自的服务端或浏览器入口。

## 从 0.1 升级

0.2 的默认 schema 继续读取 0.1 文档，同时新增 `columns`、`column` 节点和 `folioBlockId` 属性。编辑器生成的普通块也可能带有 `folioBlockId:null`；0.1 的严格校验器、阅读器和转换器不能保证读取这些文档。请同步升级处理同一文档的编辑器、阅读器和服务端转换器，并让协作参与者使用兼容的 schema。

快照封装格式仍为 `version:1`，它与 npm 包版本和文档 schema 的兼容性独立。升级前保留原始文档备份；需要回滚到 0.1 时使用备份，或显式迁移并校验 0.2 文档，避免静默丢失分栏和块链接。

## 块菜单与批量操作

悬停块后点击六点手柄打开菜单，也可以右键点击没有文字选区的块。菜单支持复制、创建副本、删除、转换、文字颜色、背景颜色、块链接和移动。不能无损转换的类型会禁用，表格等复合块不会被强行展开为纯文本。

在正文按 Escape 选中当前顶层块，Shift+上下方向键扩大范围，Ctrl/Cmd+A 选中全部块。左侧空白处可框选，Shift 点击手柄可连续选择。Delete/Backspace 删除，Enter/Escape 返回文字编辑。拖动选中范围内的手柄可以整组移动，复制、剪切和创建副本也作用于整组。普通文字选择和输入法组合输入保留原有行为。

底层提供 `setBlockSelection`、`getSelectedBlocks`、`duplicateSelectedBlocks`、`deleteSelectedBlocks`、`convertSelectedBlocks` 和 `moveSelectedBlocks`，便于宿主实现自己的操作界面。

复制块链接时按需写入 `folioBlockId`；JSON、HTML 和 Reader 保留该锚点。已有标题锚点不被覆盖，创建副本或粘贴冲突块时重新分配 ID。宿主应为不同文档提供稳定路由：

```tsx
<FolioEditor
  documentId={article.id}
  getBlockLink={({ documentId, anchorId }) =>
    `${location.origin}/articles/${encodeURIComponent(documentId!)}#${anchorId}`
  }
/>
```

Reader 默认给锚点添加实例前缀，防止同页多阅读器 ID 冲突。独立文章页可传 `headingIdPrefix=""` 使用原始链接，或者让链接解析器采用对应实例前缀。Markdown 无法保留块链接元数据或分栏，会明确拒绝导出；需要完整保真时使用 JSON 或 HTML。

## 可组合 UI 与浮层

```tsx
<FolioEditor
  ui={{ toolbar: "compact", tableControls: true }}
  portalContainer={overlayElement}
  components={{
    toolbar: ({ editor, children }) => (
      <div className="host-toolbar">
        <button
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          加粗
        </button>
        {children}
      </div>
    ),
  }}
/>
```

`toolbar` 支持 `default`、`compact`、`floating` 或 `false`。floating 使用随滚动停靠的工具栏。`toolbarActions` 可指定操作集合；`blockControls`、`bubbleToolbar`、`slashMenu`、`tableControls`、`search` 可分别关闭。工具栏、格式浮层、斜杠菜单、块菜单、媒体框、Mention、查找、评论和历史面板都提供组件插槽。

`portalContainer` 将浮层放到宿主容器，保留编辑器归属、选区、主题变量与坐标；支持滚动和缩放容器。低层组合可使用 `FolioUIProvider` 与 `FolioFloatingPortal`。宿主自定义按钮需要保留选区并遵守只读状态。

## 剪贴板

Folio 内复制使用版本化的私有 MIME，保留复合块及选区结构；同时写入 HTML 和纯文本以便其他应用读取。外部网页及 Word 内容经 schema 和 URL 规则清理。Ctrl/Cmd+Shift+V 强制纯文本，`clipboard.defaultPaste="plain-text"` 可以设为默认策略。

```tsx
<FolioEditor
  uploadImage={uploadToYourStorage}
  clipboard={{
    defaultPaste: "rich-text",
    onPaste: (event, { editor, plainText }) => {
      // 返回 true 表示宿主已经处理；false/void 继续默认流程。
    },
    onError: reportClipboardError,
  }}
/>
```

粘贴图片复用上传回调，异步完成后按映射后的书签插入；切换文档、销毁编辑器或变为只读会取消插入。浏览器或系统可能限制剪贴板权限；菜单复制无法写入私有 MIME 时会报告降级，HTML/纯文本仍可用。上传存储、鉴权和文件预算由宿主负责。

## 嵌套拖拽与分栏

拖拽按横向位置选择嵌套容器，纵向位置选择插入边界。支持提示块、引用、折叠内容、列表项和分栏；指示线显示目标容器宽度。不能拖入自身后代，结构槽和不兼容列表类型会拒绝落点。表格保持完整；空容器补齐合法段落。停在滚动边缘自动滚动，Escape 取消，移动可单步撤销。

工具栏提供两栏、三栏、相对列宽和拆分栏。小屏阅读与编辑按顺序纵向排列。底层可调用 `createColumns(editor, 2, [2, 1])`、`setColumnWidths(editor, columnsPosition, [1, 2])`、`removeColumns(editor)`；`moveBlockRange` 与 `canMoveBlockRange` 提供跨容器的模型操作。已经具有外部块链接的栏容器会拒绝直接拆除，防止静默丢失锚点。

## 查找替换

Ctrl/Cmd+F 或工具栏打开文档查找，支持大小写、全词、高亮、匹配计数、循环导航、单次替换及全部替换。Enter/Shift+Enter 切换匹配，Escape 关闭。查找跨文字标记，不跨段落、硬换行或内联原子节点。只读模式保留查找、评论和历史浏览入口，禁止替换正文、保存版本或恢复版本；评论仍由独立权限回调控制。全部替换是一项独立撤销操作。

组合入口为 `useFolioSearch(editor)` 和 `SearchPanel`。默认最多显示 2000 个匹配，超过上限会明确提示并禁止“全部替换”，避免只改动部分匹配。

## 协作与评论

```tsx
<FolioEditor
  documentId="article-42"
  collaboration={{
    document: peerYDoc,
    provider: yourYjsProvider,
    user: { id: "alice", name: "Alice", color: "#2563eb" },
    onStatusChange: setConnectionState,
  }}
  comments={{ store: articleCommentStore, user: { id: "alice", name: "Alice" } }}
/>
```

协作模式以 Y.Doc 为唯一正文来源，忽略 `value/defaultValue` 的内容替换。使用 `initializeFolioCollaboration` 显式初始化空共享文档，避免多个客户端各自播种造成重复。每个参与者使用独立 Y.Doc；本地撤销只撤销自己的修改，远程修改可进入只读编辑器。Provider 可提供 Awareness 以显示姓名、远程光标和选区。默认连接/断开由组件管理，宿主共享连接可设 `manageConnection:false`。组件不销毁宿主的 Y.Doc 或 Awareness。

`createFolioCollaborationRoom({ initialValue })` 和 `room.createPeer()` 提供进程内的真实双 Doc 更新桥，适合演示和测试。它不是网络服务；生产环境需要提供 WebSocket/WebRTC 等传输、身份认证、持久化、访问控制和部署。

评论支持文字/块锚点、回复、解决、重开、删除及权限回调。锚点随编辑事务映射；原文删除后保留孤立线程并提示。`FolioCommentStore` 用稳定 `getSnapshot`/`subscribe` 订阅，写入方法可以异步持久化。`can(request)` 供前端交互判断，服务器仍需验证权限。评论独立于正文 JSON，每篇文档应使用自己的 store。

默认 `createMemoryCommentStore()` 仅在内存保存。跨客户端共享评论时，宿主需要把线程、锚点与版本映射同步到评论服务；不能只共享同一个正文 Y.Doc 就认为评论也已持久化或跨进程同步。

## 版本历史

```tsx
<FolioEditor
  documentId="article-42"
  history={{
    adapter: yourHistoryAdapter,
    author: { id: "alice", name: "Alice" },
    autoSaveIntervalMs: 30000,
    onError: reportError,
  }}
/>
```

`FolioHistoryAdapter` 提供 `list`、`load`、`create`，可选 `subscribe`；请求携带 AbortSignal，切页和过期请求不会覆盖当前文档。面板支持命名保存、版本列表、Reader 对照预览、顶层块结构差异统计和恢复。恢复经过当前 schema 校验、独立撤销，并创建恢复检查点。只读模式禁止保存/恢复。`autoSaveIntervalMs:0` 关闭自动检查点，默认 30 秒，内容未变不重复保存。

`compareFolioRevisions` 对比的是块结构和内容，并非逐字修订跟踪；超大文档超过精确比较预算时，`approximate` 明确标记近似统计。`createMemoryFolioHistoryAdapter({maxRevisions:50})` 是可替换的内存实现，生产版本存储及保留策略由宿主决定。

## 本地验收

运行 `pnpm build` 后运行 `pnpm demo`，访问 `http://127.0.0.1:55399/`。侧栏“功能实验室”可以切换工具栏、Portal、纯文本粘贴和双人协作。Demo 正文继续写入本地存储；评论、版本和房间重载后重置，界面有说明。

建议先验证空白页面及标题、表格边缘控制，再验证块菜单和框选、组拖拽与嵌套/分栏、Word/图片粘贴、查找替换撤销、双人同步和只读、评论生命周期、版本恢复及撤销。
