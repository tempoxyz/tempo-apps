#!/usr/bin/env bash

set -euo pipefail

MODE=${MODE:-"invalid-payload"}
TEMPO_RPC_URL=${TEMPO_RPC_URL:-"https://rpc.moderato.tempo.xyz"}
VERIFIER_URL=${VERIFIER_URL:-"https://contracts.tempo.xyz"}
FEE_TOKEN="${TEMPO_FEE_TOKEN:-0x20c0000000000000000000000000000000000001}"

if [[ "$MODE" == "invalid-payload" ]]; then
  RESPONSE_HEADERS=$(mktemp)
  RESPONSE_BODY=$(mktemp)
  REQUEST_BODY='{}'

  echo -e "\n=== REPRO /verify/vyper VALIDATION REGRESSION ==="
  echo "VERIFIER_URL: $VERIFIER_URL"
  echo "REQUEST_BODY: $REQUEST_BODY"

  HTTP_STATUS=$(
    curl -sS \
      -D "$RESPONSE_HEADERS" \
      -o "$RESPONSE_BODY" \
      -w '%{http_code}' \
      -X POST \
      "$VERIFIER_URL/verify/vyper" \
      -H 'Content-Type: application/json' \
      --data "$REQUEST_BODY"
  )

  echo -e "\nHTTP_STATUS: $HTTP_STATUS"
  echo -e "\n=== RESPONSE HEADERS ==="
  cat "$RESPONSE_HEADERS"
  echo -e "\n=== RESPONSE BODY ==="
  cat "$RESPONSE_BODY"
  echo

  if [[ -n "${EXPECTED_STATUS:-}" && "$HTTP_STATUS" != "$EXPECTED_STATUS" ]]; then
    echo "Expected status $EXPECTED_STATUS but got $HTTP_STATUS" >&2
    exit 1
  fi

  exit 0
fi

echo -e "\n=== VERSIONS ==="
CAST_VERSION=$(cast --version)
FORGE_VERSION=$(forge --version)
echo -e "\nCAST_VERSION: $CAST_VERSION"
echo -e "FORGE_VERSION: $FORGE_VERSION"
echo -e "\n=== USING FEE TOKEN: $FEE_TOKEN ==="

TEMP_DIR=$(mktemp -d)
echo -e "\nCreating temporary directory $TEMP_DIR\n"
cd "$TEMP_DIR"

git clone --depth 1 https://github.com/grandizzy/counter-vy.git "$TEMP_DIR"/counter-vy
cd "$TEMP_DIR"/counter-vy

echo -e "\n=== CREATE & FUND NEW WALLET ===\n"

NEW_WALLET=$(cast wallet new --json | jq --raw-output '.[0]')
TEST_ADDRESS=$(echo "$NEW_WALLET" | jq --raw-output '.address')
TEST_PRIVATE_KEY=$(echo "$NEW_WALLET" | jq --raw-output '.private_key')

echo -e "ADDRESS: $TEST_ADDRESS\n"

for _ in {1..10}; do
  cast rpc tempo_fundAddress "$TEST_ADDRESS" --rpc-url "$TEMPO_RPC_URL" > /dev/null 2>&1 || true
done

WALLET_BALANCE=$(cast balance "$TEST_ADDRESS" --rpc-url "$TEMPO_RPC_URL")
echo "WALLET BALANCE: $WALLET_BALANCE"

echo -e "\n=== FORGE BUILD ===\n"

forge build

echo -e "\n=== FORGE SCRIPT DEPLOY ==="

echo -e "\nDEPLOYER: $TEST_ADDRESS\n"

forge script script/Counter.s.sol \
  --tempo.fee-token="$FEE_TOKEN" \
  --rpc-url "$TEMPO_RPC_URL" \
  --private-key "$TEST_PRIVATE_KEY" \
  --broadcast \
  --verify \
  --verifier sourcify \
  --verifier-url "$VERIFIER_URL"
