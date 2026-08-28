#!/usr/bin/env bash
#
# verify:l06 — the eval pipeline's acceptance criteria, checked mechanically.
#
# Each check maps to one line of the brief. They are ordered cheapest first: the
# static ones need nothing running, the data ones need Postgres up. A failure
# prints WHAT was expected, not just that something is wrong — a red gate that
# does not say what it wanted is a gate people re-run instead of reading.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

pass=0; fail=0
ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; pass=$((pass+1)); }
bad()  { printf '  \033[31m✗\033[0m %s\n' "$1"; fail=$((fail+1)); }
head_() { printf '\n\033[1m%s\033[0m\n' "$1"; }

head_ "Scoring is code, not a model call"
# The whole claim of this feature rests on this: if the scorer could call a
# model, every metric would inherit that model's nondeterminism.
if grep -qiE "openai|anthropic|LLMProvider|reviewer-core|fetch\(" server/src/modules/eval/helpers.ts; then
  bad "server/src/modules/eval/helpers.ts imports a provider — scoring must be pure"
else
  ok "the scorer imports no provider"
fi

head_ "The three denominators each have a stated answer"
if (cd server && pnpm exec vitest run test/eval-helpers.test.ts --reporter=dot >/dev/null 2>&1); then
  ok "server eval-helpers tests pass"
else
  bad "server eval-helpers tests fail (cd server && pnpm exec vitest run test/eval-helpers.test.ts)"
fi

head_ "The pieces the brief names exist"
for f in \
  "specs/13-eval-pipeline.md" \
  "server/src/modules/eval/routes.ts" \
  "server/src/modules/eval/helpers.ts" \
  "client/src/app/evals/page.tsx" \
  "client/src/app/agents/[id]/_components/AgentEditor/_components/EvalsTab/EvalsTab.tsx"
do
  [ -f "$f" ] && ok "$f" || bad "missing: $f"
done
grep -q "'/agents/:id/eval-runs'" server/src/modules/eval/routes.ts \
  && ok "POST /agents/:id/eval-runs is declared" \
  || bad "no /agents/:id/eval-runs route in server/src/modules/eval/routes.ts"
grep -q '"evals"' "client/src/app/agents/[id]/_components/AgentEditor/constants.ts" \
  && ok "the Evals tab is registered" \
  || bad "no evals tab in the AgentEditor tab list"

head_ "The dataset"
PSQL=(docker exec devdigest-postgres psql -U devdigest -d devdigest -tAc)
if ! "${PSQL[@]}" "select 1" >/dev/null 2>&1; then
  bad "Postgres is not reachable — start it with ./scripts/dev.sh --db-only"
else
  cases=$("${PSQL[@]}" "select count(*) from eval_cases;" | tr -d '[:space:]')
  [ "${cases:-0}" -ge 8 ] \
    && ok "$cases eval cases (need >= 8)" \
    || bad "$cases eval cases — the brief asks for at least 8"

  finds=$("${PSQL[@]}" "select count(*) from eval_cases where expected_output::text like '%must_find%';" | tr -d '[:space:]')
  flags=$("${PSQL[@]}" "select count(*) from eval_cases where expected_output::text like '%must_not_flag%';" | tr -d '[:space:]')
  # Both kinds have to be present or precision is untested: only a
  # must_not_flag case can ever lower it.
  [ "${finds:-0}" -ge 1 ] && ok "must_find cases: $finds" || bad "no must_find case — accept a finding and turn it into one"
  [ "${flags:-0}" -ge 1 ] && ok "must_not_flag cases: $flags" || bad "no must_not_flag case — dismiss a finding and turn it into one"

  runs=$("${PSQL[@]}" "select count(distinct ran_at) from eval_runs;" | tr -d '[:space:]')
  [ "${runs:-0}" -ge 2 ] \
    && ok "$runs distinct runs recorded (need >= 2 to compare)" \
    || bad "$runs distinct runs — the experiment needs two to compare"

  # Two runs of the same set under DIFFERENT prompts is what makes the
  # comparison an experiment rather than a repeat.
  prompts=$("${PSQL[@]}" "select count(distinct actual_output->'agent'->>'system_prompt') from eval_runs where actual_output ? 'agent';" | tr -d '[:space:]')
  [ "${prompts:-0}" -ge 2 ] \
    && ok "$prompts distinct system prompts across runs" \
    || bad "$prompts distinct prompt(s) — change the system prompt and run again"
fi

printf '\n%s passed, %s failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
