#!/usr/bin/env bash
#
# Guard the two vendored copies of @devdigest/shared against drift.
#
#   ./scripts/check-shared.sh          # fail if the trees differ
#   ./scripts/check-shared.sh --fix    # copy server -> client, then re-check
#
# `server/src/vendor/shared` is canonical: contracts change server-side first,
# then reach consumers. The client copy is a mirror, never an independent edit.
#
# Why this exists: nothing in the type system links the two copies. The client
# typechecks only the subset it imports, so editing one side alone is silent
# until a response fails validation in the browser. On 2026-08-09 five files had
# drifted, including a Zod enum that made the client reject valid server
# payloads. See INSIGHTS.md (root), "Tool & Library Notes".

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVER="$ROOT/server/src/vendor/shared"
CLIENT="$ROOT/client/src/vendor/shared"

for dir in "$SERVER" "$CLIENT"; do
  [ -d "$dir" ] || { echo "check-shared: missing $dir" >&2; exit 2; }
done

if [ "${1:-}" = "--fix" ]; then
  rsync -a --delete "$SERVER/" "$CLIENT/"
  echo "check-shared: client copy synced from server"
fi

if diff -rq "$CLIENT" "$SERVER" >/dev/null 2>&1; then
  echo "check-shared: OK — the two @devdigest/shared copies are identical"
  exit 0
fi

echo "check-shared: FAIL — the vendored @devdigest/shared copies have drifted:" >&2
diff -rq "$CLIENT" "$SERVER" >&2 || true
cat >&2 <<'EOF'

The same Zod schema is supposed to drive request validation and response
serialization on both sides. Two copies that disagree break that guarantee.

Fix: make the change in server/src/vendor/shared first, then run
  ./scripts/check-shared.sh --fix
and commit both trees together.
EOF
exit 1
