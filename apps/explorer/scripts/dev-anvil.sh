#!/usr/bin/env bash
set -euo pipefail

ANVIL_HOST="${ANVIL_HOST:-127.0.0.1}"
ANVIL_PORT="${ANVIL_PORT:-8545}"
ANVIL_CHAIN_ID="${ANVIL_CHAIN_ID:-31337}"
ANVIL_BLOCK_TIME="${ANVIL_BLOCK_TIME:-1}"
ANVIL_NETWORK="${ANVIL_NETWORK:-tempo}"
EXPLORER_PORT="${EXPLORER_PORT:-3000}"

export VITE_TEMPO_ENV="localnet"
export VITE_TEMPO_RPC_URL="${VITE_TEMPO_RPC_URL:-http://${ANVIL_HOST}:${ANVIL_PORT}}"
export VITE_TEMPO_CHAIN_ID="${VITE_TEMPO_CHAIN_ID:-${ANVIL_CHAIN_ID}}"

anvil_pid=""

cleanup() {
	if [ -n "${anvil_pid}" ] && kill -0 "${anvil_pid}" 2>/dev/null; then
		kill "${anvil_pid}" 2>/dev/null || true
		wait "${anvil_pid}" 2>/dev/null || true
	fi
}

trap cleanup EXIT INT TERM

wait_for_anvil() {
	for _ in $(seq 1 50); do
		if curl \
			--fail \
			--silent \
			--show-error \
			--max-time 1 \
			--header 'content-type: application/json' \
			--data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' \
			"${VITE_TEMPO_RPC_URL}" >/dev/null 2>&1; then
			return 0
		fi

		sleep 0.2
	done

	echo "anvil did not become ready at ${VITE_TEMPO_RPC_URL}" >&2
	return 1
}

if ! command -v anvil >/dev/null 2>&1; then
	echo "anvil not found. Install Foundry, or run pnpm dev:localnet with VITE_TEMPO_RPC_URL pointed at an existing node." >&2
	exit 1
fi

if lsof -nP -iTCP:"${ANVIL_PORT}" -sTCP:LISTEN >/dev/null 2>&1; then
	echo "Using existing anvil-compatible RPC at ${VITE_TEMPO_RPC_URL}"
else
	anvil_args=(
		--host "${ANVIL_HOST}"
		--port "${ANVIL_PORT}"
		--chain-id "${ANVIL_CHAIN_ID}"
		--block-time "${ANVIL_BLOCK_TIME}"
	)

	if [ -n "${ANVIL_NETWORK}" ]; then
		anvil_args+=(--network "${ANVIL_NETWORK}")
	fi

	echo "Starting anvil at ${VITE_TEMPO_RPC_URL}"
	anvil "${anvil_args[@]}" "$@" &
	anvil_pid="$!"
fi

wait_for_anvil

echo "Starting explorer on port ${EXPLORER_PORT}"
pnpm exec vite dev --port "${EXPLORER_PORT}"
