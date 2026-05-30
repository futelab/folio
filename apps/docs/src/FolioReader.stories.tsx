import type { Meta, StoryObj } from "@storybook/react";
import { sampleFolioDocument } from "@futelab/folio/core";
import { FolioReader } from "@futelab/folio/react";

const meta = {
  title: "Folio/Reader",
  component: FolioReader,
} satisfies Meta<typeof FolioReader>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  args: {
    value: sampleFolioDocument,
  },
};
