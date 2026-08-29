# `dependency-checker` — how the numbers are measured

This is not a sources file like `onion-architecture/README.md`. It records
**where every number in the report comes from**, and why, because half the
mistakes in a dependency audit are not a wrong conclusion — they are a correct
conclusion about the wrong quantity.

Measured 2026-08-27 on macOS (darwin arm64).

---

## 1. What `survey.sh` measures

| Section | Where the number comes from | What it does **not** mean |
| --- | --- | --- |
| 1. Packages | `package.json` + `du -sh <pkg>/node_modules` | Size on disk ≠ size that reaches a user |
| 2. Declared in more than one | Ranges from `package.json` | A range ≠ what is installed |
| 3. Installed drift | `node_modules/<name>/package.json` → `version` | Direct dependencies only; transitive trees are not walked |
| 4. Heaviest | `du -sk` over package directories | Includes tests, source maps, READMEs, native binaries |
| 5. Cross-package edges | `compilerOptions.paths` in each `tsconfig.json` | Not the npm graph; npm knows nothing about these edges |

`du` counts **on disk**, in filesystem blocks, so the top-N figures do not sum to
the total. That is expected and the report does not explain it — what matters is
relative weight, not byte-level accounting.

## 2. Why the glob is written that way

```sh
du -sk "$p"/node_modules/*/ "$p"/node_modules/@*/*/ | grep -vE 'node_modules/@[^/]+/$'
```

The first glob does not see scoped packages (`@next/swc-...`); the second sees
only those. But the first **also** matches the scope directory itself (`@next/`),
and without the `grep -v` every scoped package is counted twice — once as the
scope, once as the package. The first version of the script did exactly that:
`@next/` and `@next/swc-darwin-arm64/` sat side by side at an identical 124 MB.

## 3. What the script deliberately does not do

- **It does not install anything and it does not use the network.** An audit has
  no right to modify a lockfile. `npm outdated` and `npm audit` need the network;
  if you want them, that is a separate, explicitly named step.
- **It does not count transitive trees.** Six independent lockfiles, three
  package managers; the only honest way is to ask each manager separately
  (`pnpm why`, `npm ls`), and that is done per question, not in bulk.
- **It does not measure the bundle.** That is the one number that genuinely
  answers "how heavy is this" for a frontend package, and it needs a real
  production build. Until it has been measured, the report is obliged to say it
  has not been measured.
- **It skips cloned repositories checked out inside the workspace.** A full copy
  of a repository carries its own `node_modules`; scanning without excluding it
  doubles every number.

## 4. What the first measurement found

Three things worth knowing before the first run:

1. **`zod` had split in two.** Three packages were on `^3.24.1` (3.25.76 on
   disk) while a fourth was on `^4.0.0` (4.4.3 on disk). That fourth package also
   path-aliases `@app/shared` into another package's source tree, so tsc pulls
   files written against Zod 3 into a program that resolves `zod` to Zod 4.
   `npm run typecheck` **passes** — verified 2026-08-27. This is a hidden hazard
   rather than a break, and exactly the case section 3 exists for.
2. **The frontend package weighed 670 MB on disk, and almost none of it reaches a
   user:** `next` 152 MB + `@next/swc-darwin-arm64` 124 MB is the compiler. A
   report that presents 670 MB as "the weight of the client" is technically true
   and completely useless.
3. **One package carried its own `zod` alias** → `./node_modules/zod` in its
   `tsconfig.json`. That is not decorative: the package is consumed as source,
   and without the alias its `zod` resolves into the consumer's `node_modules`.

## 5. The boundary with neighbouring skills

- `onion-architecture` — import direction **inside** the backend source tree.
  This skill does not go there.
- `frontend-ui-architecture` — where a file belongs in the frontend.
- This skill — external packages only: what is installed, what it weighs, where
  versions diverge, and what to do about it.

Duplicating a neighbouring skill's content is not allowed: every linked skill
costs tokens on every run.
