#!/usr/bin/env bash

set -euo pipefail

TEMPO_RPC_URL="https://rpc.testnet.tempo.xyz"
PRIVATE_KEY=${PK:-"0xa4b3490c35582d544451fbbfd7a0e4c5fa4d0ded06563ccc199057c7a5e6c9de"}
VERIFIER_URL=${VERIFIER_URL:-"https://o.tail388b2e.ts.net"}

TEMP_DIR=$(mktemp -d)
echo "Creating temporary directory $TEMP_DIR"
cd "$TEMP_DIR"

CONTRACT_NAME="counter-verify_$(shuf -i 1000000-9999999 -n 1)"
echo "Creating contract $TEMP_DIR/$CONTRACT_NAME"


echo -e "A new tempo directory and the following command will run:\\n"
echo -e "forge create src/Counter.sol:Counter \\
  --private-key=\"$PRIVATE_KEY\" \\
  --rpc-url $TEMPO_RPC_URL \\
  --broadcast \\
  --verify \\
  --verifier sourcify \\
  --verifier-url $VERIFIER_URL"
echo -e "\\n"


forge init "$CONTRACT_NAME" && \
  cd "$CONTRACT_NAME" && \
  forge create src/Counter.sol:Counter \
  --private-key="$PRIVATE_KEY" \
  --rpc-url $TEMPO_RPC_URL \
  --broadcast \
  --verify \
  --verifier sourcify \
  --verifier-url "$VERIFIER_URL"
