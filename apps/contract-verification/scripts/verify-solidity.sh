#!/usr/bin/env bash

set -euo pipefail

VERIFIER_URL=${VERIFIER_URL:-"https://contracts.tempo.xyz"}
TEMPO_RPC_URL=${TEMPO_RPC_URL:-"https://rpc.moderato.tempo.xyz"}
FEE_TOKEN=${FEE_TOKEN:-"0x20c0000000000000000000000000000000000001"}

echo "TEMPO_RPC_URL: $TEMPO_RPC_URL"
echo "VERIFIER_URL: $VERIFIER_URL"
echo "TEMPO_FEE_TOKEN: $FEE_TOKEN"

TIMESTAMP=$(date +%s)
TEMP_DIR=".logs/$TIMESTAMP"

mkdir -p "$TEMP_DIR"
cd "$TEMP_DIR"

forge init --quiet

if [ -n "${PRIVATE_KEY:-}" ]; then
  WALLET_PRIVATE_KEY="$PRIVATE_KEY"
  WALLET_ADDRESS=$(cast wallet address "$WALLET_PRIVATE_KEY")
else
  cast wallet new --json | tee "wallet.json"
  WALLET_ADDRESS=$(cat "wallet.json" | jq --raw-output '.[0].address')
  WALLET_PRIVATE_KEY=$(cat "wallet.json" | jq --raw-output '.[0].private_key')

  for _ in {1..5}; do
    cast rpc tempo_fundAddress "$WALLET_ADDRESS" --rpc-url "$TEMPO_RPC_URL" > /dev/null 2>&1 || true
  done;
fi

echo "WALLET_ADDRESS: $WALLET_ADDRESS"

forge script script/Counter.s.sol:CounterScript \
  --tempo.fee-token="$FEE_TOKEN" \
  --broadcast --private-key "$WALLET_PRIVATE_KEY" --verify \
  --verifier-url "$VERIFIER_URL" \
  --verifier sourcify \
  --rpc-url "$TEMPO_RPC_URL" | tee "deploy.log"
