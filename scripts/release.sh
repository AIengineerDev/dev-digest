#!/usr/bin/env bash
#
# Publish a marketplace release.
#
#   ./scripts/release.sh --version 1.4.0            # dry run: verify + show the plan
#   ./scripts/release.sh --version 1.4.0 --push     # actually tag and push
#
# What a "release" is here, and why it is this shape:
#
# `/plugin marketplace add owner/repo` tracks the repository's DEFAULT BRANCH.
# Plugins whose `source` is a relative path have no ref of their own — the
# marketplace's commit IS the plugin's commit. So there is no such thing as
# releasing one plugin: every merge to the default branch ships everything, to
# everyone, on their next marketplace update. This script does not pretend
# otherwise. It gates that moment and leaves a tag we can roll back TO.
#
# The tag is the whole point. Without a named good state, rollback has nothing
# to aim at, and `git revert <the merge that broke it>` requires knowing which
# merge that was — which you never do at the moment you need it.
#
# Nothing is pushed without --push. Nothing is force-pushed, ever: see
# scripts/rollback.sh for why.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

VERSION=""
PUSH=0

while [ $# -gt 0 ]; do
  case "$1" in
    --version) VERSION="${2:-}"; shift 2 ;;
    --push)    PUSH=1; shift ;;
    -h|--help) sed -n '2,26p' "$0" | sed 's|^# \{0,1\}||'; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

[ -n "$VERSION" ] || { echo "--version X.Y.Z is required" >&2; exit 2; }
echo "$VERSION" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$' \
  || { echo "--version must be X.Y.Z, got '$VERSION'" >&2; exit 2; }

TAG="marketplace-v$VERSION"

step() { printf '\n\033[1m▸ %s\033[0m\n' "$1"; }
fail() { printf '\033[31m✗ %s\033[0m\n' "$1" >&2; exit 1; }

# ── 1. The repo has to be a marketplace ──────────────────────────────────────
[ -f .claude-plugin/marketplace.json ] \
  || fail "no .claude-plugin/marketplace.json — nothing to release"

# ── 2. Releasing from a dirty or diverged tree ships something nobody read ───
step "Checking the working tree"
[ -z "$(git status --porcelain)" ] || fail "working tree is dirty — commit or stash first"

DEFAULT_BRANCH="$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null | sed 's|^origin/||' || echo main)"
CURRENT="$(git rev-parse --abbrev-ref HEAD)"
[ "$CURRENT" = "$DEFAULT_BRANCH" ] \
  || fail "on '$CURRENT', but users install from '$DEFAULT_BRANCH' — release from there"

git fetch --quiet origin "$DEFAULT_BRANCH" --tags
LOCAL="$(git rev-parse HEAD)"
REMOTE="$(git rev-parse "origin/$DEFAULT_BRANCH")"
[ "$LOCAL" = "$REMOTE" ] \
  || fail "local '$DEFAULT_BRANCH' is not in sync with origin — pull or push first"

git rev-parse --verify --quiet "refs/tags/$TAG" >/dev/null \
  && fail "tag $TAG already exists — pick the next version"

echo "  ${DEFAULT_BRANCH} @ ${LOCAL:0:8}, clean, in sync"

# ── 3. The gate ──────────────────────────────────────────────────────────────
step "Verifying the marketplace"
node scripts/marketplace-verify.mjs || fail "marketplace verification failed — not releasing"

# ── 4. What this release actually contains ───────────────────────────────────
step "Release contents"
node -e '
  const mk = JSON.parse(require("fs").readFileSync(".claude-plugin/marketplace.json", "utf8"))
  for (const p of mk.plugins ?? []) {
    const v = p.version ?? "(unversioned)"
    console.log(`  ${p.name.padEnd(28)} ${String(v).padEnd(10)} ${typeof p.source === "string" ? p.source : p.source.source}`)
  }
  const renames = Object.entries(mk.renames ?? {})
  if (renames.length) {
    console.log("\n  renames in effect:")
    for (const [from, to] of renames) console.log(`    ${from} -> ${to === null ? "(withdrawn)" : to}`)
  }
'

PREV_TAG="$(git tag --list 'marketplace-v*' --sort=-v:refname | head -1 || true)"
if [ -n "$PREV_TAG" ]; then
  step "Changes since $PREV_TAG"
  git log --oneline "$PREV_TAG..HEAD" -- .claude-plugin plugins .claude/skills .claude/agents .claude/hooks \
    | sed 's/^/  /' || true
else
  echo "  (no previous marketplace tag — this is the first release)"
fi

# ── 5. Tag, and only then push ───────────────────────────────────────────────
if [ "$PUSH" -eq 0 ]; then
  cat <<MSG

Dry run. Nothing was tagged and nothing was pushed.

Re-run with --push to create $TAG at ${LOCAL:0:8} and push it:

    ./scripts/release.sh --version $VERSION --push

Users on '$DEFAULT_BRANCH' already have this commit — the tag does not ship it,
it names it so scripts/rollback.sh has a target.
MSG
  exit 0
fi

step "Tagging $TAG"
git tag -a "$TAG" -m "marketplace $VERSION

$(node -e '
  const mk = JSON.parse(require("fs").readFileSync(".claude-plugin/marketplace.json","utf8"))
  for (const p of mk.plugins ?? []) console.log(`${p.name} ${p.version ?? "-"}`)
')"

git push origin "$TAG"
printf '\n\033[32m✓ %s pushed\033[0m\n' "$TAG"
echo "  Roll back to it with: ./scripts/rollback.sh --to $TAG"
