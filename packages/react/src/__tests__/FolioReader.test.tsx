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
});
