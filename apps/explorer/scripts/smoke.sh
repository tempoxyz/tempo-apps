#!/usr/bin/env bash

# Smoke test a built explorer: serve dist/ in the Workers runtime and require
# 200 from server-rendered pages. Catches SSR breakage (such as dependency
# mismatches) that type checks and unit tests miss. Run after scripts/build.sh.

set -euo pipefail

port="${PORT:-8788}"
paths=("/" "/blocks" "/block/1000000")
log="$(mktemp)"

./node_modules/.bin/wrangler dev \
	--config dist/server/wrangler.json \
	--env-file .env.example \
	--port "$port" \
	--show-interactive-dev-session=false >"$log" 2>&1 &
pid=$!
trap 'kill "$pid" 2>/dev/null || true' EXIT

for _ in $(seq 1 60); do
	if curl --silent --output /dev/null "http://localhost:$port/api/health"; then
		break
	fi
	if ! kill -0 "$pid" 2>/dev/null; then
		cat "$log"
		echo "wrangler dev exited before serving" >&2
		exit 1
	fi
	sleep 1
done

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
