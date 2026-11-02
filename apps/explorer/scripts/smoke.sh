#!/usr/bin/env bash

# Smoke test a built explorer: serve dist/ in the Workers runtime and require
# 200 from server-rendered pages. Catches SSR breakage (such as dependency
# mismatches) that type checks and unit tests miss. Run after scripts/build.sh.
# Only pages that render without live RPC or API data are checked, so a slow
# or rate-limited backend can't fail the build.

set -euo pipefail

port="${PORT:-8788}"
paths=("/")
log="$(mktemp)"

# Own process group (job control), so the trap also stops workerd children.
# set -m works in plain bash on Linux and macOS, unlike setsid.
set -m
./node_modules/.bin/wrangler dev \
	--config dist/server/wrangler.json \
	--env-file .env.example \
	--port "$port" \
	--show-interactive-dev-session=false >"$log" 2>&1 &
pid=$!
set +m
trap 'kill -- -"$pid" 2>/dev/null || true' EXIT

ready=0
for _ in $(seq 1 60); do
	if curl --silent --max-time 5 --output /dev/null "http://localhost:$port/api/health"; then
		ready=1
		break
	fi
	if ! kill -0 "$pid" 2>/dev/null; then
		cat "$log"
		echo "wrangler dev exited before serving" >&2
		exit 1
	fi
	sleep 1
done

if [[ "$ready" != "1" ]]; then
	tail -n 100 "$log"
	echo "wrangler dev did not become ready" >&2
	exit 1
fi

failed=0
for path in "${paths[@]}"; do
	status="$(curl --silent --output /dev/null --write-out '%{http_code}' \
		--max-time 60 "http://localhost:$port$path" || true)"
	echo "$path $status"
	if [[ "$status" != "200" ]]; then
		failed=1
	fi
done

if [[ "$failed" != "0" ]]; then
	tail -n 100 "$log"
	echo "Explorer SSR smoke test failed" >&2
	exit 1
fi
