#!/usr/bin/env node
//
// Generates the catalog index by reading this repository.
//
//   node scripts/build-catalog.mjs            # print the index to stdout
//   node scripts/build-catalog.mjs --out f    # write it to a file
//   node scripts/build-catalog.mjs --report   # human-readable summary + diagnostics
//
// Nothing in the output is authored here. Every name, description, version,
// model, tool list and eval suite is read from a file, and every entry carries
// the repo-relative path it was read from so a reader can check it. This is
// specs/16 R1/R3: the site has no data of its own.
//
// It is deterministic — sorted keys, sorted arrays, no timestamps, no absolute
// paths — so two runs on the same tree produce byte-identical output and a
// staleness gate over it is meaningful.
//
// It fails loudly rather than emitting a smaller index (R16): each class
// declares the glob it walks and a minimum count, and a source directory that
// moved or emptied is an error, not a quiet zero.
//
// Node standard library only.

import { readFile, readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rel = (p) => relative(ROOT, p).split("\\").join("/");

/* Minimum expected count per class. A glob that matches fewer than this means a
   directory moved and the index would silently shrink — see R16. Raise these
   when a class genuinely grows; never lower one to make a red build green. */
/* The roots this generator reads. Exported because two other things must agree
   with it: the Pages deploy trigger (a source that changes but does not fire the
   workflow leaves a stale site) and anyone adding a new artefact class. Keep it
   in sync with the readers below — `scripts/check-pages-trigger.mjs` fails the
   build if the workflow stops covering one. */
export const SOURCES = [
  ".claude/skills",
  ".claude/agents",
  ".claude/hooks",
  ".claude/settings.json",
  ".claude-plugin",
  "plugins",
  "mcp/src/tools",
  "mcp/src/server.ts",
  "skills",
  "evals",
]

const MINIMUMS = { skill: 5, agent: 6, hook: 1, "mcp-tool": 5, "product-skill": 1 };

/* Module-level, and therefore reset at the start of every buildCatalog() call:
   the dev server assembles the site once per request, and accumulating findings
   across calls would report the same diagnostic a dozen times by lunchtime. */
let errors = [];
let diagnostics = [];

/* ── frontmatter ─────────────────────────────────────────────────────────── */
function frontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return null;
  const out = {};
  let key = null;
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/);
    if (kv) { key = kv[1]; out[key] = kv[2].trim(); }
    else if (key && line.trim()) out[key] += " " + line.trim();
  }
  return { fields: out, body: text.slice(m[0].length).trim() };
}

const firstParagraph = (body) => {
  const p = body.replace(/^#+ .*$/gm, "").trim().split(/\n\s*\n/).find((x) => x.trim());
  return p ? p.replace(/\s+/g, " ").trim() : null;
};

/* ── eval coverage ───────────────────────────────────────────────────────── */
/* Suites live in four places. Report the ones that exist, by path. No case
   count is reported for a suite whose cases are TypeScript literals, because
   counting them would mean parsing, and a number that might be wrong is worse
   than no number. */
async function coverage(name) {
  const candidates = [
    `.claude/skills/${name}/evals`,
    `evals/skills/${name}`,
    `evals/agents/${name}`,
    `skills/${name}/evals`,
  ];
  const suites = [];
  for (const c of candidates) {
    const abs = join(ROOT, c);
    if (!existsSync(abs)) continue;
    let cases = null;
    const casesDir = join(abs, "cases");
    if (existsSync(casesDir)) {
      const entries = await readdir(casesDir, { withFileTypes: true });
      cases = entries.filter((e) => e.isDirectory()).length;
    }
    suites.push(cases === null ? { path: c } : { cases, path: c });
  }
  return suites;
}

/* ── classes ─────────────────────────────────────────────────────────────── */
async function skills() {
  const dir = join(ROOT, ".claude/skills");
  const out = [];
  for (const name of (await readdir(dir)).sort()) {
    const file = join(dir, name, "SKILL.md");
    if (!existsSync(file)) {
      diagnostics.push({
        severity: "warning",
        path: rel(join(dir, name)),
        message: "directory under .claude/skills has no SKILL.md — Claude Code will never load it, so it is not a skill and is left out of the catalog",
      });
      continue;
    }
    const fm = frontmatter(await readFile(file, "utf8"));
    if (!fm?.fields.name || !fm.fields.description) {
      errors.push(`${rel(file)}: frontmatter must declare name and description`);
      continue;
    }
    out.push({
      id: fm.fields.name,
      type: "skill",
      description: fm.fields.description,
      descriptionSource: "frontmatter",
      version: fm.fields.version ?? null,
      summary: firstParagraph(fm.body),
      path: rel(file),
      evals: await coverage(name),
    });
  }
  return out;
}

async function agents() {
  const dir = join(ROOT, ".claude/agents");
  const out = [];
  for (const file of (await readdir(dir)).sort()) {
    if (!file.endsWith(".md") || file === "README.md") continue;
    const fm = frontmatter(await readFile(join(dir, file), "utf8"));
    if (!fm?.fields.name || !fm.fields.description) {
      errors.push(`${rel(join(dir, file))}: frontmatter must declare name and description`);
      continue;
    }
    out.push({
      id: fm.fields.name,
      type: "agent",
      description: fm.fields.description,
      descriptionSource: "frontmatter",
      model: fm.fields.model ?? null,
      tools: fm.fields.tools ? fm.fields.tools.split(",").map((t) => t.trim()).filter(Boolean) : null,
      summary: firstParagraph(fm.body),
      path: rel(join(dir, file)),
      evals: await coverage(fm.fields.name),
    });
  }
  return out;
}

async function hooks() {
  const dir = join(ROOT, ".claude/hooks");
  if (!existsSync(dir)) return [];
  let wiring = {};
  const settings = join(ROOT, ".claude/settings.json");
  if (existsSync(settings)) {
    try {
      const parsed = JSON.parse(await readFile(settings, "utf8"));
      for (const [event, entries] of Object.entries(parsed.hooks ?? {}))
        for (const entry of entries)
          for (const h of entry.hooks ?? [])
            for (const m of String(h.command ?? "").matchAll(/hooks\/([A-Za-z0-9._-]+)/g))
              (wiring[m[1]] ??= []).push({ event, matcher: entry.matcher ?? null });
    } catch (e) {
      errors.push(`.claude/settings.json: ${e.message}`);
    }
  }

  const out = [];
  for (const file of (await readdir(dir)).sort()) {
    if (!/\.(mjs|js|cjs|sh)$/.test(file)) continue;
    const abs = join(dir, file);
    const id = file.replace(/\.[^.]+$/, "");

    /* R21: a hook has no frontmatter. If a sibling declares a description, that
       is the source of truth. Otherwise derive one from the leading comment
       block and SAY that it was derived — the catalog must never present a
       guess as a declaration. */
    let description = null, source = null;
    const sidecar = join(dir, `${id}.json`);
    if (existsSync(sidecar)) {
      try {
        const meta = JSON.parse(await readFile(sidecar, "utf8"));
        if (meta.description) { description = meta.description; source = "hook.json"; }
      } catch (e) { errors.push(`${rel(sidecar)}: ${e.message}`); }
    }
    if (!description) {
      const text = await readFile(abs, "utf8");
      const lines = text.split("\n");
      const start = lines[0]?.startsWith("#!") ? 1 : 0;
      const block = [];
      for (const line of lines.slice(start)) {
        if (/^\s*\/\//.test(line)) block.push(line.replace(/^\s*\/\/\s?/, ""));
        else if (block.length) break;
        else if (line.trim()) break;
      }
      const derived = block.join(" ").replace(/\s+/g, " ").trim();
      if (derived) {
        description = derived.length > 400 ? derived.slice(0, 400).replace(/\s+\S*$/, "") + "…" : derived;
        source = "comment-block";
        diagnostics.push({
          severity: "warning",
          path: rel(abs),
          message: "hook has no declared description — the catalog derived one from its leading comment block. Add a sibling hook.json with a `description` field to make it authoritative (specs/16 R21, Q3)",
        });
      }
    }
    if (!description)
      diagnostics.push({
        severity: "error",
        path: rel(abs),
        message: "hook has no description and no comment block to derive one from. The catalog will not invent text (specs/16 R3, R21)",
      });

    out.push({
      id, type: "hook", description, descriptionSource: source,
      wiring: (wiring[file] ?? []).sort((a, b) => a.event.localeCompare(b.event)),
      path: rel(abs), evals: await coverage(id),
    });
  }
  return out;
}

async function mcpTools() {
  const dir = join(ROOT, "mcp/src/tools");
  if (!existsSync(dir)) return [];

  /* Only the tools the server actually registers. A file in tools/ that nobody
     wires up is dead code, not a published tool. */
  const serverFile = join(ROOT, "mcp/src/server.ts");
  const registered = new Set();
  if (existsSync(serverFile)) {
    const text = await readFile(serverFile, "utf8");
    for (const m of text.matchAll(/^\s*register([A-Za-z0-9]+)\(server/gm)) registered.add(m[1]);
  }

  const out = [];
  for (const file of (await readdir(dir)).sort()) {
    if (!file.endsWith(".ts") || file === "shared.ts") continue;
    const text = await readFile(join(dir, file), "utf8");

    const fn = text.match(/export function (register[A-Za-z0-9]+)\(/);
    if (fn && registered.size && !registered.has(fn[1].replace(/^register/, ""))) {
      diagnostics.push({
        severity: "warning", path: rel(join(dir, file)),
        message: "tool is defined but not registered in mcp/src/server.ts — left out of the catalog",
      });
      continue;
    }

    const name = text.match(/registerTool\(\s*'([^']+)'/) ?? text.match(/registerTool\(\s*"([^"]+)"/);
    const title = text.match(/title:\s*'([^']+)'/) ?? text.match(/title:\s*"([^"]+)"/);
    const desc = text.match(/description:\s*\n?\s*'([^']+)'/) ?? text.match(/description:\s*\n?\s*"((?:[^"\\]|\\.)+)"/);
    if (!name || !desc) {
      diagnostics.push({
        severity: "warning", path: rel(join(dir, file)),
        message: "could not read a tool name and description from this file — left out rather than guessed",
      });
      continue;
    }
    out.push({
      id: name[1], type: "mcp-tool",
      description: desc[1].replace(/\\"/g, '"'),
      descriptionSource: "registerTool",
      title: title?.[1] ?? null,
      path: rel(join(dir, file)), evals: [],
    });
  }
  return out;
}

async function productSkills() {
  const dir = join(ROOT, "skills");
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of (await readdir(dir)).sort()) {
    const abs = join(dir, name);
    if (!(await stat(abs)).isDirectory()) continue;
    const readme = join(abs, "README.md");
    if (!existsSync(readme)) continue;
    const text = await readFile(readme, "utf8");
    out.push({
      id: name, type: "product-skill",
      description: firstParagraph(text.replace(/^#.*$/m, "")) ?? null,
      descriptionSource: "README.md",
      path: rel(readme), evals: await coverage(name),
    });
  }
  return out;
}

/* ── the marketplace, if it exists yet ───────────────────────────────────── */
async function marketplace() {
  const file = join(ROOT, ".claude-plugin/marketplace.json");
  if (!existsSync(file)) {
    diagnostics.push({
      severity: "info", path: ".claude-plugin/marketplace.json",
      message: "no marketplace manifest yet — no artefact can be attributed to a plugin, and no install command can be produced. The catalog reports this rather than inventing plugin names",
    });
    return null;
  }
  const mk = JSON.parse(await readFile(file, "utf8"));
  const plugins = [];
  for (const entry of mk.plugins ?? []) {
    const p = { name: entry.name, description: entry.description ?? null, version: entry.version ?? null, owns: [] };
    if (typeof entry.source === "string" && entry.source.startsWith(".")) {
      const abs = join(ROOT, entry.source);
      p.path = rel(join(abs, ".claude-plugin/plugin.json"));
      for (const sub of ["skills", "agents", "commands", "hooks"]) {
        const d = join(abs, sub);
        if (existsSync(d)) for (const e of (await readdir(d)).sort()) p.owns.push(e.replace(/\.[^.]+$/, ""));
      }
    }
    plugins.push(p);
  }
  return { name: mk.name, owner: mk.owner?.name ?? null, plugins: plugins.sort((a, b) => a.name.localeCompare(b.name)) };
}

/* ── assemble ────────────────────────────────────────────────────────────── */
export async function buildCatalog() {
  errors = [];
  diagnostics = [];

  const classes = {
    skill: await skills(),
    agent: await agents(),
    hook: await hooks(),
    "mcp-tool": await mcpTools(),
    "product-skill": await productSkills(),
  };

  for (const [type, min] of Object.entries(MINIMUMS)) {
    const n = classes[type].length;
    if (n < min)
      errors.push(`class "${type}": found ${n}, expected at least ${min}. A source directory moved or emptied — fix the glob, do not lower the minimum.`);
  }

  const market = await marketplace();
  const owned = new Map();
  for (const p of market?.plugins ?? []) for (const id of p.owns) owned.set(id, p.name);

  const artefacts = Object.values(classes).flat().map((a) => ({
    ...a,
    plugin: owned.get(a.id) ?? null,
  })).sort((a, b) => a.type.localeCompare(b.type) || a.id.localeCompare(b.id));

  /* Cross-references, read out of the descriptions themselves (R22, R23).
     An artefact that names another one is quoting its own source, so the edge
     carries the sentence it came from and the path that sentence lives in. No
     edge is drawn from anything but a real mention — which is why this graph is
     sparser than the true dependency web, and correct. */
  const ids = artefacts.map((a) => a.id).filter((id) => id.length > 4);
  for (const a of artefacts) {
    const sentences = String(a.description).split(/(?<=[.;])\s+/);
    const seen = new Map();
    for (const other of ids) {
      if (other === a.id) continue;
      const hit = sentences.find((s) => s.includes(other));
      if (hit && !seen.has(other)) seen.set(other, hit.replace(/\s+/g, " ").trim());
    }
    a.mentions = [...seen.entries()]
      .map(([id, sentence]) => ({ id, sentence }))
      .sort((x, y) => x.id.localeCompare(y.id));
  }

  const unattributed = artefacts.filter((a) => !a.plugin).length;
  if (market && unattributed)
    diagnostics.push({
      severity: "warning", path: ".claude-plugin/marketplace.json",
      message: `${unattributed} artefact(s) belong to no plugin in the marketplace — they are findable here but not installable`,
    });

  if (errors.length) {
    const e = new Error("catalog generation failed:\n  " + errors.join("\n  "));
    e.diagnostics = diagnostics;
    throw e;
  }

  return {
    repo: "AIengineerDev/dev-digest",
    marketplace: market,
    counts: Object.fromEntries(Object.entries(classes).map(([k, v]) => [k, v.length])),
    artefacts,
    diagnostics: diagnostics.sort((a, b) => a.path.localeCompare(b.path) || a.message.localeCompare(b.message)),
  };
}

async function main() {
  const i = process.argv.indexOf("--out");
  let catalog;
  try {
    catalog = await buildCatalog();
  } catch (e) {
    console.error(e.message);
    for (const d of e.diagnostics ?? []) console.error(`  ${d.severity}: ${d.path} — ${d.message}`);
    process.exit(1);
  }

  const json = JSON.stringify(catalog, null, 2) + "\n";

  if (process.argv.includes("--report")) {
    console.log(`Catalog: ${catalog.artefacts.length} artefacts, ${(json.length / 1024).toFixed(1)} KB\n`);
    for (const [k, v] of Object.entries(catalog.counts)) console.log(`  ${k.padEnd(14)} ${v}`);
    console.log(`\n  marketplace    ${catalog.marketplace ? catalog.marketplace.name : "none yet"}`);
    console.log(`  with evals     ${catalog.artefacts.filter((a) => a.evals.length).length}`);
    if (catalog.diagnostics.length) {
      console.log("\nDiagnostics:");
      for (const d of catalog.diagnostics) console.log(`  ${d.severity.padEnd(7)} ${d.path}\n          ${d.message}`);
    }
    return;
  }

  if (i > -1) {
    const { writeFile, mkdir } = await import("node:fs/promises");
    const out = resolve(ROOT, process.argv[i + 1]);
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, json);
    console.log(`Wrote ${rel(out)} — ${catalog.artefacts.length} artefacts, ${(json.length / 1024).toFixed(1)} KB`);
  } else {
    process.stdout.write(json);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
