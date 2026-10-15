import { describe, expect, it } from "vitest";
import { createDefaultFolioCommands } from "../commands/defaultCommands";
import { createFolioMessages } from "../i18n";

function findCommand(name: string) {
  const command = createDefaultFolioCommands({ locale: "zh-CN" }).find(
    (item) => item.name === name,
  );

  if (!command) throw new Error(`Missing command: ${name}`);

  return command;
}

describe("Folio i18n", () => {
  it("localizes built-in command metadata by locale", () => {
    expect(findCommand("paragraph")).toMatchObject({
      label: "文本",
      group: "Basic",
      description: "从普通文本开始",
      keywords: ["段落", "文本", "普通"],
    });
    expect(findCommand("table")).toMatchObject({
      label: "表格",
      group: "Advanced",
      description: "插入简单表格",
    });
  });

  it("applies custom locale command translations with English fallback", () => {
    const commands = createDefaultFolioCommands({
      locale: "pirate",
      translations: {
        pirate: {
          commands: {
            paragraph: {
              label: "Log entry",
              description: "Write a ship log",
              keywords: ["log"],
            },
          },
        },
      },
    });

    expect(commands.find((command) => command.name === "paragraph")).toMatchObject({
      label: "Log entry",
      description: "Write a ship log",
      keywords: ["log"],
    });
    expect(commands.find((command) => command.name === "heading1")).toMatchObject({
      label: "Heading 1",
      description: "Large section heading",
    });
  });

  it("returns isolated message objects for each call", () => {
    const firstMessages = createFolioMessages("en");

    firstMessages.ui.slashMenu.label = "Mutated menu";
    firstMessages.commands.paragraph.keywords.push("mutated");

    const secondMessages = createFolioMessages("en");

    expect(secondMessages.ui.slashMenu.label).toBe("Slash commands");
    expect(secondMessages.commands.paragraph.keywords).toEqual(["paragraph", "plain"]);
  });
});
