import type { FolioCommandContribution } from "@futelab/folio-core/browser";

export function normalizeSlashQuery(query: string): string {
  return query.replace(/^\//, "").trim().toLowerCase();
}

function getSearchTokens(value: string): string[] {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[\s_-]+/)
    .filter(Boolean);
}

function commandMatchesQuery(
  command: FolioCommandContribution,
  query: string,
): boolean {
  if (!query) return true;

  const searchableValues = [
    command.label,
    command.name,
    ...(command.keywords ?? []),
  ];

  return searchableValues.some((value) => {
    const normalizedValue = value.toLowerCase();

    return (
      normalizedValue.startsWith(query) ||
      getSearchTokens(value).some((token) => token.startsWith(query))
    );
  });
}

export function getSlashMenuCommands(
  commands: FolioCommandContribution[],
  query?: string,
): FolioCommandContribution[] {
  if (!query?.startsWith("/")) return [];

  const normalizedQuery = normalizeSlashQuery(query);

  return commands.filter((command) =>
    commandMatchesQuery(command, normalizedQuery),
  );
}
