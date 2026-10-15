# Folio

[English](./README.md) · [在线演示](https://futelab.github.io/folio/) · [发布说明](./docs/RELEASING.md)

Folio 是基于 Tiptap 的 React 文档编辑与阅读组件库，对外包名为 `@futelab/folio`，使用兼容 Tiptap 的 JSON 文档，采用 MIT 许可证。

## 功能

- 段落、三级标题、嵌套列表和待办、引用、分隔线、代码、可调整列宽的表格、带说明图片、书签、提示框、折叠块、Mention 和目录。
- 可搜索斜杠菜单、选区格式工具栏、下方插入块、拖拽排序和键盘移动。
- 图片地址与上传流程、媒体说明编辑、链接输入、Mention 候选选择和表格管理。
- 事务级只读、受控/非受控状态、文档间隔离的撤销历史。
- 支持服务端渲染的阅读器、自定义节点/标记、唯一目录锚点和渲染规模限制。
- 递归文档校验、版本化存储、HTML/Markdown 转换及明确的失败反馈。
- 英语、简体中文、实例级翻译和 CSS 变量主题。

## 安装与示例

```sh
pnpm add @futelab/folio react react-dom
```

真实打包消费测试覆盖 React 18.3 和 React 19。开发与 CI 使用 Node 24，以及 `package.json` 声明的 pnpm 版本。

```tsx
"use client";
import { useState } from "react";
import "@futelab/folio/styles.css";
import { createEmptyFolioDocument } from "@futelab/folio/core";
import { FolioEditor, FolioReader } from "@futelab/folio/react";

export function Article() {
  const [document, setDocument] = useState(createEmptyFolioDocument);
  return (
    <>
      <FolioEditor documentId="article-42" value={document} onChange={setDocument} />
      <FolioReader value={document} />
    </>
  );
}
```

## 包入口

| 入口                           | 用途                                               |
| ------------------------------ | -------------------------------------------------- |
| `@futelab/folio/core`          | 文档、校验、版本化快照、扩展、命令和 URL 策略。    |
| `@futelab/folio/react`         | 客户端编辑器、阅读器、hooks、菜单及控件。          |
| `@futelab/folio/reader`        | 不包含编辑器客户端边界的阅读入口，适合服务端组件。 |
| `@futelab/folio/serialization` | HTML/Markdown 转换，按环境选择浏览器或 Node 实现。 |
| `@futelab/folio/styles.css`    | 全部默认样式。                                     |
| `@futelab/folio`               | 合并客户端入口，推荐优先使用具体子路径。           |

ESM、CommonJS 均提供对应类型声明。Next.js 编辑器应放在 client component；服务端页面从 `/reader` 导入阅读器，在根布局引入 CSS。

## 编辑器契约

- `value` + `onChange` 为受控模式；`defaultValue` 仅提供非受控初始内容。
- `documentId` 是文档身份。切换身份会新建编辑器并隔离选区、撤销历史；真正的外部内容替换也会重置历史，正常父级回传保留实例及历史。
- `onChange` 返回 JSON。应用负责防抖保存、服务端存储和冲突处理。
- `editable={false}` 隐藏写入控件，并阻止修改文档的事务，包括直接编辑器命令。无效输入会冻结写入，通过 `onError(error)` 报错并保留最近有效文档。
- `uploadImage(file)` 返回托管 URL 或 `{ src, alt?, caption? }`。组件处理加载、失败、重试和取消；上传鉴权、文件大小和存储由应用实现，凭据不得写入文档。
- `mentionSuggestions` 接受 `{ id, label }[]`，可通过工具栏、`@` 或斜杠入口选择。
- `locale="zh-CN"`、`translations`、`labels` 控制文案；`placeholder`、`className`、`classNames` 控制表现。
- `useFolioEditor` 返回底层编辑器；菜单和控件可单独组合。

块加号会在当前顶层块下方新建段落。拖拽、Alt+Shift+上下方向键、文档操作按钮均可移动块。表格边缘加号向末尾追加；表格内选区可操作删行列、切换表头、合并/拆分单元格和删除表格。

## 保存、校验与恢复

```ts
import {
  createFolioSnapshot,
  parseFolioSnapshot,
  validateFolioDocument,
} from "@futelab/folio/core";

const stored = JSON.stringify(createFolioSnapshot(document));
// 返回 { format: "folio", version: 1, document }，兼容旧的裸 JSON。
const loaded = parseFolioSnapshot(stored).document;
const result = validateFolioDocument(loaded); // { valid, errors: [{ code, path, message }] }
```

`parseFolioDocument`、`parseFolioSnapshot` 失败时抛 `FolioDocumentValidationError`，详情见 `issues`。`isFolioDocument` 现在执行完整校验。未知未来版本和不支持的数据会被拒绝。应用应保留原始存档、提供备份/恢复入口，避免读取失败后自动保存空白文档覆盖原数据。Demo 展示了这一流程、旧格式迁移及 localStorage 配额失败处理。

默认限制为 10,000 节点、64 层深度、文本与属性合计两百万字符，可通过 `limits` 调整。稳定 schema 可用 `createFolioDocumentValidator(options)` 复用编译后的校验器。快照格式版本与 npm 包版本独立。

## 阅读器与扩展

`FolioReader` 支持 `value: unknown`、`extensions`、`headingIdPrefix`、`limits`、`maxRenderedNodes`、`onError`、`renderError`、`className`、`classNames.root`。保留列表起始编号、表格合并/列宽、代码语言、图片说明；非法、未知或渲染失败的内容会显示诊断。

阅读器的 `onError` 在渲染时同步调用，可能重复执行，必须是纯诊断回调；不要在其中更新 React state。需要自定义降级界面时使用 `renderError`。同一 React root 中的目录 ID 自动隔离；独立 roots 或直接调用 `renderFolioNode` 时，应显式设置不同且稳定的 `headingIdPrefix`。默认渲染预算为 50,000 个生成元素，包含目录展开。

扩展可贡献 `tiptapExtensions`、命令及 `renderers`。渲染器形式为 `{ type, kind?: "node" | "mark", render(node, { children, path }) }`，阅读器与转换工具应传入相同扩展。节点与标记的 schema 由 Tiptap 定义；扩展和贡献名称须唯一，自定义命令可以按名称覆盖默认命令。缺少格式处理器的扩展内容会明确报错。

## HTML 与 Markdown

```ts
import { fromHTML, toHTML, fromMarkdown, toMarkdown } from "@futelab/folio/serialization";
const document = fromHTML("<h2>笔记</h2><p>你好</p>");
const html = toHTML(document);
const markdown = toMarkdown(document);
const parsed = fromMarkdown(markdown);
```

转换工具第二参数支持 `{ extensions, limits }`。HTML 按 schema 校验内容和 URL，拒绝不支持或具有执行能力的标签/属性，并导出真实目录、可见图片说明和书签描述。阅读器、媒体输入和转换共享 URL 策略：图片允许 HTTP/HTTPS、安全相对路径、栅格 base64；链接另支持 mailto/tel。拒绝 SVG data URL 和危险协议。

Markdown 导出仅接受能够无损表达的内容：基础块、列表/待办、代码、引用、分隔线、无说明图片和常见标记。表格、提示框、书签、折叠块、图片说明、颜色、下划线及不支持的属性会抛 `FolioMarkdownSerializationError`。自定义扩展需要对应 Markdown handlers，并通过实际往返检查。Markdown 中的 raw HTML token 在浏览器和 Node 中统一拒绝，请改用 `fromHTML`；代码围栏、行内代码和 Markdown 自动链接不受影响。

Tiptap 会为标题生成匹配的 `id`/`data-toc-id`。如果确认这些目录锚点可以重新生成，可显式使用 `toMarkdown(document, { headingIds: "omit-matching-toc" })`。默认策略仍保留 ID；单独的作者 ID、不匹配的 ID 对及其他属性不会被静默丢弃，转换也不会修改原文档。Demo 使用这一显式策略并显示说明。

## 样式与开发

通过容器覆盖 `--folio-color-bg`、`--folio-color-text`、`--folio-color-border`、`--folio-color-accent`、`--folio-font-family` 等变量。编辑器 class hooks 为 `root`、`content`、`blockControls`、`bubbleToolbar`、`slashMenu`。默认 CSS 包含媒体弹窗、Mention、表格和阅读诊断样式。

```sh
pnpm install --frozen-lockfile
pnpm demo
pnpm check
pnpm exec playwright install chromium firefox webkit
pnpm test:e2e
pnpm test:package
```

Demo 地址为 `http://127.0.0.1:55399/`，包含语言切换、只读、JSON/HTML/Markdown 导入导出、本地图片示例和保存状态。演示数据仅存浏览器；生产应用应提供托管图片 URL 和服务端保存。

`format`/`format:check` 使用 Oxfmt，`lint`/`lint:fix` 使用 Oxlint，无需 ESLint 或 Prettier。CI 覆盖格式、lint、类型、单测/Node SSR、构建、生产依赖审计、三种桌面浏览器及移动端流程，并将实际 tarball 安装到 React 18/19/Next.js 验证 ESM/CJS 类型与运行、SSR、生产构建、浏览器水合和交互。

自动发布、npm 首次授权和 GitHub Pages 配置见[发布说明](./docs/RELEASING.md)。
