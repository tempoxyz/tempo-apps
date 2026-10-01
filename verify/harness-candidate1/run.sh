#!/usr/bin/env bash
set -eu
# run.sh /absolute/candidate/worktree /absolute/output/dir
export CANDIDATE_DIR="$(cd "$1" && pwd -P)"
output="$2"
mkdir -p "$output"
output="$(cd "$output" && pwd -P)"
source_dir="$(cd "$(dirname "$0")" && pwd -P)"
export HARNESS_DIR="$(mktemp -d /tmp/time-format-react.XXXXXX)"
export HARNESS_PORT="${HARNESS_PORT:-3022}"
export STATIC_PORT="${STATIC_PORT:-3023}"
export CANDIDATE_SHA="$(git -C "$CANDIDATE_DIR" rev-parse HEAD)"
cp "$source_dir"/*.mjs "$source_dir"/*.tsx "$HARNESS_DIR/"
ln -s "$CANDIDATE_DIR/apps/explorer/node_modules" "$HARNESS_DIR/node_modules"
printf '%s\n' "$CANDIDATE_SHA" "$CANDIDATE_DIR" "$HARNESS_DIR" > "$output/environment.txt"
cd "$CANDIDATE_DIR"
TZ=UTC pnpm node "$HARNESS_DIR/server.mjs" > "$output/server.log" 2>&1 &
server_pid=$!
static_pid=''
trap 'kill "$server_pid" ${static_pid:+"$static_pid"} 2>/dev/null || true' EXIT
for attempt in {1..50}; do
  if curl -fsS "http://127.0.0.1:$HARNESS_PORT/" > /dev/null; then break; fi
  sleep 0.2
done
pnpm node "$HARNESS_DIR/browser.mjs" > "$output/react-browser.json" 2>&1
pnpm node "$HARNESS_DIR/build.mjs" > "$output/harness-build.log" 2>&1
python3 -m http.server "$STATIC_PORT" --bind 127.0.0.1 --directory "$HARNESS_DIR/dist" > "$output/static-server.log" 2>&1 &
static_pid=$!
for attempt in {1..50}; do
  if curl -fsS "http://127.0.0.1:$STATIC_PORT/" > /dev/null; then break; fi
  sleep 0.2
done
pnpm node "$HARNESS_DIR/bfcache.mjs" > "$output/bfcache.log" 2>&1
