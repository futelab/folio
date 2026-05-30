import { describe, expect, it } from "vitest";
import { createFolioExtension, createFolioExtensionRegistry } from "../index";

describe("Folio extension registry", () => {
  it("registers extension contributions in insertion order", () => {
    const callout = createFolioExtension({
      name: "callout",
      blocks: [{ name: "callout" }, { name: "quote" }],
      marks: [{ name: "highlight" }],
      commands: [
        { name: "insertCallout", label: "Callout", action: () => true },
        { name: "insertQuote", label: "Quote", action: () => true },
      ],
      renderers: [
        { type: "callout", render: () => "callout" },
        { type: "quote", render: () => "quote" },
      ],
    });

    const embeds = createFolioExtension({
      name: "embeds",
      blocks: [{ name: "image" }],
      marks: [{ name: "comment" }, { name: "link" }],
      commands: [{ name: "insertImage", label: "Image", action: () => true }],
      renderers: [{ type: "image", render: () => "image" }],
    });

    const registry = createFolioExtensionRegistry([callout, embeds]);

    expect(registry.blocks.map((block) => block.name)).toEqual([
      "callout",
      "quote",
      "image",
    ]);
    expect(registry.marks.map((mark) => mark.name)).toEqual([
      "highlight",
      "comment",
      "link",
    ]);
    expect(registry.commands.map((command) => command.name)).toEqual([
      "insertCallout",
      "insertQuote",
      "insertImage",
    ]);
    expect(registry.renderers.map((renderer) => renderer.type)).toEqual([
      "callout",
      "quote",
      "image",
    ]);
  });

  it("rejects duplicate extension names", () => {
    const first = createFolioExtension({ name: "same" });
    const second = createFolioExtension({ name: "same" });

    expect(() => createFolioExtensionRegistry([first, second])).toThrow(
      "Duplicate Folio extension name: same",
    );
  });

  it("rejects duplicate block contribution names", () => {
    const first = createFolioExtension({
      name: "first",
      blocks: [{ name: "callout" }],
    });
    const second = createFolioExtension({
      name: "second",
      blocks: [{ name: "callout" }],
    });

    expect(() => createFolioExtensionRegistry([first, second])).toThrow(
      "Duplicate Folio block contribution: callout",
    );
  });

  it("rejects duplicate mark contribution names", () => {
    const first = createFolioExtension({
      name: "first",
      marks: [{ name: "highlight" }],
    });
    const second = createFolioExtension({
      name: "second",
      marks: [{ name: "highlight" }],
    });

    expect(() => createFolioExtensionRegistry([first, second])).toThrow(
      "Duplicate Folio mark contribution: highlight",
    );
  });

  it("rejects duplicate command contribution names", () => {
    const first = createFolioExtension({
      name: "first",
      commands: [{ name: "insertCallout", label: "Callout", action: () => true }],
    });
    const second = createFolioExtension({
      name: "second",
      commands: [{ name: "insertCallout", label: "Callout", action: () => true }],
    });

    expect(() => createFolioExtensionRegistry([first, second])).toThrow(
      "Duplicate Folio command contribution: insertCallout",
    );
  });

  it("rejects duplicate renderer contribution types", () => {
    const first = createFolioExtension({
      name: "first",
      renderers: [{ type: "callout", render: () => "callout" }],
    });
    const second = createFolioExtension({
      name: "second",
      renderers: [{ type: "callout", render: () => "callout" }],
    });

    expect(() => createFolioExtensionRegistry([first, second])).toThrow(
      "Duplicate Folio renderer contribution: callout",
    );
  });

  it("keeps a snapshot of the input extensions array", () => {
    const callout = createFolioExtension({ name: "callout" });
    const embeds = createFolioExtension({ name: "embeds" });
    const extensions = [callout];

    const registry = createFolioExtensionRegistry(extensions);
    extensions.push(embeds);

    expect(registry.extensions.map((extension) => extension.name)).toEqual([
      "callout",
    ]);
  });
});
