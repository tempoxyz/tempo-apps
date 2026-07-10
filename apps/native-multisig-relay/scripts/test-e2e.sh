#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

export ACCOUNTS_REPO="${ACCOUNTS_REPO:-$HOME/github/tempoxyz/accounts}"
export TEMPO_ENV="${TEMPO_ENV:-localnet}"

if [ ! -f "$ACCOUNTS_REPO/src/server/internal/handlers/multisig.ts" ]; then
	echo "ACCOUNTS_REPO must point at an accounts checkout with native multisig relay support."
	echo "Current ACCOUNTS_REPO=$ACCOUNTS_REPO"
	exit 1
fi

if [ -z "${TEMPO_TAG:-}" ] && [ -x "$HOME/github/tempoxyz/tempo/target/debug/tempo" ]; then
	export TEMPO_TAG="$HOME/github/tempoxyz/tempo/target/debug/tempo"
fi

echo "ACCOUNTS_REPO=$ACCOUNTS_REPO"
echo "TEMPO_ENV=$TEMPO_ENV"
echo "TEMPO_TAG=${TEMPO_TAG:-latest}"

if [ -x ./node_modules/.bin/vitest ]; then
	./node_modules/.bin/vitest --run test/e2e.test.ts
else
	pnpm vitest --run test/e2e.test.ts
fi
