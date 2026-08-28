# Eval suite — repo-conventions

Two pull requests against a miniature of this repository, carrying eleven
violations of conventions that **every automated gate lets through**. Typecheck
passes, tests pass, `pnpm arch` passes, and the damage surfaces days later in
someone else's branch.

| Arm | Body | What it answers |
| --- | --- | --- |
| `without-skills` | — (baseline) | what the agent prompt alone reaches |
| `agents-md-raw` | [`variants/AGENTS.snapshot.md`](variants/AGENTS.snapshot.md) | is the file we already maintain usable as a reviewer rubric? |
| `repo-conventions` | [`../SKILL.md`](../SKILL.md) | does a rubric written for a reviewer beat one written for an implementer? |

The middle arm is the point of this suite. `AGENTS.md` was written to instruct an
implementer — *"Read `specs/` before building a feature"* — not to tell a
reviewer what to look for in a diff. Whether that difference costs anything is
measurable, and this is the measurement.

## The plants

Nothing in the fixture explains any of them; `make-diffs.sh` refuses to
regenerate if it finds a sentence that does.

### `01-webhook-delivery-plumbing`

| id | Planted |
| --- | --- |
| `symlink-copy` | `client/CLAUDE.md` stops being a symlink to `AGENTS.md` — mode `120000` deleted, `100644` added, content identical |
| `it-test-naming` | a testcontainers-backed test named `*.test.ts`, so it joins the hermetic lane that has no database |
| `wrong-pm` | a `package-lock.json` in a pnpm package |
| `vendor-mirror-only` | the contract edited in the client's vendored copy only |
| `handwritten-migration` | a line appended to an already-applied migration |
| `arch-baseline-grown` | a new entry added to the known-violations baseline, disarming the gate for this PR's own violation |
| `clones-committed` | a file under `server/clones/` |

### `02-reviewer-core-caching`

| id | Planted |
| --- | --- |
| `purity-fs` | the pure engine gains `node:fs` and a home-directory cache |
| `emit-build` | `build` becomes a real emit and `main` points at `dist/` |
| `unfenced-untrusted` | `wrapUntrusted()` removed; the raw diff reaches the prompt |
| `grounding-bypass` | a `skipGrounding` flag makes the citation gate optional |

## What two runs measured (2026-08-27, `claude-opus-5`, n=2)

| plant | `without-skills` | `agents-md-raw` | `repo-conventions` |
| --- | --- | --- | --- |
| `it-test-naming` | **0/2** | 2/2 | 2/2 |
| `purity-fs` | **0/2** | 1/2 | **2/2** |
| the other nine | 2/2 | 2/2 | 2/2 |
| unmatched per run | 2.0 / 2.5 | 0.0 / 2.0 | **0.0 / 0.0** |
| cost, 2 runs | $0.50 | $0.58 | **$0.40** |

**Two of eleven plants discriminate**, and the line between the two groups is
not arbitrary. The nine are visible in the diff itself — a deleted `120000`
mode next to an added `100644`, a lockfile beside a lockfile, a path literally
called `clones/`. General engineering knowledge is enough. The two that
discriminate need a fact the diff does not carry: that a filename decides which
CI lane a test runs in, and that this package has a no-I/O contract.

So the nine are **canaries**, not failures of the fixture: they prove the
reviewer is alive, and they cost nothing extra because plants share one diff and
one call. Only the two are measuring the skill.

The clearest signal is not the hit rate. `repo-conventions` filed **zero**
findings that matched no plant, in both cases, and was the **cheapest** arm.
The distilled rubric did not add tokens — it saved them, by stopping the
reviewer wandering.

At n=2 only `0/2` and `2/2` are readable. `agents-md-raw`'s `1/2` on `purity-fs`
means unstable and nothing more; it is not "half the time", and it is not a
delta against `2/2`.

## Running

```sh
cd <repo root>/evals && npm install
npm run eval -- --suite repo-conventions --reps 2
npm run delta -- --suite repo-conventions
```

If you add a plant, add its row above and to `expected.json`, then re-run
`./make-diffs.sh` — which will refuse if the new fixture explains itself.
