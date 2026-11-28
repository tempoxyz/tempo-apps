#!/usr/bin/env bash

# This file exists because wrangler.json#build does not apply when using Vite

set -euo pipefail

env_name="${CLOUDFLARE_ENV:-${VITE_TEMPO_ENV:-${npm_config_env:-}}}"

if [[ -z "$env_name" ]]; then
	echo "Build requires CLOUDFLARE_ENV, VITE_TEMPO_ENV, or npm_config_env to be set" >&2
	exit 1
fi

case "$env_name" in
	devnet|nextfork|zone-prover|testnet|mainnet) ;;
	*)
		echo "Unsupported env: $env_name" >&2
		exit 1
		;;
esac

export CLOUDFLARE_ENV="$env_name"
export VITE_TEMPO_ENV="$env_name"
export NODE_ENV="production"

pnpm vite build --mode="$env_name"

# The Cloudflare Deploy Broker's trusted build deploys every file in dist/client
# and refuses an .assetsignore. The Cloudflare Vite plugin writes one so that
# Wrangler skips wrangler.json and .dev.vars, which this build never puts in
# dist/client, so removing it changes nothing that is served. Fail instead if
# one of the files it lists is ever there.
client=dist/client
if [[ -f "$client/.assetsignore" ]]; then
	while IFS= read -r ignored || [[ -n "$ignored" ]]; do
		[[ -z "$ignored" || "$ignored" == \#* ]] && continue
		if [[ -e "$client/$ignored" ]]; then
			echo "$client/$ignored is listed in .assetsignore and would be deployed" >&2
			exit 1
		fi
	done <"$client/.assetsignore"
	rm "$client/.assetsignore"
fi

# The fonts' README.md files are notes for this repository, not assets. The
# trusted build has no media type for Markdown, so it would serve them without
# a Content-Type. Leave them out of what is deployed.
rm -f "$client"/fonts/*/README.md
