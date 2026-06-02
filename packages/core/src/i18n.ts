import type { FolioCommandGroup } from "./extensions/types";

export type BuiltInFolioLocale = "en" | "zh-CN";
export type FolioLocale = BuiltInFolioLocale | (string & {});

export interface FolioCommandMessages {
  label: string;
  description: string;
  keywords: string[];
  defaultText?: string;
}

export interface FolioMessages {
  ui: {
    placeholder: string;
    slashMenu: {
      label: string;
      groups: Record<FolioCommandGroup, string>;
    };
    blockControls: {
      insertBlock: string;
      addBlockBelow: string;
      dragBlock: string;
    };
    bubbleToolbar: {
      label: string;
      linkUrlPrompt: string;
      bold: string;
      italic: string;
      underline: string;
      strike: string;
      code: string;
      link: string;
      highlight: string;
    };
    tableControls: {
      addColumnAriaLabel: string;
      addColumnTitle: string;
      addRowAriaLabel: string;
      addRowTitle: string;
    };
  };
  commands: {
    paragraph: FolioCommandMessages;
    heading1: FolioCommandMessages;
    heading2: FolioCommandMessages;
    heading3: FolioCommandMessages;
    bulletList: FolioCommandMessages;
    orderedList: FolioCommandMessages;
    taskList: FolioCommandMessages;
    quote: FolioCommandMessages;
    callout: FolioCommandMessages;
    divider: FolioCommandMessages;
    codeBlock: FolioCommandMessages;
    table: FolioCommandMessages;
    image: FolioCommandMessages;
    bookmark: FolioCommandMessages;
    toggle: FolioCommandMessages;
    toc: FolioCommandMessages;
  };
}

type Primitive = string | number | boolean | bigint | symbol | null | undefined;

export type FolioDeepPartial<T> = T extends Primitive
  ? T
  : T extends Array<infer Item>
    ? Item[]
    : {
        [Key in keyof T]?: FolioDeepPartial<T[Key]>;
      };

export type FolioTranslations = Record<string, FolioDeepPartial<FolioMessages>>;

export interface FolioI18nOptions {
  locale?: FolioLocale;
  translations?: FolioTranslations;
}

const enMessages: FolioMessages = {
  ui: {
    placeholder: "Start writing...",
    slashMenu: {
      label: "Slash commands",
      groups: {
        Basic: "Basic",
        Lists: "Lists",
        Media: "Media",
        Advanced: "Advanced",
      },
    },
    blockControls: {
      insertBlock: "Insert block",
      addBlockBelow: "Add block below",
      dragBlock: "Drag block",
    },
    bubbleToolbar: {
      label: "Text formatting",
      linkUrlPrompt: "Link URL",
      bold: "Bold",
      italic: "Italic",
      underline: "Underline",
      strike: "Strike",
      code: "Code",
      link: "Link",
      highlight: "Highlight",
    },
    tableControls: {
      addColumnAriaLabel: "Add table column",
      addColumnTitle: "Add column",
      addRowAriaLabel: "Add table row",
      addRowTitle: "Add row",
    },
  },
  commands: {
    paragraph: {
      label: "Text",
      description: "Start with plain text",
      keywords: ["paragraph", "plain"],
    },
    heading1: {
      label: "Heading 1",
      description: "Large section heading",
      keywords: ["h1", "title"],
    },
    heading2: {
      label: "Heading 2",
      description: "Medium section heading",
      keywords: ["h2", "subtitle"],
    },
    heading3: {
      label: "Heading 3",
      description: "Small section heading",
      keywords: ["h3"],
    },
    bulletList: {
      label: "Bulleted list",
      description: "Create a bulleted list",
      keywords: ["ul", "list"],
    },
    orderedList: {
      label: "Numbered list",
      description: "Create a numbered list",
      keywords: ["ol", "list"],
    },
    taskList: {
      label: "Todo list",
      description: "Track tasks with checkboxes",
      keywords: ["task", "check"],
    },
    quote: {
      label: "Quote",
      description: "Capture a quote or excerpt",
      keywords: ["blockquote"],
    },
    callout: {
      label: "Callout",
      description: "Highlight information in a callout",
      keywords: ["note", "aside"],
      defaultText: "Callout",
    },
    divider: {
      label: "Divider",
      description: "Add a horizontal divider",
      keywords: ["horizontal", "rule"],
    },
    codeBlock: {
      label: "Code block",
      description: "Write code with formatting",
      keywords: ["pre", "code"],
    },
    table: {
      label: "Table",
      description: "Insert a simple table",
      keywords: ["grid"],
    },
    image: {
      label: "Image",
      description: "Embed an image by URL",
      keywords: ["photo", "media"],
    },
    bookmark: {
      label: "Bookmark",
      description: "Save a rich link bookmark",
      keywords: ["link", "embed"],
    },
    toggle: {
      label: "Toggle",
      description: "Create a collapsible section",
      keywords: ["details", "collapse"],
    },
    toc: {
      label: "Table of contents",
      description: "Insert a table of contents",
      keywords: ["outline"],
    },
  },
};

const zhCNMessages: FolioMessages = {
  ui: {
    placeholder: "开始写作...",
    slashMenu: {
      label: "斜杠菜单",
      groups: {
        Basic: "基础",
        Lists: "列表",
        Media: "媒体",
        Advanced: "高级",
      },
    },
    blockControls: {
      insertBlock: "插入块",
      addBlockBelow: "在下方添加块",
      dragBlock: "拖拽块",
    },
    bubbleToolbar: {
      label: "文本格式",
      linkUrlPrompt: "链接 URL",
      bold: "加粗",
      italic: "斜体",
      underline: "下划线",
      strike: "删除线",
      code: "代码",
      link: "链接",
      highlight: "高亮",
    },
    tableControls: {
      addColumnAriaLabel: "添加表格列",
      addColumnTitle: "添加列",
      addRowAriaLabel: "添加表格行",
      addRowTitle: "添加行",
    },
  },
  commands: {
    paragraph: {
      label: "文本",
      description: "从普通文本开始",
      keywords: ["段落", "文本", "普通"],
    },
    heading1: {
      label: "一级标题",
      description: "大型章节标题",
      keywords: ["标题", "一级标题"],
    },
    heading2: {
      label: "二级标题",
      description: "中型章节标题",
      keywords: ["标题", "二级标题"],
    },
    heading3: {
      label: "三级标题",
      description: "小型章节标题",
      keywords: ["标题", "三级标题"],
    },
    bulletList: {
      label: "项目符号列表",
      description: "创建项目符号列表",
      keywords: ["无序列表", "项目符号"],
    },
    orderedList: {
      label: "编号列表",
      description: "创建编号列表",
      keywords: ["有序列表", "编号"],
    },
    taskList: {
      label: "待办列表",
      description: "用复选框跟踪任务",
      keywords: ["待办", "任务", "复选框"],
    },
    quote: {
      label: "引用",
      description: "记录引用或摘录",
      keywords: ["引用", "摘录"],
    },
    callout: {
      label: "提示框",
      description: "突出重要信息",
      keywords: ["提示", "强调"],
      defaultText: "提示",
    },
    divider: {
      label: "分割线",
      description: "添加水平分割线",
      keywords: ["分隔", "水平线"],
    },
    codeBlock: {
      label: "代码块",
      description: "编写带格式的代码",
      keywords: ["代码", "开发"],
    },
    table: {
      label: "表格",
      description: "插入简单表格",
      keywords: ["网格", "表格"],
    },
    image: {
      label: "图片",
      description: "通过 URL 嵌入图片",
      keywords: ["照片", "媒体", "图片"],
    },
    bookmark: {
      label: "书签",
      description: "保存富链接书签",
      keywords: ["链接", "嵌入", "书签"],
    },
    toggle: {
      label: "折叠块",
      description: "创建可折叠章节",
      keywords: ["折叠", "展开"],
    },
    toc: {
      label: "目录",
      description: "插入目录",
      keywords: ["大纲", "目录"],
    },
  },
};

export const defaultFolioTranslations: Record<
  BuiltInFolioLocale,
  FolioMessages
> = {
  en: enMessages,
  "zh-CN": zhCNMessages,
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function cloneValue<T>(value: T): T {
  if (Array.isArray(value)) return [...value] as T;

  if (isPlainObject(value)) {
    const result: Record<string, unknown> = {};

    for (const [key, item] of Object.entries(value)) {
      result[key] = cloneValue(item);
    }

    return result as T;
  }

  return value;
}

function mergeMessages<T>(base: T, override?: FolioDeepPartial<T>): T {
  if (override === undefined) return cloneValue(base);
  if (Array.isArray(base)) return cloneValue(override as T);
  if (!isPlainObject(base) || !isPlainObject(override)) {
    return cloneValue(override as T);
  }

  const result = cloneValue(base) as Record<string, unknown>;

  for (const [key, value] of Object.entries(override)) {
    if (value === undefined) continue;

    result[key] = mergeMessages(
      (base as Record<string, unknown>)[key],
      value as FolioDeepPartial<unknown>,
    );
  }

  return result as T;
}

export function createFolioMessages(
  locale: FolioLocale = "en",
  translations?: FolioTranslations,
): FolioMessages {
  const builtIn = defaultFolioTranslations[locale as BuiltInFolioLocale];
  const custom = translations?.[locale];

  return mergeMessages<FolioMessages>(
    mergeMessages<FolioMessages>(defaultFolioTranslations.en, builtIn),
    custom,
  );
}
