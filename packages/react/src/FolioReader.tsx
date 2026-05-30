import type { FolioDocument } from "@futelab/folio-core";
import { renderFolioNode } from "./reader/renderers";

export interface FolioReaderProps {
  value: FolioDocument;
  className?: string;
  classNames?: {
    root?: string;
  };
}

function classNames(...values: Array<string | undefined>): string {
  return values.filter(Boolean).join(" ");
}

export function FolioReader(props: FolioReaderProps) {
  return (
    <article
      className={classNames("folio-reader", props.className, props.classNames?.root)}
      data-testid="folio-reader"
    >
      {renderFolioNode(props.value)}
    </article>
  );
}
