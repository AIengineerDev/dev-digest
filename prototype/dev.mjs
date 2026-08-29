#!/usr/bin/env node
//
// Local dev server for the prototype.
//
//   node prototype/dev.mjs                     # http://localhost:4300/prototype/
//   node prototype/dev.mjs --port 5000
//   node prototype/dev.mjs --base /dev-digest  # rehearse the real Pages subpath
//   node prototype/dev.mjs --no-reload         # serve exactly what deploys
//
// Serves the SAME assembly the `pages` workflow uploads — both call
// scripts/build-pages.mjs — so a path that works here works on Pages. Files are
// read per request, so an edit is live on the next reload with no restart.
//
// Node standard library only: no dependency, no lockfile, no install. That is
// the same promise the prototype itself makes, and this server is not the place
// to break it.
//
// --base exists because the deployed site lives under /dev-digest/, not /. A
// relative URL that resolves at the root can still 404 one directory down, and
// that is the single most common way a Pages deploy fails after a green build.

import { createServer } from "node:http";
import { assemble } from "../scripts/build-pages.mjs";

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(name);
  return i > -1 ? argv[i + 1] : fallback;
};
const PORT = Number(flag("--port", 4300));
const BASE = (flag("--base", "") || "").replace(/\/$/, "");
const RELOAD = !argv.includes("--no-reload");

if (argv.includes("--help") || argv.includes("-h")) {
  console.log(`
  node prototype/dev.mjs [options]

    --port <n>      port to listen on (default 4300)
    --base <path>   serve under a subpath, e.g. --base /dev-digest
    --no-reload     do not inject the live-reload client
    --help          this text
`);
  process.exit(0);
}

/* Live reload. One SSE stream; every open page listens and reloads when the
   server tells it to. Injected into HTML only, and only when enabled — so
   --no-reload serves byte-for-byte what the workflow uploads. */
const clients = new Set();
const reloadClient = `
<script>
/* dev only — injected by prototype/dev.mjs, never present in the deployed page */
(function () {
  var es = new EventSource("${BASE}/__reload");
  es.onmessage = function () { location.reload(); };
  es.onerror = function () { es.close(); setTimeout(function () { location.reload(); }, 1200); };
})();
</script>
`;

/* A poll rather than fs.watch: watch semantics differ across platforms and
   editors that write via rename fire events the naive handler misses. Reading
   two small files every 400 ms costs nothing and never misses a save. */
let last = "";
async function watch() {
  try {
    const site = await assemble();
    const stamp = [...site.values()].map((f) => f.body.length).join(":");
    if (last && stamp !== last) {
      for (const res of clients) res.write("data: reload\n\n");
      console.log(`  reloaded ${clients.size} client(s)`);
    }
    last = stamp;
  } catch {
    /* a broken file mid-save is normal; the next tick picks it up */
  }
  setTimeout(watch, 400);
}

const server = createServer(async (req, res) => {
  let path = decodeURIComponent(new URL(req.url, "http://localhost").pathname);

  if (BASE && path === BASE) return redirect(res, BASE + "/");
  if (BASE && path.startsWith(BASE + "/")) path = path.slice(BASE.length);
  else if (BASE) return send(res, 404, "text/plain", `Not found. This server is mounted at ${BASE}/`);

  if (path === "/__reload") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.write("retry: 500\n\n");
    clients.add(res);
    req.on("close", () => clients.delete(res));
    return;
  }

  let site;
  try {
    site = await assemble();
  } catch (e) {
    return send(res, 500, "text/html; charset=utf-8",
      `<pre style="font:14px monospace;padding:24px;color:#D2685C">${e.message}</pre>`);
  }

  /* A directory URL means its index — the same thing Pages does. */
  if (path.endsWith("/")) path += "index.html";
  const file = site.get(path);

  if (!file) {
    const known = [...site.keys()].map((k) => `  ${BASE}${k}`).join("\n");
    return send(res, 404, "text/plain",
      `404 ${path}\n\nThis server only holds the assembled site:\n${known}\n`);
  }

  let body = file.body;
  if (RELOAD && file.type.startsWith("text/html"))
    body = body.replace("</body>", reloadClient + "</body>");

  send(res, 200, file.type, body);
});

function send(res, code, type, body) {
  res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(body);
}
function redirect(res, to) {
  res.writeHead(302, { Location: to });
  res.end();
}

server.listen(PORT, () => {
  const at = `http://localhost:${PORT}${BASE}`;
  console.log(`
  Prototype dev server

    catalog   ${at}/prototype/
    root      ${at}/
    reload    ${RELOAD ? "on — edit prototype/index.html and the page refreshes" : "off"}
    ${BASE ? `base      ${BASE}  (rehearsing the deployed subpath)` : "base      /  (deployed site lives under /dev-digest — try --base /dev-digest)"}

  Ctrl-C to stop.
`);
  watch();
});

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    for (const res of clients) res.end();
    server.close(() => process.exit(0));
  });
}
