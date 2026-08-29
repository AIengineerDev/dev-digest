#!/usr/bin/env bash
#
# Undo a marketplace release — forward only.
#
#   ./scripts/rollback.sh --to marketplace-v1.3.0           # dry run
#   ./scripts/rollback.sh --to marketplace-v1.3.0 --push    # commit and push
#   ./scripts/rollback.sh --withdraw broken-plugin --push   # pull one plugin
#
# THE RULE THIS SCRIPT EXISTS TO ENFORCE: never rewrite the published branch.
#
# Claude Code clones the marketplace and updates it with a pull. A force-push
# rewrites history under every one of those clones, and a pull into a rewritten
# history does not "just resolve" — it fails, and it fails on the user's machine,
# in the middle of their session, with an error about the marketplace and not
# about you. So a rollback here is a NEW COMMIT that restores old content. The
# bad commit stays in history where `git log` can still explain it.
#
# Two modes, because there are two kinds of bad release:
#
#   --to <tag>          The release as a whole was wrong. Restores
#                       .claude-plugin/ and plugins/ to that tag's content.
#
#   --withdraw <name>   One plugin is broken and the rest are fine. Removes its
#                       entry and records `renames: {"<name>": null}`, which is
#                       what tells already-installed clients it is gone rather
#                       than letting them fail to resolve it.
#
# Neither mode touches anything outside .claude-plugin/ and plugins/ — server,
# client and docs commits made since the bad release are kept.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

TO=""
WITHDRAW=""
PUSH=0

while [ $# -gt 0 ]; do
  case "$1" in
    --to)       TO="${2:-}"; shift 2 ;;
    --withdraw) WITHDRAW="${2:-}"; shift 2 ;;
    --push)     PUSH=1; shift ;;
    -h|--help)  sed -n '2,32p' "$0" | sed 's|^# \{0,1\}||'; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

step() { printf '\n\033[1m▸ %s\033[0m\n' "$1"; }
fail() { printf '\033[31m✗ %s\033[0m\n' "$1" >&2; exit 1; }

[ -n "$TO" ] || [ -n "$WITHDRAW" ] || fail "need --to <tag> or --withdraw <plugin>"
[ -z "$TO" ] || [ -z "$WITHDRAW" ] || fail "--to and --withdraw are separate operations; run one at a time"
[ -f .claude-plugin/marketplace.json ] || fail "no .claude-plugin/marketplace.json — nothing to roll back"

step "Checking the working tree"
[ -z "$(git status --porcelain)" ] || fail "working tree is dirty — commit or stash first"

DEFAULT_BRANCH="$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null | sed 's|^origin/||' || echo main)"
CURRENT="$(git rev-parse --abbrev-ref HEAD)"
[ "$CURRENT" = "$DEFAULT_BRANCH" ] \
  || fail "on '$CURRENT', but users install from '$DEFAULT_BRANCH' — roll back there"
git fetch --quiet origin "$DEFAULT_BRANCH" --tags
[ "$(git rev-parse HEAD)" = "$(git rev-parse "origin/$DEFAULT_BRANCH")" ] \
  || fail "local '$DEFAULT_BRANCH' is not in sync with origin — pull first"
echo "  ${DEFAULT_BRANCH}, clean, in sync"

# ── Mode 1: restore the whole marketplace to a tag ───────────────────────────
if [ -n "$TO" ]; then
  git rev-parse --verify --quiet "refs/tags/$TO" >/dev/null \
    || fail "tag '$TO' not found — available: $(git tag --list 'marketplace-v*' --sort=-v:refname | tr '\n' ' ')"

  step "Restoring .claude-plugin/ and plugins/ to $TO"
  git diff --stat "HEAD..$TO" -- .claude-plugin plugins | sed 's/^/  /'
  if [ -z "$(git diff --name-only "HEAD..$TO" -- .claude-plugin plugins)" ]; then
    printf '\033[32m✓ already identical to %s — nothing to roll back\033[0m\n' "$TO"
    exit 0
  fi
  git checkout "$TO" -- .claude-plugin plugins
  MSG="revert(marketplace): restore marketplace to $TO

Forward-only rollback: the published branch is never rewritten, because
Claude Code pulls this branch into user-side clones.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
fi

# ── Mode 2: withdraw a single plugin ─────────────────────────────────────────
if [ -n "$WITHDRAW" ]; then
  step "Withdrawing plugin '$WITHDRAW'"
  node -e '
    const fs = require("fs")
    const target = process.argv[1]
    const path = ".claude-plugin/marketplace.json"
    const mk = JSON.parse(fs.readFileSync(path, "utf8"))
    const before = (mk.plugins ?? []).length
    mk.plugins = (mk.plugins ?? []).filter((p) => p.name !== target)
    if (mk.plugins.length === before) {
      console.error(`  "${target}" is not a plugin in this marketplace`)
      process.exit(1)
    }
    mk.renames = { ...(mk.renames ?? {}), [target]: null }
    fs.writeFileSync(path, JSON.stringify(mk, null, 2) + "\n")
    console.log(`  removed entry and set renames["${target}"] = null`)
  ' "$WITHDRAW" || fail "withdraw failed"

  echo "  NOTE: plugins/$WITHDRAW/ is left on disk on purpose — deleting the"
  echo "        source is a separate decision from delisting it."
  MSG="revert(marketplace): withdraw $WITHDRAW

Delisted and recorded in \`renames\` as null so already-installed clients
resolve it as removed instead of failing.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
fi

# ── Verify the state we are about to publish ─────────────────────────────────
step "Verifying the rolled-back marketplace"
node scripts/marketplace-verify.mjs || {
  git checkout -- .claude-plugin plugins
  fail "rolled-back state does not verify — reverted the working tree, nothing committed"
}

step "Result"
git diff --stat -- .claude-plugin plugins | sed 's/^/  /'

if [ "$PUSH" -eq 0 ]; then
  cat <<MSG_END

Dry run. The change is in your working tree but NOT committed.

Inspect it, then either:
    ./scripts/rollback.sh ${TO:+--to $TO}${WITHDRAW:+--withdraw $WITHDRAW} --push
    git checkout -- .claude-plugin plugins    # to discard
MSG_END
  exit 0
fi

step "Committing and pushing"
git add .claude-plugin plugins
git commit -m "$MSG"
git push origin "$DEFAULT_BRANCH"
printf '\n\033[32m✓ rollback pushed to %s\033[0m\n' "$DEFAULT_BRANCH"
echo "  Users pick it up on their next marketplace update."
echo "  Tag this state when you are satisfied: ./scripts/release.sh --version <next> --push"
