export interface FolioEditorLabels {
  actions: string;
  addBlock: string;
  image: string;
  bookmark: string;
  link: string;
  mention: string;
  editMedia: string;
  moveUp: string;
  moveDown: string;
  undo: string;
  redo: string;
  url: string;
  alt: string;
  caption: string;
  title: string;
  description: string;
  upload: string;
  uploading: string;
  retry: string;
  save: string;
  cancel: string;
  removeLink: string;
  invalidUrl: string;
  actionFailed: string;
  noMentions: string;
  searchMentions: string;
  tableActions: string;
  deleteRow: string;
  deleteColumn: string;
  headerRow: string;
  headerColumn: string;
  mergeCells: string;
  splitCell: string;
  deleteTable: string;
}

const en: FolioEditorLabels = {
  actions: "Document actions",
  addBlock: "Add block below",
  image: "Image",
  bookmark: "Bookmark",
  link: "Link",
  mention: "Mention",
  editMedia: "Edit selected media",
  moveUp: "Move block up",
  moveDown: "Move block down",
  undo: "Undo",
  redo: "Redo",
  url: "URL",
  alt: "Alternative text",
  caption: "Caption",
  title: "Title",
  description: "Description",
  upload: "Upload image",
  uploading: "Uploading image…",
  retry: "Retry upload",
  save: "Save",
  cancel: "Cancel",
  removeLink: "Remove link",
  invalidUrl:
    "Enter a safe URL. Links support HTTP, HTTPS, mailto, tel, and relative paths; images support HTTP, HTTPS, and relative paths.",
  actionFailed: "This action could not be completed.",
  noMentions: "No matching mentions",
  searchMentions: "Search mentions",
  tableActions: "Table actions",
  deleteRow: "Delete row",
  deleteColumn: "Delete column",
  headerRow: "Toggle header row",
  headerColumn: "Toggle header column",
  mergeCells: "Merge selected cells",
  splitCell: "Split cell",
  deleteTable: "Delete table",
};
const zh: FolioEditorLabels = {
  actions: "文档操作",
  addBlock: "在下方添加块",
  image: "图片",
  bookmark: "书签",
  link: "链接",
  mention: "提及",
  editMedia: "编辑选中的媒体",
  moveUp: "上移块",
  moveDown: "下移块",
  undo: "撤销",
  redo: "重做",
  url: "地址",
  alt: "替代文本",
  caption: "图片说明",
  title: "标题",
  description: "描述",
  upload: "上传图片",
  uploading: "正在上传图片…",
  retry: "重试上传",
  save: "保存",
  cancel: "取消",
  removeLink: "移除链接",
  invalidUrl:
    "请输入安全地址。链接支持 HTTP、HTTPS、mailto、tel 和相对路径；图片支持 HTTP、HTTPS 和相对路径。",
  actionFailed: "未能完成此操作。",
  noMentions: "没有匹配的提及对象",
  searchMentions: "搜索提及对象",
  tableActions: "表格操作",
  deleteRow: "删除行",
  deleteColumn: "删除列",
  headerRow: "切换表头行",
  headerColumn: "切换表头列",
  mergeCells: "合并选中单元格",
  splitCell: "拆分单元格",
  deleteTable: "删除表格",
};

export function resolveEditorLabels(
  locale?: string,
  overrides?: Partial<FolioEditorLabels>,
): FolioEditorLabels {
  return { ...(locale?.toLowerCase().startsWith("zh") ? zh : en), ...overrides };
}
