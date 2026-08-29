#!/usr/bin/env node
//
// Assembles the GitHub Pages site.
//
//   node scripts/build-pages.mjs            # write ./_site
//   node scripts/build-pages.mjs --out dist # write somewhere else
//
// One definition of the site layout, used by two callers: the `pages` workflow
// writes it to disk and uploads it, and `prototype/dev.mjs` serves it from
// memory. That is the whole reason this file exists — when the layout lived
// inline in the workflow, the dev server had to guess at it, and "works
// locally, 404s on Pages" is a class of bug you only find after deploying.
//
// Node standard library only. This runs before any install step in CI.

import { mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCatalog } from "./build-catalog.mjs";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/* The root page. A placeholder until specs/16's `site/` export takes the root —
   the prototype deliberately sits at /prototype/ so that swap breaks no link. */
const rootPage = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark light">
<title>dev-digest</title>
<style>
  :root { --bg:#0F1419; --fg:#E1E7ED; --dim:#96A3B0; --accent:#D6A241; }
  @media (prefers-color-scheme: light) {
    :root { --bg:#EEF1F3; --fg:#141C24; --dim:#4F5D6A; --accent:#8A5D0C; }
  }
  body { margin:0; min-height:100vh; display:grid; place-content:center; gap:14px;
         background:var(--bg); color:var(--fg); padding:32px;
         font:400 15px/1.6 ui-sans-serif, system-ui, sans-serif; }
  h1 { margin:0; font-size:20px; font-weight:600; letter-spacing:-.01em; }
  p { margin:0; color:var(--dim); max-width:52ch; }
  a { color:var(--accent); }
</style>
</head>
<body>
  <h1>dev-digest</h1>
  <p>The artefact catalog is not built yet. The design prototype it will be
     implemented from is at <a href="./prototype/">/prototype/</a>.</p>
</body>
</html>
`;

/**
 * The site as a map of URL path → file contents.
 * Keys are the paths a browser requests, so the dev server can answer from it
 * directly and the writer can turn each key into a file.
 */
export async function assemble() {
  const prototype = await readFile(join(ROOT, "prototype", "index.html"), "utf8");

  if (!prototype.startsWith("<!doctype html>"))
    throw new Error("prototype/index.html is not a standalone document — it must start with <!doctype html>");

  /* Generated fresh on every assembly, so the page cannot show a stale repo.
     This is why the prototype has no committed index and needs no staleness
     gate: there is no committed copy to drift. */
  const catalog = JSON.stringify(await buildCatalog(), null, 2) + "\n";

  return new Map([
    ["/index.html", { body: rootPage, type: "text/html; charset=utf-8" }],
    ["/prototype/index.html", { body: prototype, type: "text/html; charset=utf-8" }],
    ["/prototype/catalog.json", { body: catalog, type: "application/json; charset=utf-8" }],
    ["/.nojekyll", { body: "", type: "text/plain" }],
  ]);
}

async function main() {
  const i = process.argv.indexOf("--out");
  const out = resolve(ROOT, i > -1 ? process.argv[i + 1] : "_site");

  const site = await assemble();
  await rm(out, { recursive: true, force: true });

  for (const [path, { body }] of site) {
    const file = join(out, path);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, body);
  }

  console.log(`Assembled ${site.size} files into ${out}`);
  for (const path of site.keys()) console.log(`  ${path}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
