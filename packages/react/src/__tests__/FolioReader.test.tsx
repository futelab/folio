import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { sampleFolioDocument } from "@futelab/folio-core";
import type { FolioDocument } from "@futelab/folio-core";
import { describe, expect, it } from "vitest";
import { FolioReader } from "../FolioReader";

describe("FolioReader", () => {
  it("renders Folio JSON without editor controls", () => {
    render(<FolioReader value={sampleFolioDocument} />);

    expect(screen.getByTestId("folio-reader")).toHaveClass("folio-reader");
    expect(screen.getByText("Folio document")).toBeInTheDocument();
    expect(screen.queryByTestId("folio-editor")).not.toBeInTheDocument();
  });

  it("omits unsafe URLs from links and bookmarks", () => {
    const unsafeDocument: FolioDocument = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Unsafe link",
              marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }],
            },
          ],
        },
        {
          type: "bookmark",
          attrs: {
            title: "Unsafe bookmark",
            url: "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
          },
        },
      ],
    };

    render(<FolioReader value={unsafeDocument} />);

    expect(screen.getByText("Unsafe link")).not.toHaveAttribute("href");
    expect(screen.getByText("Unsafe bookmark")).not.toHaveAttribute("href");
  });

  it("omits unsafe image sources while allowing safe image URLs", () => {
    const imageDocument: FolioDocument = {
      type: "doc",
      content: [
        {
          type: "image",
          attrs: {
            alt: "Unsafe image",
            src: "javascript:alert(1)",
          },
        },
        {
          type: "image",
          attrs: {
            alt: "Safe image",
            src: "/images/photo.png",
          },
        },
      ],
    };

    render(<FolioReader value={imageDocument} />);

    expect(screen.getByAltText("Unsafe image")).not.toHaveAttribute("src");
    expect(screen.getByAltText("Safe image")).toHaveAttribute("src", "/images/photo.png");
  });

  it("renders default editor nodes and marks without dropping content", () => {
    const richDocument: FolioDocument = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Struck", marks: [{ type: "strike" }] },
            { type: "hardBreak" },
            {
              type: "text",
              text: "Highlighted",
              marks: [{ type: "highlight", attrs: { color: "#fff3bf" } }],
            },
            {
              type: "text",
              text: "Underlined",
              marks: [{ type: "underline" }],
            },
          ],
        },
        {
          type: "taskList",
          content: [
            {
              type: "taskItem",
              attrs: { checked: true },
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Done task" }],
                },
              ],
            },
          ],
        },
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                {
                  type: "tableHeader",
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "Column" }],
                    },
                  ],
                },
                {
                  type: "tableCell",
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "Value" }],
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          type: "details",
          attrs: { open: true },
          content: [
            {
              type: "detailsSummary",
              content: [{ type: "text", text: "Toggle title" }],
            },
            {
              type: "detailsContent",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Toggle body" }],
                },
              ],
            },
          ],
        },
      ],
    };

    const { container } = render(<FolioReader value={richDocument} />);

    expect(screen.getByText("Struck").tagName.toLowerCase()).toBe("del");
    expect(container.querySelector("br")).toBeInTheDocument();
    expect(screen.getByText("Highlighted").tagName.toLowerCase()).toBe("mark");
    expect(screen.getByText("Underlined").tagName.toLowerCase()).toBe("u");
    expect(screen.getByRole("checkbox", { name: "Done task" })).toBeChecked();
    expect(screen.getByRole("columnheader", { name: "Column" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Value" })).toBeInTheDocument();
    expect(screen.getByText("Toggle title").closest("summary")).toBeInTheDocument();
    expect(screen.getByText("Toggle body")).toBeInTheDocument();
  });

  it("renders details closed when open state was not persisted", () => {
    const document: FolioDocument = {
      type: "doc",
      content: [
        {
          type: "details",
          content: [
            {
              type: "detailsSummary",
              content: [{ type: "text", text: "Collapsed title" }],
            },
            {
              type: "detailsContent",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Collapsed body" }],
                },
              ],
            },
          ],
        },
      ],
    };

    render(<FolioReader value={document} />);

    expect(screen.getByText("Collapsed title").closest("details")).not.toHaveAttribute("open");
  });
});
