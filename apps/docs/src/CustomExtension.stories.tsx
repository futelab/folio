import type { Meta, StoryObj } from "@storybook/react";
import {
  createFolioExtension,
  createFolioExtensionRegistry,
} from "@futelab/folio/core";

function ExtensionExample() {
  const extension = createFolioExtension({
    name: "example",
    commands: [{ name: "example", label: "Example", action: () => true }],
  });
  const registry = createFolioExtensionRegistry([extension]);

  return (
    <ul>
      {registry.commands.map((command) => (
        <li key={command.name}>{command.label}</li>
      ))}
    </ul>
  );
}

const meta = {
  title: "Folio/Custom Extension",
  component: ExtensionExample,
} satisfies Meta<typeof ExtensionExample>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Basic: Story = {};
