export function readerCompany(
  workspaces: { owner: string }[],
  hint: string | null,
  saved: string | null,
) {
  if (hint) return workspaces.some((w) => w.owner === hint) ? hint : "";
  if (saved && workspaces.some((w) => w.owner === saved)) return saved;
  return workspaces.length === 1 ? workspaces[0].owner : "";
}
