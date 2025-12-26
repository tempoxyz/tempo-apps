#!/usr/bin/env bash

set -euo pipefail

TEMPO_RPC_URL="https://rpc.testnet.tempo.xyz"
VERIFIER_URL=${VERIFIER_URL:-"https://contracts.porto.workers.dev"}

echo -e "\n=== VERSIONS ==="
CAST_VERSION=$(cast --version)
FORGE_VERSION=$(forge --version)
echo -e "\nCAST_VERSION: $CAST_VERSION"
echo -e "FORGE_VERSION: $FORGE_VERSION"

TEMP_DIR=$(mktemp -d)
echo -e "\nCreating temporary directory $TEMP_DIR\n"
cd "$TEMP_DIR"

CONTRACT_NAME="counter-verify_$(shuf -i 1000000-9999999 -n 1)"
echo "Creating contract $TEMP_DIR/$CONTRACT_NAME"

forge init "$CONTRACT_NAME"
cd "$CONTRACT_NAME"

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

echo -e "\n=== FORGE CREATE DEPLOY ==="

echo -e "\nDEPLOYER: $TEST_ADDRESS\n"

forge create src/Counter.sol:Counter \
  --private-key "$TEST_PRIVATE_KEY" \
  --rpc-url $TEMPO_RPC_URL \
  --broadcast \
  --verify \
  --verifier sourcify \
  --verifier-url "$VERIFIER_URL"
