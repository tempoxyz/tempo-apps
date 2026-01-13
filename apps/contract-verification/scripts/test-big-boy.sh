#!/usr/bin/env bash

set -euo pipefail

TEMPO_RPC_URL=${TEMPO_RPC_URL:-"https://rpc.mainnet.tempo.xyz"}
echo "${TEMPO_RPC_URL}"
VERIFIER_URL=${VERIFIER_URL:-"https://contracts.porto.workers.dev"}

echo -e "\n=== VERSIONS ==="
CAST_VERSION=$(cast --version)
FORGE_VERSION=$(forge --version)
echo -e "\nCAST_VERSION: $CAST_VERSION"
echo -e "FORGE_VERSION: $FORGE_VERSION"

echo -e "\n=== INIT TEMPO PROJECT ==="
tmp_dir=$(mktemp -d)
echo -e "\nCreating temporary directory $tmp_dir\n"
cd "$tmp_dir"
forge init -n tempo tempo-check
cd tempo-check

echo -e "\n=== FORGE SCRIPT (LOCAL) ==="
forge script script/Mail.s.sol --sig "run(string)" "$(date +%s%N)"

echo -e "\n=== START TEMPO FORK TESTS ==="

echo -e "\n=== TEMPO VERSION ==="
cast client --rpc-url "$TEMPO_RPC_URL"

echo -e "\n=== FORGE TEST (FORK) ==="
forge test --rpc-url "$TEMPO_RPC_URL"

echo -e "\n=== FORGE SCRIPT (FORK) ==="
forge script script/Mail.s.sol --rpc-url "$TEMPO_RPC_URL" --sig "run(string)" "$(date +%s%N)"

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

VERIFY_ARGS=(--verify --verifier sourcify --verifier-url "$VERIFIER_URL")

echo -e "\n=== FORGE SCRIPT DEPLOY ==="
forge script script/Mail.s.sol --private-key "$TEST_PRIVATE_KEY" --rpc-url "$TEMPO_RPC_URL" --broadcast ${VERIFY_ARGS[@]+"${VERIFY_ARGS[@]}"} --sig "run(string)" "$(date +%s%N)"

echo -e "\n=== FORGE SCRIPT DEPLOY WITH FEE TOKEN ==="
forge script --fee-token 2 script/Mail.s.sol --private-key "$TEST_PRIVATE_KEY" --rpc-url "$TEMPO_RPC_URL" --broadcast ${VERIFY_ARGS[@]+"${VERIFY_ARGS[@]}"} --sig "run(string)" "$(date +%s%N)"
forge script --fee-token 3 script/Mail.s.sol --private-key "$TEST_PRIVATE_KEY" --rpc-url "$TEMPO_RPC_URL" --broadcast ${VERIFY_ARGS[@]+"${VERIFY_ARGS[@]}"} --sig "run(string)" "$(date +%s%N)"

echo -e "\n=== FORGE CREATE DEPLOY ==="
forge create src/Mail.sol:Mail --private-key "$TEST_PRIVATE_KEY" --rpc-url "$TEMPO_RPC_URL" --broadcast ${VERIFY_ARGS[@]+"${VERIFY_ARGS[@]}"} --constructor-args 0x20c0000000000000000000000000000000000000

echo -e "\n=== FORGE CREATE DEPLOY WITH FEE TOKEN ==="
forge create --fee-token 2 src/Mail.sol:Mail --private-key "$TEST_PRIVATE_KEY" --rpc-url "$TEMPO_RPC_URL" --broadcast ${VERIFY_ARGS[@]+"${VERIFY_ARGS[@]}"} --constructor-args 0x20c0000000000000000000000000000000000000
forge create --fee-token 3 src/Mail.sol:Mail --private-key "$TEST_PRIVATE_KEY" --rpc-url "$TEMPO_RPC_URL" --broadcast ${VERIFY_ARGS[@]+"${VERIFY_ARGS[@]}"} --constructor-args 0x20c0000000000000000000000000000000000000
