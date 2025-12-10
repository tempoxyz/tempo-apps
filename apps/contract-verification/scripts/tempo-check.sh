#!/usr/bin/env bash

# call with

# `/bin/bash TEMPO_RPC_URL=https://testnet.tempo.xyz scripts/tempo-check.sh`

# this is directly from:
# https://github.com/tempoxyz/tempo-foundry/blob/master/.github/scripts/tempo-check.sh

set -euo pipefail

# OUTPUT_DIR="_artifacts"

echo -e "\n=== INIT TEMPO PROJECT ==="
tmp_dir=$(mktemp -d)
cd "$tmp_dir"
forge init -n tempo tempo-check
cd tempo-check

echo -e "\n=== FORGE TEST (LOCAL) ==="
forge test

echo -e "\n=== FORGE SCRIPT (LOCAL) ==="
forge script script/Mail.s.sol

echo -e "\n=== START TEMPO FORK TESTS ==="

echo -e "\n=== TEMPO VERSION ==="
cast client --rpc-url "$TEMPO_RPC_URL"

echo -e "\n=== FORGE TEST (FORK) ==="
forge test --rpc-url "$TEMPO_RPC_URL"

echo -e "\n=== FORGE SCRIPT (FORK) ==="
forge script script/Mail.s.sol --rpc-url "$TEMPO_RPC_URL"

echo -e "\n=== CREATE AND FUND ADDRESS ==="
read -r ADDR PK < <(cast wallet new --json | jq -r '.[0] | "\(.address) \(.private_key)"')

for i in {1..100}; do
  OUT=$(cast rpc tempo_fundAddress "$ADDR" --rpc-url "$TEMPO_RPC_URL" 2>&1 || true)

  if echo "$OUT" | jq -e 'arrays' >/dev/null 2>&1; then
    echo "$OUT" | jq
    break
  fi

  echo "[$i] $OUT"
  sleep 0.2
done

printf "\naddress: %s\nprivate_key: %s\n" "$ADDR" "$PK"

echo -e "\n=== WAIT FOR BLOCKS TO MINE ==="
sleep 5

# If `VERIFIER_URL` is set, add the `--verify` flag to forge commands.
VERIFY_ARGS=()
if [[ -n "${VERIFIER_URL:-}" ]]; then
  VERIFY_ARGS+=(--verify --retries 10 --delay 10)
fi

echo -e "\n=== FORGE SCRIPT DEPLOY ==="
forge script script/Mail.s.sol --private-key "$PK" --rpc-url "$TEMPO_RPC_URL" --broadcast "${VERIFY_ARGS[@]}"
