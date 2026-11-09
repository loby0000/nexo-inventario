type Workspace = { owner: string };
export function preferredCompany(user: string, companies: Workspace[], current = ""): string {
  if (!user) return "";
  if (companies.some(c => c.owner === current)) return current;
  try {
    const saved = localStorage.getItem(`nexo-company:${user}`);
    if (companies.some(c => c.owner === saved)) return saved!;
  } catch { /* Preferences never prevent online access. */ }
  return companies.length === 1 ? companies[0].owner : "";
}
export function rememberCompany(user: string, company: string, companies: Workspace[]) {
  if (!user || !companies.some(c => c.owner === company)) return;
  try { localStorage.setItem(`nexo-company:${user}`, company); } catch { /* Optional preference. */ }
}
