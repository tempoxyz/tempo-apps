#!/usr/bin/env bash
set -euo pipefail

# Usage: submit-token.sh '<TOKEN_JSON>'
# Or:    submit-token.sh '<TOKEN_JSON>' '<SVG_FILE_PATH>'
#
# Creates a PR to add a token to the Tempo tokenlist via the GitHub API.
# No clone required — branches and commits are created directly.
# Requires: curl, python3, base64, gh (GitHub CLI, authenticated)

TOKEN_JSON="${1:?Usage: submit-token.sh '<TOKEN_JSON>' [SVG_FILE_PATH]}"
SVG_FILE="${2:-}"

REPO="tempoxyz/tempo-apps"
CHAIN_ID="4217"
TOKENLIST_PATH="apps/tokenlist/data/${CHAIN_ID}/tokenlist.json"
ICONS_DIR="apps/tokenlist/data/${CHAIN_ID}/icons"
API="https://api.github.com"

# --- Resolve GitHub token ---
if [ -n "${GITHUB_TOKEN:-}" ]; then
  GH_TOKEN="$GITHUB_TOKEN"
elif command -v gh &>/dev/null && gh auth status &>/dev/null 2>&1; then
  GH_TOKEN=$(gh auth token)
else
  echo "ERROR: No GitHub token found. Set GITHUB_TOKEN or run 'gh auth login'." >&2
  exit 1
fi

gh_api() {
  local method="$1" path="$2" body="${3:-}"
  local args=(-sf -H "Authorization: Bearer $GH_TOKEN" -H "Accept: application/vnd.github+json" -H "X-GitHub-Api-Version: 2022-11-28")
  if [ -n "$body" ]; then
    args+=(-H "Content-Type: application/json" -d "$body")
  fi
  curl "${args[@]}" -X "$method" "${API}${path}"
}

# --- Parse token JSON ---
TOKEN_NAME=$(echo "$TOKEN_JSON" | python3 -c "import json,sys; t=json.load(sys.stdin); print(t['name'])")
TOKEN_SYMBOL=$(echo "$TOKEN_JSON" | python3 -c "import json,sys; t=json.load(sys.stdin); print(t['symbol'])")
TOKEN_ADDRESS=$(echo "$TOKEN_JSON" | python3 -c "import json,sys; t=json.load(sys.stdin); print(t['address'].lower())")

echo "Adding token: $TOKEN_NAME ($TOKEN_SYMBOL) at $TOKEN_ADDRESS"

# --- Validate address format ---
if ! echo "$TOKEN_ADDRESS" | grep -qE '^0x[0-9a-f]{40}$'; then
  echo "ERROR: Invalid address format: $TOKEN_ADDRESS" >&2
  exit 1
fi

# --- Check if already listed ---
EXISTING=$(curl -sf "https://tokenlist.tempo.xyz/list/4217" | python3 -c "
import json, sys
data = json.load(sys.stdin)
addr = '$TOKEN_ADDRESS'
match = [t for t in data['tokens'] if t['address'].lower() == addr]
if match:
    print(f'{match[0][\"name\"]} ({match[0][\"symbol\"]})')
" 2>/dev/null || true)

if [ -n "$EXISTING" ]; then
  echo "ERROR: Token already listed as: $EXISTING" >&2
  exit 1
fi

# --- Get default branch and HEAD SHA ---
echo "Fetching repo info..."
DEFAULT_BRANCH=$(gh_api GET "/repos/$REPO" | python3 -c "import json,sys; print(json.load(sys.stdin)['default_branch'])")
BASE_SHA=$(gh_api GET "/repos/$REPO/git/ref/heads/$DEFAULT_BRANCH" | python3 -c "import json,sys; print(json.load(sys.stdin)['object']['sha'])")
echo "Base: $DEFAULT_BRANCH @ ${BASE_SHA:0:7}"

# --- Create branch ---
BRANCH="add-token-$(echo "$TOKEN_SYMBOL" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g')-$(date +%s | tail -c 6)"
gh_api POST "/repos/$REPO/git/refs" "$(python3 -c "import json; print(json.dumps({'ref': 'refs/heads/$BRANCH', 'sha': '$BASE_SHA'}))")" >/dev/null
echo "Branch created: $BRANCH"

# --- Fetch and update tokenlist.json ---
echo "Updating tokenlist.json..."
TOKENLIST_CONTENT=$(gh_api GET "/repos/$REPO/contents/$TOKENLIST_PATH?ref=$DEFAULT_BRANCH" | python3 -c "
import json, sys, base64
data = json.load(sys.stdin)
print(base64.b64decode(data['content']).decode())
")

NEW_CONTENT=$(echo "$TOKENLIST_CONTENT" | python3 -c "
import json, sys
from datetime import datetime, timezone

tokenlist = json.load(sys.stdin)
token = json.loads('''$TOKEN_JSON''')
token['address'] = token['address'].lower()
token['dateAdded'] = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
tokenlist['tokens'].append(token)
tokenlist['version']['patch'] += 1
tokenlist['timestamp'] = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
print(json.dumps(tokenlist, indent=2))
")

# --- Create blob for tokenlist.json ---
TOKENLIST_B64=$(echo "$NEW_CONTENT" | base64)
TOKENLIST_BLOB=$(gh_api POST "/repos/$REPO/git/blobs" "$(python3 -c "import json; print(json.dumps({'content': '''$TOKENLIST_B64'''.replace(chr(10),''), 'encoding': 'base64'}))")" | python3 -c "import json,sys; print(json.load(sys.stdin)['sha'])")

# --- Build tree items ---
TREE_JSON=$(python3 -c "
import json
items = [{'path': '$TOKENLIST_PATH', 'mode': '100644', 'type': 'blob', 'sha': '$TOKENLIST_BLOB'}]
print(json.dumps(items))
")

# --- Create blob for SVG if provided ---
if [ -n "$SVG_FILE" ] && [ -f "$SVG_FILE" ]; then
  echo "Uploading SVG icon..."
  SVG_B64=$(base64 < "$SVG_FILE" | tr -d '\n')
  SVG_BLOB=$(gh_api POST "/repos/$REPO/git/blobs" "$(python3 -c "import json; print(json.dumps({'content': '$SVG_B64', 'encoding': 'base64'}))")" | python3 -c "import json,sys; print(json.load(sys.stdin)['sha'])")
  TREE_JSON=$(python3 -c "
import json
items = json.loads('''$TREE_JSON''')
items.append({'path': '$ICONS_DIR/${TOKEN_ADDRESS}.svg', 'mode': '100644', 'type': 'blob', 'sha': '$SVG_BLOB'})
print(json.dumps(items))
")
  echo "SVG icon uploaded"
fi

# --- Create tree ---
TREE_SHA=$(gh_api POST "/repos/$REPO/git/trees" "$(python3 -c "import json; print(json.dumps({'base_tree': '$BASE_SHA', 'tree': json.loads('''$TREE_JSON''')}))")" | python3 -c "import json,sys; print(json.load(sys.stdin)['sha'])")

# --- Create commit ---
COMMIT_MSG="tokenlist: add $TOKEN_NAME ($TOKEN_SYMBOL)"
COMMIT_SHA=$(gh_api POST "/repos/$REPO/git/commits" "$(python3 -c "import json; print(json.dumps({'message': '$COMMIT_MSG', 'tree': '$TREE_SHA', 'parents': ['$BASE_SHA']}))")" | python3 -c "import json,sys; print(json.load(sys.stdin)['sha'])")
echo "Commit: ${COMMIT_SHA:0:7}"

# --- Update branch ref ---
gh_api PATCH "/repos/$REPO/git/refs/heads/$BRANCH" "$(python3 -c "import json; print(json.dumps({'sha': '$COMMIT_SHA'}))")" >/dev/null

# --- Create PR ---
PR_BODY="Add $TOKEN_NAME ($TOKEN_SYMBOL) to the Tempo mainnet tokenlist.\n\nAddress: \`$TOKEN_ADDRESS\`\n\nSubmitted via add-a-token skill."
PR_URL=$(gh_api POST "/repos/$REPO/pulls" "$(python3 -c "
import json
print(json.dumps({
    'title': '$COMMIT_MSG',
    'body': '$PR_BODY',
    'head': '$BRANCH',
    'base': '$DEFAULT_BRANCH'
}))
")" | python3 -c "import json,sys; print(json.load(sys.stdin)['html_url'])")

echo ""
echo "✅ PR created: $PR_URL"
