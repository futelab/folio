import type { Extensions } from "@tiptap/core";
import { createDefaultTiptapExtensions } from "../extensions/defaultExtensions";

export function createTestTiptapExtensions(): Extensions {
  return createDefaultTiptapExtensions({ includeMarkdown: true });
}
