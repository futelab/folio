import type {
  FolioBlockContribution,
  FolioCommandContribution,
  FolioExtension,
  FolioMarkContribution,
  FolioRendererContribution,
} from "./types";

export interface FolioExtensionRegistry {
  extensions: FolioExtension[];
  blocks: FolioBlockContribution[];
  marks: FolioMarkContribution[];
  commands: FolioCommandContribution[];
  renderers: FolioRendererContribution[];
}

export function createFolioExtension(extension: FolioExtension): FolioExtension {
  return extension;
}

export function createFolioExtensionRegistry(
  extensions: FolioExtension[] = [],
): FolioExtensionRegistry {
  const names = new Set<string>();
  const blockNames = new Set<string>();
  const markNames = new Set<string>();
  const commandNames = new Set<string>();
  const rendererTypes = new Set<string>();
  const blocks: FolioBlockContribution[] = [];
  const marks: FolioMarkContribution[] = [];
  const commands: FolioCommandContribution[] = [];
  const renderers: FolioRendererContribution[] = [];

  for (const extension of extensions) {
    if (names.has(extension.name)) {
      throw new Error(`Duplicate Folio extension name: ${extension.name}`);
    }

    names.add(extension.name);

    for (const block of extension.blocks ?? []) {
      if (blockNames.has(block.name)) {
        throw new Error(`Duplicate Folio block contribution: ${block.name}`);
      }

      blockNames.add(block.name);
      blocks.push(block);
    }

    for (const mark of extension.marks ?? []) {
      if (markNames.has(mark.name)) {
        throw new Error(`Duplicate Folio mark contribution: ${mark.name}`);
      }

      markNames.add(mark.name);
      marks.push(mark);
    }

    for (const command of extension.commands ?? []) {
      if (commandNames.has(command.name)) {
        throw new Error(`Duplicate Folio command contribution: ${command.name}`);
      }

      commandNames.add(command.name);
      commands.push(command);
    }

    for (const renderer of extension.renderers ?? []) {
      const rendererKey = `${renderer.kind ?? "node"}:${renderer.type}`;
      if (rendererTypes.has(rendererKey)) {
        throw new Error(`Duplicate Folio renderer contribution: ${renderer.type}`);
      }

      rendererTypes.add(rendererKey);
      renderers.push(renderer);
    }
  }

  return {
    extensions: [...extensions],
    blocks,
    marks,
    commands,
    renderers,
  };
}
