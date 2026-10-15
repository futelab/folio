import { describe, expect, it } from "vitest";
import { createDefaultFolioCommands } from "../commands/defaultCommands";
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

    expect(registry.blocks.map((block) => block.name)).toEqual(["callout", "quote", "image"]);
    expect(registry.marks.map((mark) => mark.name)).toEqual(["highlight", "comment", "link"]);
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

    expect(registry.extensions.map((extension) => extension.name)).toEqual(["callout"]);
  });
});

describe("default Folio commands", () => {
  const defaultCommands = () => createDefaultFolioCommands();

  const commandNamed = (name: string) => {
    const command = defaultCommands().find((candidate) => candidate.name === name);
    if (!command) throw new Error(`Missing command: ${name}`);
    return command;
  };

  it("exposes slash command labels in a stable order", () => {
    expect(defaultCommands().map((command) => command.name)).toEqual([
      "paragraph",
      "heading1",
      "heading2",
      "heading3",
      "bulletList",
      "orderedList",
      "todoList",
      "quote",
      "callout",
      "divider",
      "codeBlock",
      "table",
      "image",
      "bookmark",
      "mention",
      "toggle",
      "toc",
    ]);
  });

  it("returns false for null and malformed editor chains", () => {
    const paragraph = commandNamed("paragraph");

    expect(paragraph.action({ editor: null })).toBe(false);
    expect(paragraph.action({ editor: {} })).toBe(false);
    expect(paragraph.action({ editor: { chain: "not a function" } })).toBe(false);
    expect(paragraph.action({ editor: { chain: () => ({}) } })).toBe(false);
    expect(
      paragraph.action({
        editor: { chain: () => ({ focus: () => ({ setParagraph: () => ({}) }) }) },
      }),
    ).toBe(false);
  });

  it("returns false when the editor chain run returns false", () => {
    const chain = {
      focus: () => chain,
      setParagraph: () => chain,
      run: () => false,
    };
    const editor = { chain: () => chain };

    expect(commandNamed("paragraph").action({ editor })).toBe(false);
  });

  it("calls the expected chain method for paragraph commands", () => {
    let setParagraphCalls = 0;
    const chain = {
      focus: () => chain,
      setParagraph: () => {
        setParagraphCalls += 1;
        return chain;
      },
      run: () => true,
    };
    const editor = { chain: () => chain };

    expect(commandNamed("paragraph").action({ editor })).toBe(true);
    expect(setParagraphCalls).toBe(1);
  });

  it("coerces bookmark attrs to strings and falls back title to url", () => {
    let insertedContent: unknown;
    const chain = {
      focus: () => chain,
      insertContent: (content: unknown) => {
        insertedContent = content;
        return chain;
      },
      run: () => true,
    };
    const editor = { chain: () => chain };

    expect(
      commandNamed("bookmark").action({
        editor,
        attrs: { url: 123, description: false },
      }),
    ).toBe(true);

    expect(insertedContent).toEqual({
      type: "bookmark",
      attrs: {
        url: "123",
        title: "123",
        description: "false",
      },
    });
  });
});
