# PR Brief — demo shot list (1–3 min)

For the recording. Written to be followed without pausing to think about what to
click next. Total speaking time ≈ 2 min at a normal pace.

## Before you hit record

```bash
./scripts/dev.sh                 # Postgres + API :3001 + web :3000
```

Then, once: import a repo with real PRs and let it index. **The brief degrades
gracefully on an unindexed repo — it will still render, with the blast inputs
listed under "missing inputs".** That is correct behaviour, but it is not the
shot you want: the whole point of the card is risks pointing at real files.
Confirm the repo is indexed before recording.

Open a PR that actually changes something interesting — several files, ideally
one touching auth, config or a migration.

## Shot 1 — the problem (≈ 20s)

Land on the PR's **Overview** tab with the brief not yet generated.

> "Opening someone else's PR, the first question is always the same: what does
> this change, and where do I start reading. Today you answer that by scrolling
> the diff."

Click **Generate**.

## Shot 2 — the card (≈ 45s)

Let it populate. Walk the card top to bottom, slowly enough to read:

1. **Risk level + counts** — say out loud that the counts come from *every*
   review at this commit, not the most recent one.
2. **What / Why** — one line each.
3. **Risks** — point at one and read its file reference.

> "Every file named here came out of the PR's own inputs. If the model invents a
> path, it is dropped before it reaches this card — the count of dropped
> references is on the record."

4. **Cost line** — one model call, capped at 8,000 input tokens.

## Shot 3 — the jump (≈ 30s) — the required beat

Scroll to **review focus**. Click the **first entry**.

Land in the diff, on that file, expanded and scrolled into view.

> "That is the point of the feature: from 'what should I look at' to the actual
> lines, in one click."

Press **Back**.

> "And Back returns to the Overview, not out of the PR — that is why this jump
> pushes history instead of replacing it."

## Shot 4 — the cache (≈ 25s)

Navigate away and return to the PR. The card is populated instantly.

> "Same PR state, so this is served from cache — no second model call. It
> regenerates when the commit changes, when the intent changes, or when the repo
> is re-indexed, because all three change what the brief would say."

Optionally open the **Regenerate** control to show it exists and is disabled
while the state is unchanged and healthy.

## Do not show

- An unindexed repo (the degraded path reads as a bug on camera even though it
  is correct).
- The Why Timeline — unbuilt, `S1`/`S2` are marked stretch in the spec.
- The e2e suite — Phase J1 was not run, and the run file says so.
