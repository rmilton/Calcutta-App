#!/usr/bin/env bash
set -euo pipefail

BASE_REF="${1:-HEAD}"
STYLE_REGEX='(^apps/ncaa/client/src/index.css$|^apps/ncaa/client/tailwind.config.js$|^apps/ncaa/client/src/.*\.(css|scss|sass|less)$)'

changed_status=$(git diff --name-status -M "$BASE_REF" -- apps/ncaa/client || true)
if [[ -z "$changed_status" ]]; then
  exit 0
fi

changed_files=$(echo "$changed_status" | awk '$1 ~ /^M/ { print $2 }')
if [[ -z "$changed_files" ]]; then
  exit 0
fi

violations=$(echo "$changed_files" | grep -E "$STYLE_REGEX" || true)
if [[ -n "$violations" ]]; then
  echo "NCAA style freeze violation detected:"
  echo "$violations"
  exit 1
fi
