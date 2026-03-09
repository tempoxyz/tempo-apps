#!/usr/bin/env bash

set -euo pipefail

# set -l rpc (test -n "$ETH_RPC_URL" && echo $ETH_RPC_URL || echo "https://rpc.moderato.tempo.xyz") && \
#   set -l verifier (test -n "$VERIFIER_URL" && echo $VERIFIER_URL || echo "https://contracts.tempo.xyz") && \
#   set -l ts (date +%s) && set -l logdir /tmp/contract-verify/$ts && mkdir -p $logdir && \
#   set -l dir /tmp/ctrct-01 && rm -rf $dir && mkdir -p $dir && \
#   cd $dir && forge init 2>&1 | tee $logdir/init.log && \
#   cast wallet new --json | tee $logdir/wallet.json | read -z wallet && \
#   set -l addr (echo $wallet | jq -r '.[0].address') && \
#   set -l pk (echo $wallet | jq -r '.[0].private_key') && \
#   cast rpc tempo_fundAddress $addr --rpc-url $rpc | tee $logdir/fund.json && \
#   forge script script/Counter.s.sol:CounterScript \
#     --tempo.fee-token='0x20c0000000000000000000000000000000000001' \
#     --broadcast --private-key $pk --verify \
#     --verifier-url $verifier \
#     --verifier sourcify \
#     --rpc-url $rpc 2>&1 | tee $logdir/deploy.log

VERIFIER_URL=${VERIFIER_URL:-"https://contracts.tempo.xyz"}
ETH_RPC_URL=${ETH_RPC_URL:-"$TEMPO_RPC_URL"}
TEMPO_RPC_URL=${TEMPO_RPC_URL:-"https://rpc.moderato.tempo.xyz"}
FEE_TOKEN=${FEE_TOKEN:-"0x20c0000000000000000000000000000000000001"}

echo "TEMPO_RPC_URL: $TEMPO_RPC_URL"
echo "ETH_RPC_URL: $ETH_RPC_URL"
echo "VERIFIER_URL: $VERIFIER_URL"

TIMESTAMP=$(date +%s)
TEMP_DIR=".logs/$TIMESTAMP"

mkdir -p "$TEMP_DIR"
cd "$TEMP_DIR"

forge init --quiet

cast wallet new --json | tee "wallet.json"

WALLET_ADDRESS=$(cat "wallet.json" | jq --raw-output '.[0].address')
WALLET_PRIVATE_KEY=$(cat "wallet.json" | jq --raw-output '.[0].private_key')

echo "WALLET_ADDRESS: $WALLET_ADDRESS"

for _ in {1..5}; do
  cast rpc tempo_fundAddress "$WALLET_ADDRESS" --rpc-url "$TEMPO_RPC_URL" > /dev/null 2>&1 || true
done;

forge script script/Counter.s.sol:CounterScript \
  --tempo.fee-token="$FEE_TOKEN" \
  --broadcast --private-key "$WALLET_PRIVATE_KEY" --verify \
  --verifier-url "$VERIFIER_URL" \
  --verifier sourcify \
  --rpc-url "$TEMPO_RPC_URL" | tee "deploy.log"
