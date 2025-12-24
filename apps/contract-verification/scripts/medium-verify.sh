#!/usr/bin/env bash

set -euo pipefail

TEMPO_RPC_URL="https://rpc.testnet.tempo.xyz"
# NOTE: This is a throaway PK created for this test
PRIVATE_KEY=${PK:-"0xa4b3490c35582d544451fbbfd7a0e4c5fa4d0ded06563ccc199057c7a5e6c9de"}
VERIFIER_URL=${VERIFIER_URL:-"https://contracts.tempo.xyz"}

TEMP_DIR=$(mktemp -d)
echo "Creating temporary directory $TEMP_DIR"
cd "$TEMP_DIR"

gh repo clone grandizzy/oz-dummy-token "$TEMP_DIR"/oz-dummy-token
cd "$TEMP_DIR"/oz-dummy-token

echo -e "\n=== FORGE BUILD ==="

forge build
forge script script/DeployMyToken.s.sol \
  --rpc-url $TEMPO_RPC_URL \
  --private-key "$PRIVATE_KEY" \
  --broadcast \
  --verify \
  --verifier sourcify \
  --verifier-url "$VERIFIER_URL"
