import { createFolioMessages } from "@futelab/folio-core/browser";
import type {
  FolioI18nOptions,
  FolioMessages,
} from "@futelab/folio-core/browser";

export type {
  BuiltInFolioLocale,
  FolioDeepPartial,
  FolioI18nOptions,
  FolioLocale,
  FolioMessages,
  FolioTranslations,
} from "@futelab/folio-core/browser";

export {
  createFolioMessages,
  defaultFolioTranslations,
} from "@futelab/folio-core/browser";

const defaultMessages = createFolioMessages();

export interface FolioMessagesOptions extends FolioI18nOptions {
  messages?: FolioMessages;
}

export function resolveFolioMessages(
  options: FolioMessagesOptions = {},
): FolioMessages {
  if (options.messages) return options.messages;
  if (!options.locale && !options.translations) return defaultMessages;

  return createFolioMessages(options.locale, options.translations);
}
