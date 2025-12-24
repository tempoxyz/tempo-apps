#!/usr/bin/env bash

set -euo pipefail

echo -e "\n=== INIT TEMPO PROJECT ==="
tmp_dir=$(mktemp -d)
cd "$tmp_dir"
forge init -n tempo tempo-check
cd tempo-check

TEMPO_RPC_URL=https://rpc.testnet.tempo.xyz

echo -e "\n=== FORGE TEST (LOCAL) ==="
forge test

echo -e "\n=== FORGE SCRIPT (LOCAL) ==="
forge script script/Mail.s.sol

echo -e "\n=== START TEMPO FORK TESTS ==="

echo -e "\n=== TEMPO VERSION ==="
cast client --rpc-url $TEMPO_RPC_URL

echo -e "\n=== FORGE TEST (FORK) ==="
forge test --rpc-url $TEMPO_RPC_URL

echo -e "\n=== FORGE SCRIPT (FORK) ==="
rm script/Mail.s.sol
cp ~/dev/tempo/tempo-app/apps/contract-verification/scripts/Mail.s.sol script/Mail.s.sol
forge script script/Mail.s.sol --rpc-url $TEMPO_RPC_URL

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
VERIFIER_URL="${VERIFIER_URL:-http://localhost:22222}"

# If `VERIFIER_URL` is set, add the `--verify` flag to forge commands.
VERIFY_ARGS=()
if [[ -n "${VERIFIER_URL:-}" ]]; then
  VERIFY_ARGS+=(--verify --retries 10 --delay 10 --verifier sourcify --verifier-url "$VERIFIER_URL")
fi

echo -e "\n=== FORGE SCRIPT DEPLOY ==="
forge script script/Mail.s.sol --private-key "$PK" --rpc-url $TEMPO_RPC_URL --broadcast ${VERIFY_ARGS[@]+"${VERIFY_ARGS[@]}"}

echo -e "\n=== FORGE SCRIPT DEPLOY WITH FEE TOKEN ==="
forge script --fee-token 2 script/Mail.s.sol --private-key "$PK" --rpc-url $TEMPO_RPC_URL --broadcast ${VERIFY_ARGS[@]+"${VERIFY_ARGS[@]}"}
forge script --fee-token 3 script/Mail.s.sol --private-key "$PK" --rpc-url $TEMPO_RPC_URL --broadcast ${VERIFY_ARGS[@]+"${VERIFY_ARGS[@]}"}

echo -e "\n=== FORGE CREATE DEPLOY ==="
forge create src/Mail.sol:Mail --private-key "$PK" --rpc-url $TEMPO_RPC_URL --broadcast ${VERIFY_ARGS[@]+"${VERIFY_ARGS[@]}"} --constructor-args 0x20c0000000000000000000000000000000000000

echo -e "\n=== FORGE CREATE DEPLOY WITH FEE TOKEN ==="
forge create --fee-token 2 src/Mail.sol:Mail --private-key "$PK" --rpc-url $TEMPO_RPC_URL --broadcast ${VERIFY_ARGS[@]+"${VERIFY_ARGS[@]}"} --constructor-args 0x20c0000000000000000000000000000000000000
forge create --fee-token 3 src/Mail.sol:Mail --private-key "$PK" --rpc-url $TEMPO_RPC_URL --broadcast ${VERIFY_ARGS[@]+"${VERIFY_ARGS[@]}"} --constructor-args 0x20c0000000000000000000000000000000000000

echo -e "\n=== CAST ERC20 TRANSFER WITH FEE TOKEN ==="
cast erc20 transfer --fee-token 2 0x20c0000000000000000000000000000000000002 0x4ef5DFf69C1514f4Dbf85aA4F9D95F804F64275F 123456 --rpc-url $TEMPO_RPC_URL --private-key "$PK"
cast erc20 transfer --fee-token 3 0x20c0000000000000000000000000000000000002 0x4ef5DFf69C1514f4Dbf85aA4F9D95F804F64275F 123456 --rpc-url $TEMPO_RPC_URL --private-key "$PK"

echo -e "\n=== CAST ERC20 APPROVE WITH FEE TOKEN ==="
cast erc20 approve --fee-token 2 0x20c0000000000000000000000000000000000002 0x4ef5DFf69C1514f4Dbf85aA4F9D95F804F64275F 123456 --rpc-url $TEMPO_RPC_URL --private-key "$PK"
cast erc20 approve --fee-token 3 0x20c0000000000000000000000000000000000002 0x4ef5DFf69C1514f4Dbf85aA4F9D95F804F64275F 123456 --rpc-url $TEMPO_RPC_URL --private-key "$PK"

echo -e "\n=== CAST SEND WITH FEE TOKEN ==="
cast send --fee-token 2 --rpc-url $TEMPO_RPC_URL 0x86A2EE8FAf9A840F7a2c64CA3d51209F9A02081D 'increment()' --private-key "$PK"
cast send --fee-token 3 --rpc-url $TEMPO_RPC_URL 0x86A2EE8FAf9A840F7a2c64CA3d51209F9A02081D 'increment()' --private-key "$PK"

echo -e "\n=== CAST MKTX WITH FEE TOKEN ==="
cast mktx --fee-token 2 --rpc-url $TEMPO_RPC_URL 0x86A2EE8FAf9A840F7a2c64CA3d51209F9A02081D 'increment()' --private-key "$PK"
cast mktx --fee-token 3 --rpc-url $TEMPO_RPC_URL 0x86A2EE8FAf9A840F7a2c64CA3d51209F9A02081D 'increment()' --private-key "$PK"
