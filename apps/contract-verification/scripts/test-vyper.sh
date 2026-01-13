#!/usr/bin/env bash

set -euo pipefail

TEMPO_RPC_URL=${TEMPO_RPC_URL:-"https://rpc.presto.tempo.xyz"}
VERIFIER_URL=${VERIFIER_URL:-"https://contracts.tempo.xyz"}

echo -e "\n=== VERSIONS ==="
CAST_VERSION=$(cast --version)
FORGE_VERSION=$(forge --version)
echo -e "\nCAST_VERSION: $CAST_VERSION"
echo -e "FORGE_VERSION: $FORGE_VERSION"

TEMP_DIR=$(mktemp -d)
echo -e "\nCreating temporary directory $TEMP_DIR\n"
cd "$TEMP_DIR"

gh repo clone grandizzy/counter-vy "$TEMP_DIR"/counter-vy -- --depth 1
cd "$TEMP_DIR"/counter-vy

echo -e "\n=== CREATE & FUND NEW WALLET ===\n"

NEW_WALLET=$(cast wallet new --json | jq --raw-output '.[0]')
TEST_ADDRESS=$(echo "$NEW_WALLET" | jq --raw-output '.address')
TEST_PRIVATE_KEY=$(echo "$NEW_WALLET" | jq --raw-output '.private_key')

echo -e "ADDRESS: $TEST_ADDRESS\n"

for _ in {1..10}; do
  cast rpc tempo_fundAddress "$TEST_ADDRESS" --rpc-url "$TEMPO_RPC_URL" > /dev/null 2>&1
done

WALLET_BALANCE=$(cast balance "$TEST_ADDRESS" --rpc-url "$TEMPO_RPC_URL")
echo "WALLET BALANCE: $WALLET_BALANCE"

echo -e "\n=== FORGE BUILD ===\n"

forge build

echo -e "\n=== FORGE SCRIPT DEPLOY ==="

echo -e "\nDEPLOYER: $TEST_ADDRESS\n"

forge script script/Counter.s.sol \
  --rpc-url "$TEMPO_RPC_URL" \
  --private-key "$TEST_PRIVATE_KEY" \
  --broadcast \
  --verify \
  --verifier sourcify \
  --verifier-url "$VERIFIER_URL"
