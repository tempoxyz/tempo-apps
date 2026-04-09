#!/usr/bin/env bash
set -euo pipefail

# Usage: ./verify-contract.sh <chain_id> <address> [verifier_url]
CHAIN_ID="${1:?Usage: $0 <chain_id> <address> [verifier_url]}"
ADDRESS="${2:?Usage: $0 <chain_id> <address> [verifier_url]}"
VERIFIER_URL="${3:-https://contracts.tempo.xyz}"

case "$CHAIN_ID" in
  4217)  RPC_URL="${RPC_URL:-https://rpc.mainnet.tempo.xyz}" ;;
  42431) RPC_URL="${RPC_URL:-https://rpc.testnet.tempo.xyz}" ;;
  31318) RPC_URL="${RPC_URL:-https://rpc.devnet.tempoxyz.dev}" ;;
  *)     RPC_URL="${RPC_URL:?Set RPC_URL for chain $CHAIN_ID}" ;;
esac

WORKDIR=$(mktemp -d)
trap 'rm -rf "$WORKDIR"' EXIT

echo "=== Contract Verification ==="
echo "Chain:    $CHAIN_ID"
echo "Address:  $ADDRESS"
echo "Verifier: $VERIFIER_URL"
echo "RPC:      ${RPC_URL%%@*}@***"
echo "Workdir:  $WORKDIR"
echo ""

# --- Step 1: Fetch bytecode ---
echo "[1/5] Fetching bytecode..."
BYTECODE=$(curl -sf -X POST "$RPC_URL" \
  -H "Content-Type: application/json" \
  -d "{\"jsonrpc\":\"2.0\",\"method\":\"eth_getCode\",\"params\":[\"$ADDRESS\",\"latest\"],\"id\":1}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['result'])")

if [[ "$BYTECODE" == "0x" || -z "$BYTECODE" ]]; then
  echo "ERROR: No bytecode at $ADDRESS on chain $CHAIN_ID"
  exit 1
fi
echo "  Bytecode length: ${#BYTECODE} chars"

# --- Step 2: Extract CBOR metadata (IPFS hash + solc version) ---
echo "[2/5] Extracting CBOR metadata..."
METADATA_JSON=$(python3 - "$BYTECODE" << 'PYEOF'
import sys, json

bytecode = sys.argv[1].strip()
if bytecode.startswith("0x"):
    bytecode = bytecode[2:]

cbor_len = int(bytecode[-4:], 16)
cbor_hex = bytecode[-(4 + cbor_len * 2):-4]

ipfs_marker = "6469706673"
if ipfs_marker not in cbor_hex:
    print(json.dumps({"error": "No IPFS metadata found in bytecode"}))
    sys.exit(1)

idx = cbor_hex.index(ipfs_marker)
hash_start = idx + len(ipfs_marker) + 4
ipfs_hash_hex = cbor_hex[hash_start:hash_start + 64]
raw_hash = bytes.fromhex("1220" + ipfs_hash_hex)

alphabet = b"123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
n = int.from_bytes(raw_hash, "big")
result = b""
while n > 0:
    n, r = divmod(n, 58)
    result = bytes([alphabet[r]]) + result
for byte in raw_hash:
    if byte == 0:
        result = bytes([alphabet[0]]) + result
    else:
        break
cid = result.decode()

solc_marker = "64736f6c6343"
solc_version = None
if solc_marker in cbor_hex:
    vi = cbor_hex.index(solc_marker) + len(solc_marker)
    major = int(cbor_hex[vi:vi+2], 16)
    minor = int(cbor_hex[vi+2:vi+4], 16)
    patch = int(cbor_hex[vi+4:vi+6], 16)
    solc_version = f"{major}.{minor}.{patch}"

print(json.dumps({"cid": cid, "solc_version": solc_version}))
PYEOF
)

IPFS_CID=$(echo "$METADATA_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin)['cid'])")
SOLC_SHORT=$(echo "$METADATA_JSON" | python3 -c "import sys,json; v=json.load(sys.stdin).get('solc_version'); print(v or 'unknown')")
echo "  IPFS CID:     $IPFS_CID"
echo "  Solc version:  $SOLC_SHORT"

# --- Step 3: Fetch metadata.json from IPFS ---
echo "[3/5] Fetching metadata from IPFS..."
METADATA_FILE="$WORKDIR/metadata.json"
for gateway in "https://cloudflare-ipfs.com/ipfs" "https://ipfs.io/ipfs" "https://dweb.link/ipfs"; do
  if curl -sfL --max-time 20 "$gateway/$IPFS_CID" -o "$METADATA_FILE" 2>/dev/null; then
    if python3 -c "import json; json.load(open('$METADATA_FILE'))" 2>/dev/null; then
      echo "  Fetched from $gateway"
      break
    fi
  fi
done

if ! python3 -c "import json; json.load(open('$METADATA_FILE'))" 2>/dev/null; then
  echo "ERROR: Failed to fetch metadata from IPFS"
  exit 1
fi

# --- Step 4: Fetch all source files from IPFS ---
echo "[4/5] Fetching source files from IPFS..."
python3 - "$METADATA_FILE" "$WORKDIR/verify_request.json" << 'PYEOF'
import json, subprocess, sys

metadata_file = sys.argv[1]
output_file = sys.argv[2]

with open(metadata_file) as f:
    meta = json.load(f)

sources = meta.get("sources", {})
settings = meta.get("settings", {})
compiler = meta["compiler"]["version"]
target = settings.get("compilationTarget", {})

if not target:
    print("ERROR: No compilationTarget in metadata")
    sys.exit(1)

contract_path = list(target.keys())[0]
contract_name = list(target.values())[0]

print(f"  Contract: {contract_path}:{contract_name}")
print(f"  Compiler: {compiler}")
print(f"  Sources:  {len(sources)} files")

fetched = {}
failed = []

for i, (path, info) in enumerate(sources.items(), 1):
    ipfs_cid = None
    for u in info.get("urls", []):
        if "ipfs/" in u:
            ipfs_cid = u.split("ipfs/")[-1]
            break

    if not ipfs_cid:
        content = info.get("content")
        if content:
            fetched[path] = content
            continue
        failed.append(path)
        continue

    content = None
    for gateway in [
        "https://cloudflare-ipfs.com/ipfs/",
        "https://ipfs.io/ipfs/",
        "https://dweb.link/ipfs/",
    ]:
        result = subprocess.run(
            ["curl", "-sfL", "--max-time", "15", f"{gateway}{ipfs_cid}"],
            capture_output=True, text=True,
        )
        if (
            result.returncode == 0
            and result.stdout
            and not result.stdout.strip().startswith("<!")
            and not result.stdout.strip().startswith("<a ")
        ):
            content = result.stdout
            break

    if content:
        fetched[path] = content
    else:
        failed.append(path)

    if i % 10 == 0 or i == len(sources):
        print(f"  Fetched {i}/{len(sources)}...", end="\r")

print(f"  Fetched {len(fetched)}/{len(sources)} source files")

# Build verification request
std_settings = {k: v for k, v in settings.items() if k != "compilationTarget"}
std_settings["outputSelection"] = {
    "*": {"*": ["abi", "evm.bytecode", "evm.deployedBytecode", "metadata"]}
}

body = {
    "stdJsonInput": {
        "language": meta["language"],
        "sources": {p: {"content": c} for p, c in fetched.items()},
        "settings": std_settings,
    },
    "compilerVersion": compiler,
    "contractIdentifier": f"{contract_path}:{contract_name}",
}

with open(output_file, "w") as f:
    json.dump(body, f)

print(f"  Request saved ({len(json.dumps(body))} bytes)")
PYEOF

# --- Step 5: Submit verification ---
echo "[5/5] Submitting verification to $VERIFIER_URL..."
RESPONSE=$(curl -sf -X POST \
  "$VERIFIER_URL/v2/verify/$CHAIN_ID/$ADDRESS" \
  -H "Content-Type: application/json" \
  -d "@$WORKDIR/verify_request.json")

VERIFICATION_ID=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('verificationId',''))" 2>/dev/null || true)

if [[ -z "$VERIFICATION_ID" ]]; then
  echo "ERROR: Submission failed: $RESPONSE"
  exit 1
fi

echo "  Verification ID: $VERIFICATION_ID"
echo ""

# --- Poll for result ---
echo "Polling for result..."
for attempt in $(seq 1 90); do
  sleep 2
  RESULT=$(curl -sf "$VERIFIER_URL/v2/verify/$VERIFICATION_ID" 2>/dev/null || echo '{}')
  IS_DONE=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('isJobCompleted', False))" 2>/dev/null || echo "False")

  if [[ "$IS_DONE" == "True" ]]; then
    MATCH=$(echo "$RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); c=d.get('contract',{}); print(c.get('match','none') if c else 'none')" 2>/dev/null)
    ERROR=$(echo "$RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); e=d.get('error',{}); print(e.get('message','') if e else '')" 2>/dev/null)

    if [[ -n "$ERROR" && "$ERROR" != "None" && "$ERROR" != "" ]]; then
      echo "FAILED: $ERROR"
      exit 1
    else
      echo "SUCCESS: match=$MATCH"
      exit 0
    fi
  fi
  printf "\r  Attempt %d/90 - still compiling..." "$attempt"
done

echo ""
echo "TIMEOUT: Verification did not complete within 3 minutes"
exit 1
