# TODO

## Populate deployment metadata (`transactionHash`, `blockNumber`, `deployer`)

### Context

The `contract_deployments` table has columns for `transaction_hash`, `block_number`, `transaction_index`, and `deployer` (see `database/schema.ts` L91–L127), but they were historically never populated.

The API response at `GET /v2/contract/:chainId/:address?fields=all` already reads and returns these fields (see `src/route.lookup.ts` L486–L497).

### Status

#### ✅ 1. Populate on new verifications (`route.verify.ts`) — DONE

`src/route.verify.ts` now accepts an optional `creationTransactionHash` in the request body (L127), fetches the transaction receipt via `client.getTransactionReceipt()` (L684–700), and stores `transactionHash`, `blockNumber`, `transactionIndex`, and `deployer` in the deployment row on both insert (L1022–1034) and update of existing deployments (L1003–1017).

#### ✅ 3. Update existing deployment path (`route.verify.ts`) — DONE

When a deployment row already exists with `transactionHash === null`, `route.verify.ts` updates it with the metadata if `creationTransactionHash` was provided (L1003–1017).

#### ❌ 2. Populate on new verifications (`route.verify-legacy.ts`) — NOT DONE

`src/route.verify-legacy.ts` still only inserts `chainId`, `address`, and `contractId` (L417–424). It does not accept `creationTransactionHash`, does not fetch deployment metadata, and does not update existing deployments that are missing metadata.

**To implement:** Mirror the approach from `route.verify.ts` — add `creationTransactionHash` to the request body, create a viem `publicClient`, fetch the receipt, and populate the deployment row.

#### ❌ 3. Backfill existing verified contracts — NOT DONE

No backfill script exists yet. A one-time script (e.g., `scripts/backfill-deployment-meta.ts`) is needed to:

1. Query all `contract_deployments` rows where `transaction_hash IS NULL`
2. Group by `chain_id`
3. For each deployment, look up the creation tx (via explorer API at `{blockExplorers.default.url}/api/v2/addresses/{address}`)
4. Update the row with `transaction_hash`, `block_number`, `transaction_index`, and `deployer`

### Files to modify

| File | Change |
|------|--------|
| `src/route.verify-legacy.ts` L400–L425 | Add `creationTransactionHash` support + deployment metadata insert/update |
| `scripts/backfill-deployment-meta.ts` | New script for backfilling existing rows |

### Verification

After implementing, confirm the fields are populated:

```bash
VERIFIER_URL="http://localhost:22222" bash scripts/test-vyper.sh

# Then check the response:
curl "http://localhost:22222/v2/contract/42431/<deployed-address>?fields=all" | jq '.deployment'
# Expected: transactionHash, blockNumber, deployer are non-null
```

## Update deps and view latest containers docs

### Update deps in package.json

### View latest containers docs <https://developers.cloudflare.com/containers/llms-full.txt>

figure out how to get logs from [./container/index.ts](./container/index.ts)
