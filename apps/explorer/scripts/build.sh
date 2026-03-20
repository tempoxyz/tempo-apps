#!/usr/bin/env bash

# This file exists because wrangler.json#build does not apply when using Vite

set -euo pipefail

env_name="${CLOUDFLARE_ENV:-${VITE_TEMPO_ENV:-${npm_config_env:-}}}"

if [[ -z "$env_name" ]]; then
	echo "Build requires CLOUDFLARE_ENV, VITE_TEMPO_ENV, or npm_config_env to be set" >&2
	exit 1
fi

case "$env_name" in
	devnet|testnet|mainnet) ;;
	*)
		echo "Unsupported env: $env_name" >&2
		exit 1
		;;
esac

export CLOUDFLARE_ENV="$env_name"
export VITE_TEMPO_ENV="$env_name"
export NODE_ENV="production"

pnpm vite build --mode="$env_name"
