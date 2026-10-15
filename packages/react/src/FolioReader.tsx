import { useId } from "react";
import type { ReactNode } from "react";
import type { FolioDocumentLimits, FolioExtension } from "@futelab/folio-core/browser";
import { renderFolioNode } from "./reader/renderers";
import type { FolioReaderIssue } from "./reader/renderers";

export interface FolioReaderProps {
  /** Untrusted JSON is validated before it is rendered. */
  value: unknown;
  extensions?: FolioExtension[];
  /** Override the automatically generated heading prefix for independently mounted roots. */
  headingIdPrefix?: string;
  limits?: Partial<FolioDocumentLimits>;
  /** Limits generated elements, including repeated table-of-contents entries. Default: 50,000. */
  maxRenderedNodes?: number;
  /** Pure diagnostic callback. React may call this more than once while rendering. */
  onError?: (issue: FolioReaderIssue) => void;
  renderError?: (issue: FolioReaderIssue) => ReactNode;
  className?: string;
  classNames?: {
    root?: string;
  };
}

function classNames(...values: Array<string | undefined>): string {
  return values.filter(Boolean).join(" ");
}

export function FolioReader(props: FolioReaderProps) {
  const id = useId();

  return (
    <article
      className={classNames("folio-reader", props.className, props.classNames?.root)}
      data-testid="folio-reader"
    >
      {renderFolioNode(props.value, {
        extensions: props.extensions,
        headingIdPrefix: props.headingIdPrefix ?? `folio-${id}`,
        limits: props.limits,
        maxRenderedNodes: props.maxRenderedNodes,
        onError: props.onError,
        renderError: props.renderError,
      })}
    </article>
  );
}
