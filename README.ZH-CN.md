# Folio

[English](./README.md)

Folio 是一个用于构建 Notion-like 富文本编辑和阅读体验的 React 组件库。它以
JSON 文档为核心，底层基于 Tiptap，发布包名为 `@futelab/folio`。适合在业务
系统、内容后台、知识库、CMS、笔记、文档协作等场景中复用。

当前版本仍处于 alpha 阶段。核心 API 已经可以使用，但编辑交互和扩展能力还会
继续迭代，后续小版本可能存在破坏性调整。

## 能力概览

- 开箱即用的 React 富文本编辑器，写作体验向 Notion 靠拢。
- 输入 `/` 打开块命令菜单。
- 行 hover 后显示块级侧边控件，可从当前行打开命令菜单。
- 选中文本后显示浮动格式工具栏。
- 表格 hover/focus 后显示新增行、列的 `+` 控件。
- 阅读器组件 `FolioReader`，不挂载编辑器也能渲染保存后的 JSON 文档。
- 提供文档类型、默认 Tiptap 扩展、默认块命令、HTML/Markdown 序列化工具。
- 提供统一 CSS 入口，支持通过 CSS 变量做主题定制。

## 安装

```bash
pnpm add @futelab/folio react react-dom
```

`react` 和 `react-dom` 是 peer dependencies。Folio 支持 React 18 及以上版本。

在应用入口导入样式：

```ts
import "@futelab/folio/styles.css";
```

如果是 Vite 项目，通常放在 `src/main.tsx`。如果是 Next.js App Router 项目，
通常放在 `app/layout.tsx` 或全局样式入口中。

## 最小示例

```tsx
import { useState } from "react";
import "@futelab/folio/styles.css";
import { createEmptyFolioDocument } from "@futelab/folio/core";
import type { FolioDocument } from "@futelab/folio/core";
import { FolioEditor, FolioReader } from "@futelab/folio/react";

export function ArticleEditor() {
  const [document, setDocument] = useState<FolioDocument>(() =>
    createEmptyFolioDocument(),
  );

  return (
    <div className="article-editor">
      <FolioEditor
        value={document}
        onChange={setDocument}
        placeholder="Type '/' for commands"
      />

      <aside>
        <FolioReader value={document} />
      </aside>
    </div>
  );
}
```

`FolioEditor` 的 `onChange` 会返回 `FolioDocument`。它本质上是兼容 Tiptap 的
JSON 文档。推荐把这份 JSON 作为数据库里的主存储格式，HTML 和 Markdown 更适合
用于导入、导出或对接外部系统。

## 客户端渲染说明

`FolioEditor` 是交互式浏览器组件。在 Next.js App Router 中，需要放在 client
component 中：

```tsx
"use client";

import { useState } from "react";
import { createEmptyFolioDocument } from "@futelab/folio/core";
import type { FolioDocument } from "@futelab/folio/core";
import { FolioEditor } from "@futelab/folio/react";

export function ClientEditor() {
  const [value, setValue] = useState<FolioDocument>(() =>
    createEmptyFolioDocument(),
  );

  return <FolioEditor value={value} onChange={setValue} />;
}
```

如果只是展示已经保存的内容，优先使用 `FolioReader`。它会输出普通 React 节点，
不需要挂载 ProseMirror 编辑器。

## 编辑器用法

### 受控模式

业务应用最常用的是受控模式：由外部 state 持有文档，编辑器每次更新时通过
`onChange` 把新文档交给外部。

```tsx
import type { FolioDocument } from "@futelab/folio/core";
import { FolioEditor } from "@futelab/folio/react";

interface Props {
  value: FolioDocument;
  onSaveDraft: (value: FolioDocument) => void;
}

export function ControlledFolioEditor({ value, onSaveDraft }: Props) {
  return (
    <FolioEditor
      value={value}
      onChange={onSaveDraft}
      placeholder="Write something..."
    />
  );
}
```

推荐在这些场景使用受控模式：

- 表单编辑
- 自动保存
- 编辑器和右侧预览联动
- 文档状态需要同步到外部 store
- 未来接入协作状态或服务端草稿状态

### 非受控模式

如果你只想传入初始内容，并在变化时拿到最新文档，可以使用 `defaultValue`：

```tsx
import {
  createEmptyFolioDocument,
  type FolioDocument,
} from "@futelab/folio/core";
import { FolioEditor } from "@futelab/folio/react";

export function DraftEditor() {
  function handleChange(nextDocument: FolioDocument) {
    window.localStorage.setItem("draft", JSON.stringify(nextDocument));
  }

  return (
    <FolioEditor
      defaultValue={createEmptyFolioDocument()}
      onChange={handleChange}
    />
  );
}
```

### 只读编辑器

如果你想保留编辑器外观，但禁止编辑：

```tsx
<FolioEditor value={document} editable={false} />
```

如果是正式发布页、详情页或阅读页，建议使用 `FolioReader`，它更轻，也更适合
SSR 或静态渲染场景。

## 阅读器用法

```tsx
import type { FolioDocument } from "@futelab/folio/core";
import { FolioReader } from "@futelab/folio/react";

export function PublishedArticle({ document }: { document: FolioDocument }) {
  return <FolioReader className="article-body" value={document} />;
}
```

`FolioReader` 支持默认 Folio 文档节点，包括：

- 段落
- 一级、二级、三级标题
- 无序列表、有序列表、任务列表
- 引用
- 代码块
- 图片
- 表格
- Toggle 折叠块
- Callout
- Bookmark
- Mention
- 目录块

阅读器渲染链接和图片时会做 URL 安全处理。链接允许 `http:`、`https:`、
`mailto:`、`tel:` 和安全的相对路径。图片允许 `http:`、`https:`、安全相对路径
和 base64 data image。

## 保存和读取文档

Folio 文档就是普通 JSON。下面是一个使用 localStorage 保存草稿的例子：

```tsx
import { useEffect, useState } from "react";
import {
  createEmptyFolioDocument,
  isFolioDocument,
  type FolioDocument,
} from "@futelab/folio/core";
import { FolioEditor } from "@futelab/folio/react";

const STORAGE_KEY = "my-app.article";

function loadDocument(): FolioDocument {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : undefined;

    return isFolioDocument(parsed) ? parsed : createEmptyFolioDocument();
  } catch {
    return createEmptyFolioDocument();
  }
}

export function LocalDraft() {
  const [document, setDocument] = useState<FolioDocument>(loadDocument);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(document));
  }, [document]);

  return <FolioEditor value={document} onChange={setDocument} />;
}
```

如果保存到服务端，推荐直接保存 `FolioDocument` JSON。数据库可以使用 JSON/JSONB
字段，也可以使用普通文本字段保存序列化后的 JSON 字符串。

生产环境中不要在每一次 `onChange` 后立即请求接口，建议做 debounce、批量保存或
和业务表单的保存按钮结合。

## 文档数据结构

核心类型是 `FolioDocument`：

```ts
import type { FolioDocument } from "@futelab/folio/core";

const document: FolioDocument = {
  type: "doc",
  content: [
    {
      type: "heading",
      attrs: { level: 1 },
      content: [{ type: "text", text: "Product notes" }],
    },
    {
      type: "paragraph",
      content: [{ type: "text", text: "Write with Folio." }],
    },
  ],
};
```

常用文档工具：

```ts
import {
  createEmptyFolioDocument,
  isFolioDocument,
  sampleFolioDocument,
} from "@futelab/folio/core";
```

- `createEmptyFolioDocument()`：创建空白文档。
- `isFolioDocument(value)`：判断解析出来的值是否是 Folio 文档。
- `sampleFolioDocument`：内置示例文档，可用于测试、Storybook 或 demo。

## 内置编辑交互

`FolioEditor` 内置了这些交互：

- 在文本块中输入 `/` 打开 slash command 菜单。
- slash 菜单支持 `ArrowUp`、`ArrowDown`、`Home`、`End`、`Enter`、`Escape`。
- hover 到块上时，左侧显示块级控制按钮，点击 `+` 会在当前行打开块命令菜单。
- 选中文本时，在选区附近显示浮动格式工具栏。
- hover 或 focus 到表格时，右侧 `+` 新增列，底部 `+` 新增行。

默认 slash command 包括：

- Text
- Heading 1、Heading 2、Heading 3
- Bulleted list、Numbered list、Todo list
- Quote
- Callout
- Divider
- Code block
- Table
- Image
- Bookmark
- Toggle
- Table of contents

当前 alpha 版本里的图片和 Bookmark 命令还比较基础。生产项目通常会根据自己的业务
接入上传、素材库、链接解析、Bookmark 元数据抓取等流程。

## HTML 和 Markdown 序列化

序列化工具从单独入口导入：

```ts
import {
  fromHTML,
  fromMarkdown,
  toHTML,
  toMarkdown,
} from "@futelab/folio/serialization";
```

### HTML

```ts
const html = toHTML(document);
const parsedDocument = fromHTML("<h1>Hello</h1><p>World</p>");
```

HTML 序列化使用 Folio 默认的 Tiptap schema。

### Markdown

```ts
const markdown = toMarkdown(document);
const parsedDocument = fromMarkdown("# Hello");
```

Markdown 序列化采用“尽量不丢数据”的策略。`toMarkdown` 支持可以无损表达的子集：
段落、标题、列表、任务列表、引用、分割线、代码块、硬换行、无 caption 的图片和
常见文本 mark。

如果文档里包含 Markdown 无法无损表达的节点，例如表格、Callout、Bookmark、
Toggle、目录块，`toMarkdown` 会抛出 `FolioMarkdownSerializationError`。这比静默
丢内容更安全。

## 样式和主题定制

导入默认样式：

```ts
import "@futelab/folio/styles.css";
```

默认样式包含编辑器、阅读器、菜单和交互控件。主题通过 CSS 变量控制，可以全局覆盖，
也可以包在某个容器里局部覆盖：

```css
.my-folio-scope {
  --folio-color-bg: #ffffff;
  --folio-color-text: #1f2328;
  --folio-color-muted: #6b7280;
  --folio-color-border: #d8dee4;
  --folio-color-hover: #f6f8fa;
  --folio-color-selected: #ddf4ff;
  --folio-color-accent: #0969da;
  --folio-font-family: Inter, ui-sans-serif, system-ui, sans-serif;
}
```

使用局部主题：

```tsx
<div className="my-folio-scope">
  <FolioEditor value={document} onChange={setDocument} />
</div>
```

也可以给编辑器内部区域传入自定义 class：

```tsx
<FolioEditor
  className="article-editor"
  classNames={{
    root: "article-editor__root",
    content: "article-editor__content",
    blockControls: "article-editor__block-controls",
    bubbleToolbar: "article-editor__toolbar",
    slashMenu: "article-editor__commands",
  }}
  value={document}
  onChange={setDocument}
/>
```

## API 说明

### 包入口

| 入口 | 用途 |
| --- | --- |
| `@futelab/folio` | 合并导出，简单项目可以直接用，但更推荐使用下面的明确子路径。 |
| `@futelab/folio/react` | React 组件和 hooks。 |
| `@futelab/folio/core` | 文档类型、默认扩展、默认命令、核心工具。 |
| `@futelab/folio/serialization` | HTML 和 Markdown 导入导出工具。 |
| `@futelab/folio/styles.css` | 默认编辑器和阅读器样式。 |

### `FolioEditor`

```tsx
import { FolioEditor } from "@futelab/folio/react";
```

| Prop | 类型 | 说明 |
| --- | --- | --- |
| `value` | `FolioDocument` | 受控文档值。 |
| `defaultValue` | `FolioDocument` | 非受控模式下的初始文档。 |
| `onChange` | `(value: FolioDocument) => void` | 编辑器内容变化时触发。 |
| `editable` | `boolean` | 是否允许编辑，默认 `true`。 |
| `extensions` | `FolioExtension[]` | 在默认 schema 上追加 Tiptap 扩展。 |
| `placeholder` | `string` | 空内容占位文案。 |
| `className` | `string` | 编辑器根节点附加 class。 |
| `classNames` | `FolioEditorClassNames` | root、content、blockControls、bubbleToolbar、slashMenu 的 class hook。 |
| `initialSlashQuery` | `string` | 初始打开 slash 菜单，主要用于 demo 和测试。 |

### `FolioReader`

```tsx
import { FolioReader } from "@futelab/folio/react";
```

| Prop | 类型 | 说明 |
| --- | --- | --- |
| `value` | `FolioDocument` | 要渲染的文档。 |
| `className` | `string` | 阅读器根节点附加 class。 |
| `classNames.root` | `string` | 阅读器根节点 class hook。 |

### `useFolioEditor`

如果你不想直接使用 `FolioEditor`，而是想自己组合编辑器外壳，可以使用底层 hook：

```tsx
import { EditorContent } from "@tiptap/react";
import { useFolioEditor } from "@futelab/folio/react";

export function CustomEditorShell() {
  const editor = useFolioEditor({
    placeholder: "Write...",
  });

  return <EditorContent editor={editor} />;
}
```

`useFolioEditor` 支持和 `FolioEditor` 相同的状态类参数：`value`、`defaultValue`、
`onChange`、`editable`、`extensions`、`placeholder`。

### Core 工具

```ts
import {
  createDefaultFolioCommands,
  createDefaultTiptapExtensions,
  createEmptyFolioDocument,
  createFolioExtension,
  createFolioExtensionRegistry,
  isFolioDocument,
} from "@futelab/folio/core";
```

这些工具适合用于自定义编辑器外壳、校验加载出来的 JSON、构建扩展元数据等场景。

## 扩展用法

Folio extension 可以把自定义 Tiptap extension 注入到默认编辑器中：

```tsx
import { Extension } from "@tiptap/core";
import { createFolioExtension } from "@futelab/folio/core";
import { FolioEditor } from "@futelab/folio/react";
import type { FolioDocument } from "@futelab/folio/core";

const WordCountExtension = Extension.create({
  name: "wordCount",
});

const wordCount = createFolioExtension({
  name: "word-count",
  tiptapExtensions: [WordCountExtension],
});

export function EditorWithExtensions({
  document,
  setDocument,
}: {
  document: FolioDocument;
  setDocument: (value: FolioDocument) => void;
}) {
  return (
    <FolioEditor
      extensions={[wordCount]}
      value={document}
      onChange={setDocument}
    />
  );
}
```

当前 alpha 版本重点先覆盖默认 schema 和 Notion-like 交互。如果你需要完全自定义
slash command，可以用 `useFolioEditor`、`SlashMenu` 和自己的 command 列表组合一个
自定义编辑器外壳。

## 本地开发

仓库使用 pnpm、Turborepo 和 Changesets：

```bash
pnpm install
pnpm demo
```

demo 默认运行在：

```text
http://127.0.0.1:55399/
```

常用命令：

```bash
pnpm typecheck
pnpm test
pnpm lint
pnpm build
pnpm test:e2e
pnpm changeset
```

只构建可发布包：

```bash
pnpm --filter @futelab/folio build
```

## 推荐接入方式

大多数业务项目可以按这个方式接入：

1. 在应用入口导入 `@futelab/folio/styles.css`。
2. 把 `FolioDocument` JSON 作为唯一主存储格式。
3. 编辑页使用受控模式的 `FolioEditor`。
4. 对 `onChange` 做 debounce 后再自动保存。
5. 预览和发布页使用 `FolioReader`。
6. 只在导入、导出或对接外部系统时转换 HTML/Markdown。
