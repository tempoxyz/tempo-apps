#!/usr/bin/env bash

# This file exists because wrangler.jsonc#build does not apply when using Vite

set -eou pipefail

if [ -z "$CLOUDFLARE_ENV" ]; then
	echo "CLOUDFLARE_ENV is not set"
	exit 1
fi

export NODE_ENV="production"
pnpm vite build --mode="$CLOUDFLARE_ENV"
