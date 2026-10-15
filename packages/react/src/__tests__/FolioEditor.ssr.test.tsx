// @vitest-environment node
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { FolioEditor } from "../index";

describe("FolioEditor server rendering", () => {
  it("renders the client editor shell in a real Node environment without browser globals", () => {
    expect(typeof window).toBe("undefined");
    expect(typeof document).toBe("undefined");
    expect(typeof HTMLElement).toBe("undefined");
    expect(typeof Node).toBe("undefined");
    const onChange = vi.fn();
    const html = renderToString(
      <FolioEditor
        documentId="server-document"
        onChange={onChange}
        value={{
          type: "doc",
          content: [
            { type: "paragraph", content: [{ type: "text", text: "Loaded after hydration" }] },
          ],
        }}
      />,
    );
    expect(html).toContain('data-testid="folio-editor"');
    expect(html).toContain('class="folio-editor__content"');
    expect(onChange).not.toHaveBeenCalled();
  });

  it("supports SSR of menus and read-only editor shells without disabling SSR", () => {
    const writable = renderToString(<FolioEditor initialSlashQuery="/" locale="zh-CN" />);
    expect(writable).toContain("斜杠菜单");
    const readonly = renderToString(<FolioEditor editable={false} initialSlashQuery="/" />);
    expect(readonly).toContain('data-testid="folio-editor"');
    expect(readonly).not.toContain('role="menu"');
    expect(readonly).not.toContain('role="toolbar"');
  });
});
