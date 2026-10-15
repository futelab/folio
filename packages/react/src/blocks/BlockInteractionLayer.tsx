import type { CSSProperties } from "react";
import type { DragEvent } from "react";
import type { FolioMessages } from "../i18n";
import { BlockSideControls } from "./BlockSideControls";
import { getBlockAnchor } from "./blockDom";

export interface BlockInteractionLayerProps {
  activeBlock: HTMLElement | null;
  editorRoot: HTMLElement | null;
  className?: string;
  messages?: FolioMessages;
  sideControlsClassName?: string;
  onDragBlockEnd?: () => void;
  onDragBlockStart?: (event: DragEvent<HTMLButtonElement>) => void;
  onOpenBlockMenu: () => void;
}

function classNames(...values: Array<string | undefined>): string {
  return values.filter(Boolean).join(" ");
}

const SIDE_CONTROLS_HEIGHT = 24;

function getSideControlsStyle(
  activeBlock: HTMLElement | null,
  editorRoot: HTMLElement | null,
): CSSProperties | undefined {
  if (!activeBlock || !editorRoot) return undefined;

  const anchor = getBlockAnchor(activeBlock);
  const rootRect = editorRoot.getBoundingClientRect();

  return {
    top: anchor.rect.top - rootRect.top + (anchor.rect.height - SIDE_CONTROLS_HEIGHT) / 2,
  };
}

export function BlockInteractionLayer({
  activeBlock,
  editorRoot,
  className,
  messages,
  sideControlsClassName,
  onDragBlockEnd,
  onDragBlockStart,
  onOpenBlockMenu,
}: BlockInteractionLayerProps) {
  const style = getSideControlsStyle(activeBlock, editorRoot);

  return (
    <div className={classNames("folio-block-interaction-layer", className)}>
      <BlockSideControls
        className={sideControlsClassName}
        messages={messages}
        onAddBlock={onOpenBlockMenu}
        onDragBlockEnd={onDragBlockEnd}
        onDragBlockStart={onDragBlockStart}
        style={style}
        visible={Boolean(style)}
      />
    </div>
  );
}
