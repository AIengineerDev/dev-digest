#!/usr/bin/env node
//
// Fails when the Pages deploy trigger stops covering a source the catalog reads.
//
//   node scripts/check-pages-trigger.mjs
//
// The catalog is generated at deploy time and never committed, which is what
// makes a staleness gate unnecessary — but only while the deploy actually fires.
// A source that changes without triggering the workflow leaves the published
// site showing a repository that no longer exists, and nothing else notices,
// because every build that does run is correct.

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SOURCES } from "./build-catalog.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workflow = readFileSync(resolve(ROOT, ".github/workflows/pages.yml"), "utf8");

const missing = SOURCES.filter((src) => {
  const dir = src.replace(/\/[^/]*\.[a-z]+$/, "");      // a file is covered by its directory
  return !workflow.includes(`"${src}`) && !workflow.includes(`"${dir}/`);
});

if (missing.length) {
  console.error("pages.yml does not fire on every source the catalog reads:\n");
  for (const m of missing) console.error(`  - ${m}`);
  console.error(`\nAdd them under both triggers' \`paths:\`, or the published site
goes stale the next time one of them changes.`);
  process.exit(1);
}
console.log(`pages.yml covers all ${SOURCES.length} catalog sources`);
