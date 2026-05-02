---
name: add-a-token
description: "Add tokens to the Tempo tokenlist via PR. Use when asked to add a token, submit a token, or list a new token on Tempo."
---

# Adding a Token to the Tempo Tokenlist

Adds a TIP-20 token to the Tempo mainnet tokenlist by creating a PR to this repository.

Reference: https://docs.tempo.xyz/guides/add-a-token

## When to Use

- User says "add token X to the tokenlist"
- User provides a token name, symbol, address, and wants it listed
- User asks to "submit a token" or "list a new token"

## Required Information

If the user provides a contract address, fetch on-chain metadata via RPC before asking for missing fields:

```bash
# Fetch name, symbol, decimals from the contract
cast call <ADDRESS> "name()(string)" --rpc-url https://rpc.tempo.xyz
cast call <ADDRESS> "symbol()(string)" --rpc-url https://rpc.tempo.xyz
cast call <ADDRESS> "decimals()(uint8)" --rpc-url https://rpc.tempo.xyz
```

> **Note:** Mainnet RPC (`rpc.tempo.xyz`) requires authentication. If `cast` returns 401, use an authenticated RPC URL or fall back to asking the user for name/symbol/decimals.

| Field | Required | Default | Example |
|-------|----------|---------|---------|
| **name** | Yes | from RPC | `Cap USD` |
| **symbol** | Yes | from RPC | `cUSD` |
| **address** | Yes | — | `0x20c0000000000000000000000520792dcccccccc` |
| **decimals** | No | from RPC or `6` | `6` |
| **chainId** | No | `4217` | `4217` (mainnet) |
| **logoURI** | No | auto-generated | `https://...` |
| **extensions.chain** | No | `tempo` | `tempo` |
| **extensions.label** | No | same as symbol | `cUSD` |
| **svgFile** | No | — | path to an SVG logo file |

## Workflow

### Step 1: Validate the Token

1. Verify the address format: must be `0x` + 40 hex chars, lowercase
2. Fetch name/symbol/decimals via RPC if not provided
3. Check the address is not already in the tokenlist:
   ```bash
   curl -s "https://tokenlist.tempo.xyz/list/4217" | python3 -c "
   import json, sys
   data = json.load(sys.stdin)
   addr = 'ADDRESS_HERE'.lower()
   match = [t for t in data['tokens'] if t['address'].lower() == addr]
   if match:
       print(f'ALREADY LISTED: {match[0][\"name\"]} ({match[0][\"symbol\"]})')
   else:
       print('NOT LISTED - OK to add')
   "
   ```

### Step 2: Build the Token Entry

Construct the token JSON object. The required shape matches the existing entries in `apps/tokenlist/data/4217/tokenlist.json`.

If no `logoURI` is provided, generate it from the convention:
```
https://esm.sh/gh/tempoxyz/tempo-apps/apps/tokenlist/data/4217/icons/<address>.svg
```

Example token entry:
```json
{
  "name": "Cap USD",
  "symbol": "cUSD",
  "decimals": 6,
  "chainId": 4217,
  "address": "0x20c0000000000000000000000520792dcccccccc",
  "logoURI": "https://esm.sh/gh/tempoxyz/tempo-apps/apps/tokenlist/data/4217/icons/0x20c0000000000000000000000520792dcccccccc.svg",
  "extensions": {
    "chain": "tempo",
    "label": "cUSD"
  }
}
```

### Step 3: Confirm with User

**Always confirm before creating the PR.** Show the user:
- Token name, symbol, decimals
- Contract address
- Logo URI
- Whether an SVG file will be included
- Extensions (if any)

Ask: "Does this look correct? I'll create a PR to add this token to the Tempo tokenlist."

**Do NOT proceed until the user confirms.**

### Step 4: Submit the PR

Run the submit script from this skill's directory. Pass the token JSON as the first argument. If an SVG file path was provided, pass it as the second argument:

```bash
# Without SVG
.agents/skills/add-a-token/scripts/submit-token.sh '<TOKEN_JSON>'

# With SVG
.agents/skills/add-a-token/scripts/submit-token.sh '<TOKEN_JSON>' '/path/to/logo.svg'
```

This script will (all via the GitHub API — no clone required):
1. Create a branch on `tempoxyz/tempo-apps`
2. Add the token to `apps/tokenlist/data/4217/tokenlist.json` (with `dateAdded` timestamp)
3. Upload the SVG icon blob if provided
4. Commit and create a PR

### Step 5: Report Result

Share the PR URL from the script output with the user.
