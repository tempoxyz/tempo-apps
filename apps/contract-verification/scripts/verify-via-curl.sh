#!/usr/bin/env bash

set -euo pipefail

TEMPO_RPC_URL=${TEMPO_RPC_URL:-"https://rpc.testnet.tempo.xyz"}
VERIFIER_URL=${VERIFIER_URL:-"https://contracts.tempo.xyz"}
CHAIN_ID="${CHAIN_ID:-42431}"
FEE_TOKEN="${TEMPO_FEE_TOKEN:-0x20c0000000000000000000000000000000000001}"

echo -e "\n=== VERSIONS ==="
CAST_VERSION=$(cast --version)
FORGE_VERSION=$(forge --version)
echo -e "\nCAST_VERSION: $CAST_VERSION"
echo -e "FORGE_VERSION: $FORGE_VERSION"
echo -e "\n=== USING FEE TOKEN: $FEE_TOKEN ==="

TEMP_DIR=$(mktemp -d)
echo -e "\nCreating temporary directory $TEMP_DIR\n"
cd "$TEMP_DIR"

forge init --quiet

echo -e "=== CREATE & FUND NEW WALLET ===\n"

NEW_WALLET=$(cast wallet new --json | jq --raw-output '.[0]')
TEST_ADDRESS=$(echo "$NEW_WALLET" | jq --raw-output '.address')
TEST_PRIVATE_KEY=$(echo "$NEW_WALLET" | jq --raw-output '.private_key')

echo -e "ADDRESS: $TEST_ADDRESS\n"

for _ in {1..10}; do
  cast rpc tempo_fundAddress "$TEST_ADDRESS" --rpc-url "$TEMPO_RPC_URL" > /dev/null 2>&1 || true
done

WALLET_BALANCE=$(cast balance "$TEST_ADDRESS" --rpc-url "$TEMPO_RPC_URL")
echo "WALLET BALANCE: $WALLET_BALANCE"

echo -e "\n=== FORGE SCRIPT DEPLOY ===\n"

forge script script/Counter.s.sol \
  --tempo.fee-token="$FEE_TOKEN" \
  --broadcast \
  --private-key "$TEST_PRIVATE_KEY" \
  --rpc-url "$TEMPO_RPC_URL"

CONTRACT_ADDRESS=$(jq --raw-output '.transactions[0].contractAddress' broadcast/Counter.s.sol/"$CHAIN_ID"/run-latest.json)
TX_HASH=$(jq --raw-output '.transactions[0].hash' broadcast/Counter.s.sol/"$CHAIN_ID"/run-latest.json)

echo -e "\nCONTRACT: $CONTRACT_ADDRESS"
echo "TX HASH:  $TX_HASH"

# Read the source from forge init's Counter.sol (escape for JSON)
COUNTER_SOURCE=$(jq --raw-input --slurp '.' src/Counter.sol)

echo -e "\n=== VERIFY VIA CURL POST ===\n"

echo "Verifying contract $CONTRACT_ADDRESS"
echo "on chain $CHAIN_ID"
echo "verify API is running on ${VERIFIER_URL}"
echo

VERIFY_RESPONSE=$(curl --silent \
  --request POST \
  --url "${VERIFIER_URL}/v2/verify/${CHAIN_ID}/${CONTRACT_ADDRESS}" \
  --header 'Content-Type: application/json' \
  --data @- <<EOF
{
  "stdJsonInput": {
    "language": "Solidity",
    "sources": {
      "src/Counter.sol": {
        "content": ${COUNTER_SOURCE}
      }
    },
    "settings": {
      "optimizer": { "enabled": false, "runs": 200 },
      "outputSelection": { "*": { "*": ["abi", "evm.bytecode", "evm.deployedBytecode"] } },
      "evmVersion": "cancun"
    }
  },
  "compilerVersion": "0.8.30",
  "contractIdentifier": "src/Counter.sol:Counter",
  "creationTransactionHash": "${TX_HASH}"
}
EOF
)

echo "$VERIFY_RESPONSE" | jq .

VERIFICATION_ID=$(echo "$VERIFY_RESPONSE" | jq --raw-output '.verificationId')
echo -e "\nVERIFICATION ID: $VERIFICATION_ID"

echo -e "\n=== POLL FOR VERIFICATION RESULT ===\n"

MAX_ATTEMPTS=20
POLL_INTERVAL=3

for attempt in $(seq 1 $MAX_ATTEMPTS); do
  STATUS_RESPONSE=$(curl --silent \
    --url "${VERIFIER_URL}/v2/verify/${VERIFICATION_ID}")

  IS_COMPLETED=$(echo "$STATUS_RESPONSE" | jq --raw-output '.isJobCompleted')

  if [[ "$IS_COMPLETED" == "true" ]]; then
    echo "$STATUS_RESPONSE" | jq .

    ERROR=$(echo "$STATUS_RESPONSE" | jq --raw-output '.error // empty')
    if [[ -n "$ERROR" ]]; then
      echo -e "\n❌ VERIFICATION FAILED"
      exit 1
    fi

    MATCH=$(echo "$STATUS_RESPONSE" | jq --raw-output '.contract.match')
    echo -e "\n✅ VERIFICATION COMPLETE — match: $MATCH"
    break
  fi

  echo "Attempt $attempt/$MAX_ATTEMPTS — still pending, waiting ${POLL_INTERVAL}s..."
  sleep "$POLL_INTERVAL"
done

if [[ "$IS_COMPLETED" != "true" ]]; then
  echo -e "\n❌ VERIFICATION TIMED OUT after $((MAX_ATTEMPTS * POLL_INTERVAL))s"
  exit 1
fi

echo -e "\n=== LOOKUP VERIFIED CONTRACT ===\n"

curl --silent \
  "${VERIFIER_URL}/v2/contract/${CHAIN_ID}/${CONTRACT_ADDRESS}?fields=all" \
  | jq '{ match, creationMatch, runtimeMatch, name, chainId, address, compiler, compilerVersion, language, deployment, abi }'
