#!/usr/bin/env bash
# snapshot-publish the current tracked tree to the public mirror (skowtcc/monorepo)
#
# append-only: clones the public repo, replaces its tree with `git archive HEAD`,
# commits one dated sync commit, and pushes. it never rewrites the public history
# and never ships ignored or untracked files (node_modules, .env, dist), because
# `git archive HEAD` only emits tracked files at the current commit, so no
# history and nothing untracked or ignored ever crosses over
#
# usage: bun run publish   (or: bash scripts/publish-public.sh)
# override the target with PUBLIC_REMOTE=... if needed
set -euo pipefail

PUBLIC_REMOTE="${PUBLIC_REMOTE:-git@github.com:skowtcc/monorepo.git}"
ROOT="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
SRC_SHA="$(git -C "$ROOT" rev-parse --short HEAD)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "cloning $PUBLIC_REMOTE"
git clone --quiet "$PUBLIC_REMOTE" "$WORK/pub"
BRANCH="$(git -C "$WORK/pub" branch --show-current)"

# swap the mirror's working tree (keep its .git and full history) for our tracked
# tree at HEAD, so removals propagate and only clean tracked files are published
find "$WORK/pub" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
git -C "$ROOT" archive HEAD | tar -x -C "$WORK/pub"

# defense-in-depth secret gate: scan the exact tree about to be published and
# fail closed on any hit
SECRET_RE='-----BEGIN [A-Z ]*PRIVATE KEY-----|ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{50}|xox[baprs]-[A-Za-z0-9-]{10}|AKIA[0-9A-Z]{16}|sk-[A-Za-z0-9]{20}|[MNO][A-Za-z0-9_-]{23}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{27}'
secret_hits="$(grep -rInE "$SECRET_RE" "$WORK/pub" --exclude='*.example' --exclude-dir=.git 2>/dev/null || true)"
env_hits="$(find "$WORK/pub" -name '.env' -not -path '*/.git/*' 2>/dev/null || true)"
if [ -n "$secret_hits" ] || [ -n "$env_hits" ]; then
  echo "ABORT: secret gate tripped, nothing published" >&2
  [ -n "$env_hits" ] && { echo "tracked .env files:" >&2; echo "$env_hits" >&2; }
  [ -n "$secret_hits" ] && { echo "secret-looking matches:" >&2; echo "$secret_hits" >&2; }
  exit 1
fi
# optional stronger scan if gitleaks is installed locally
if command -v gitleaks >/dev/null 2>&1; then
  gitleaks detect --no-git --source "$WORK/pub" --redact -q || { echo "ABORT: gitleaks flagged the tree, nothing published" >&2; exit 1; }
fi
echo "secret gate: clean"

cd "$WORK/pub"
git add -A
if git diff --cached --quiet; then
  echo "mirror already matches source $SRC_SHA, nothing to publish"
  exit 0
fi

# --dry-run (or DRY_RUN=1): show what the sync commit would contain, push nothing
if [ "${1:-}" = "--dry-run" ] || [ -n "${DRY_RUN:-}" ]; then
  echo "DRY RUN, nothing pushed. the sync commit against $BRANCH would be:"
  git diff --cached --stat | tail -20
  exit 0
fi
# [skip ci] at the end so the header stays conventional-commit valid and still
# skips CI (the bracket keyword is matched anywhere in the message)
git commit --quiet -m "feat(sync): update mirror $(date +%d-%m-%Y) (source $SRC_SHA) [skip ci]"
git push --quiet origin "$BRANCH"
echo "published source $SRC_SHA to $PUBLIC_REMOTE ($BRANCH)"
