import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import {
  createEmptyFolioDocument,
  type FolioDocument,
} from "@futelab/folio/core";
import { FolioEditor } from "@futelab/folio/react";

const meta = {
  title: "Folio/Editor",
  component: FolioEditor,
} satisfies Meta<typeof FolioEditor>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Controlled: Story = {
  render: () => {
    const [value, setValue] = useState<FolioDocument>(createEmptyFolioDocument());

    return (
      <FolioEditor
        value={value}
        onChange={setValue}
        placeholder="Type / for commands"
      />
    );
  },
};

export const WithSlashMenu: Story = {
  render: () => {
    const [value, setValue] = useState<FolioDocument>(createEmptyFolioDocument());

    return (
      <FolioEditor
        value={value}
        onChange={setValue}
        initialSlashQuery="/"
        placeholder="Type / for commands"
      />
    );
  },
};
