export interface Repo {
  id: string;
  fullName: string;
}

export async function listRepos(fetchAll: () => Promise<Repo[]>): Promise<Repo[]> {
  const repos = await fetchAll();
  return repos.sort((a, b) => a.fullName.localeCompare(b.fullName));
}
