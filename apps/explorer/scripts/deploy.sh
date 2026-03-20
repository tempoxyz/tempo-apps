#!/usr/bin/env bash

set -euo pipefail

env_name=""
args=()

while (($#)); do
	case "$1" in
		--env)
			if (($# < 2)); then
				echo "--env requires a value" >&2
				exit 1
			fi
			env_name="$2"
			args+=("$1" "$2")
			shift 2
			;;
		--env=*)
			env_name="${1#--env=}"
			args+=("$1")
			shift
			;;
		*)
			args+=("$1")
			shift
			;;
	esac
done

if [[ -z "$env_name" ]]; then
	echo "Deploy requires --env {devnet|testnet|mainnet}" >&2
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

exec wrangler deploy "${args[@]}"
