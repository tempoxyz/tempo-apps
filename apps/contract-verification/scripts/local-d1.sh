#!/usr/bin/env bash

set -eou pipefail

# Scans `.wrangler/state/v3/d1/miniflare-D1DatabaseObject`
# for the latest sqlite file and returns its full path
d1_dir=".wrangler/state/v3/d1/miniflare-D1DatabaseObject"

if [[ ! -d "$d1_dir" ]]; then
	echo "Error: D1 directory not found. Run 'bun run dev' first to create local D1." >&2
	exit 1
fi

# Find latest sqlite file (cross-platform: uses ls -t instead of GNU find -printf)
latest_sqlite_file=$(find "$d1_dir" -type f -name '*.sqlite' -exec ls -t {} + 2>/dev/null | head -1)

if [[ -z "$latest_sqlite_file" ]]; then
	echo "Error: No .sqlite files found in $d1_dir" >&2
	exit 1
fi

echo "$latest_sqlite_file"