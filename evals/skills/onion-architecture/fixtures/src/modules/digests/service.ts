import { DigestsRepository } from './repository.js';

export class DigestsService {
  constructor(private readonly repo: DigestsRepository) {}

  async list(repoId: string) {
    return this.repo.listForRepo(repoId);
  }

  async create(input: { repoId: string; window: string }) {
    return this.repo.create(input);
  }
}
