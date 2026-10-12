#!/usr/bin/env bash
# Prepare a clean checkout for a Factory image. Never supply credentials here.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

expected_pnpm=$(node -p 'require("./package.json").packageManager.replace(/^pnpm@/, "")')
if [[ "$(pnpm --version)" != "$expected_pnpm" ]]; then
  printf 'Install pnpm@%s before preparing this checkout.\n' "$expected_pnpm" >&2
  exit 1
fi

export CI=1
export WRANGLER_SEND_METRICS=false

# Match CI: skip install hooks and generate the required files explicitly.
# Include dev dependencies even when the image builder sets NODE_ENV=production.
pnpm install --frozen-lockfile --ignore-scripts --prod=false

expected_node=$(node -p 'require("./package.json").devEngines.runtime.version')
if [[ "$(pnpm node --version)" != "v$expected_node" ]]; then
  printf 'pnpm did not resolve the pinned Node runtime (%s).\n' "$expected_node" >&2
  exit 1
fi

pnpm gen:types
# The Tempo lint CLI needs this binary; CI rebuilds this dependency explicitly.
pnpm rebuild @ast-grep/cli

if [[ -n "$(git status --porcelain --untracked-files=normal)" ]]; then
  printf 'Checkout is not clean after setup. Do not save this image.\n' >&2
  exit 1
fi
