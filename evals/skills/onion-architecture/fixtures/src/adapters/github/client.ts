export class GithubClient {
  constructor(private readonly token: string) {}

  async listCollaborators(repo: string): Promise<{ login: string; email: string }[]> {
    const res = await fetch(`https://api.github.com/repos/${repo}/collaborators`, {
      headers: { authorization: `Bearer ${this.token}` },
    });
    return (await res.json()) as { login: string; email: string }[];
  }
}
