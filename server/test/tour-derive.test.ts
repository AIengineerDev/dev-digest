/**
 * `derive/{tree,diagram,chains,config}.ts` — hermetic, pure. Covers C2 (one
 * directory, three files), C3 (zero JS/TS files), C4 (empty `file_edges`
 * strictly nulls the diagram), C6 (no config files at all — a THROWING
 * `readFile`, not the base mock, per `server/INSIGHTS.md`'s
 * `MockGitClient.readFile` warning) and C10 (a directory name containing a
 * newline still renders a quoted, single-line mermaid label).
 */
import { describe, it, expect } from 'vitest';
import { buildTree } from '../src/modules/tour/derive/tree.js';
import { buildDiagram } from '../src/modules/tour/derive/diagram.js';
import { buildChains } from '../src/modules/tour/derive/chains.js';
import { deriveConfig, type ReadFile } from '../src/modules/tour/derive/config.js';

describe('buildTree', () => {
  it('C2 — one directory, three files: one entry, correct file count and role mix', () => {
    const tree = buildTree([
      { path: 'src/a.ts', percentile: 90 },
      { path: 'src/b.ts', percentile: 50 },
      { path: 'src/b.test.ts', percentile: 10 },
    ]);
    expect(tree).toHaveLength(1);
    expect(tree[0]!.path).toBe('src');
    expect(tree[0]!.files).toBe(3);
    expect(tree[0]!.top_file).toBe('src/a.ts');
    expect(tree[0]!.note).toBeNull();
  });

  it('C3 — zero JS/TS files: the walk alone still produces a tree from whatever paths exist', () => {
    const tree = buildTree([
      { path: 'README.md', percentile: null },
      { path: 'docs/guide.md', percentile: null },
    ]);
    expect(tree.length).toBeGreaterThan(0);
    expect(tree.every((e) => e.top_file === null || typeof e.top_file === 'string')).toBe(true);
  });

  it('folds a depth-4+ directory into its depth-3 ancestor and records the folded name', () => {
    const tree = buildTree([
      { path: 'src/modules/tour/derive/tree.ts', percentile: 80 },
      { path: 'src/modules/tour/service.ts', percentile: 60 },
    ]);
    const ancestor = tree.find((e) => e.path === 'src/modules/tour');
    expect(ancestor).toBeDefined();
    expect(ancestor!.files).toBe(2);
    expect(ancestor!.folded).toContain('derive');
    expect(ancestor!.note).toBeNull(); // R24 — derive layer never writes prose
  });

  it('caps at MAX_TREE_DIRS, keeping the biggest directories', () => {
    const files = Array.from({ length: 250 }, (_, i) => ({ path: `dir${i}/file.ts`, percentile: null }));
    const tree = buildTree(files);
    expect(tree.length).toBe(200);
  });
});

describe('buildDiagram', () => {
  it('C4 — empty file_edges with files present → null, strictly (never a placeholder)', () => {
    expect(buildDiagram([])).toBeNull();
  });

  it('one directory (self-referential edges only) → a one-node diagram, no edges', () => {
    const diagram = buildDiagram([{ fromFile: 'src/a.ts', toFile: 'src/b.ts' }]);
    expect(diagram).not.toBeNull();
    expect(diagram!.split('\n')).toHaveLength(2); // header + one node, no edge line
    expect(diagram).toContain('flowchart LR');
  });

  it('two directories with an edge render one edge line, with resolved node ids on both sides', () => {
    const diagram = buildDiagram([{ fromFile: 'src/api/a.ts', toFile: 'lib/util/b.ts' }]);
    expect(diagram).toContain('-->');
    expect(diagram).not.toContain('undefined');
    expect(diagram).toContain('["lib/util"]');
    expect(diagram).toContain('["src/api"]');
  });

  it('C10 — a directory name with a newline produces a quoted, single-line label', () => {
    const diagram = buildDiagram([{ fromFile: 'weird\ndir/a.ts', toFile: 'lib/b.ts' }]);
    expect(diagram).not.toBeNull();
    for (const line of diagram!.split('\n')) {
      expect(line.includes('\n')).toBe(false);
    }
    expect(diagram).toContain('["weird dir"]');
  });
});

describe('buildChains', () => {
  it('C5 — empty paths in → empty_reason, never an empty card', () => {
    const result = buildChains([], []);
    expect(result.chains).toEqual([]);
    expect(result.emptyReason).toBeTruthy();
  });

  it('annotates endpoints from file_facts, joined by chain file', () => {
    const result = buildChains(
      [['src/api/route.ts', 'src/service.ts']],
      [{ filePath: 'src/api/route.ts', endpoints: ['GET /x'], crons: [] }],
    );
    expect(result.chains).toHaveLength(1);
    expect(result.chains[0]!.endpoints).toEqual(['GET /x']);
    expect(result.chains[0]!.why).toBeNull();
    expect(result.emptyReason).toBeNull();
  });

  it('assigns stable, unique chain ids across multiple chains', () => {
    const result = buildChains([['a.ts', 'b.ts'], ['c.ts', 'd.ts']], []);
    const ids = result.chains.map((c) => c.chain_id);
    expect(new Set(ids).size).toBe(2);
  });
});

describe('deriveConfig', () => {
  const throwingReadFile: ReadFile = async () => {
    throw new Error('ENOENT: no such file');
  };

  it('C6 — no package.json/compose/Dockerfile at all → an EMPTY whitelist, using a THROWING readFile', async () => {
    const config = await deriveConfig(throwingReadFile);
    expect(config.whitelist).toEqual([]);
    expect(config.skeletonSteps).toEqual([]);
    expect(config.packageManager).toBe('npm'); // the deterministic fallback
    expect(config.dockerfilePresent).toBe(false);
  });

  it('reads scripts and packageManager from package.json, and only variable NAMES from .env.example (A16)', async () => {
    const files: Record<string, string> = {
      'package.json': JSON.stringify({
        packageManager: 'pnpm@9.0.0',
        scripts: { dev: 'tsx watch', build: 'tsc' },
      }),
      '.env.example': 'DATABASE_URL=postgres://sentinel-value\nAPI_KEY=sk_should_not_be_seen\n',
    };
    const readFile: ReadFile = async (path) => {
      if (path in files) return files[path]!;
      throw new Error('ENOENT');
    };
    const config = await deriveConfig(readFile);
    expect(config.packageManager).toBe('pnpm');
    expect(config.scripts).toEqual(['dev', 'build']);
    expect(config.envExampleVars).toEqual(['DATABASE_URL', 'API_KEY']);
    expect(JSON.stringify(config)).not.toContain('sentinel-value');
    expect(JSON.stringify(config)).not.toContain('sk_should_not_be_seen');
    expect(config.whitelist).toContain('pnpm install');
    expect(config.whitelist).toContain('pnpm dev');
    expect(config.whitelist).toContain('cp .env.example .env');
    expect(config.skeletonSteps).toEqual(['pnpm install', 'cp .env.example .env', 'pnpm dev']);
  });

  it('parses top-level compose service names without a YAML dependency', async () => {
    const compose = ['services:', '  db:', '    image: postgres', '  redis:', '    image: redis', ''].join('\n');
    const readFile: ReadFile = async (path) => {
      if (path === 'docker-compose.yml') return compose;
      throw new Error('ENOENT');
    };
    const config = await deriveConfig(readFile);
    expect(config.composeServices).toEqual(['db', 'redis']);
    expect(config.whitelist).toContain('docker compose up -d db redis');
  });
});
