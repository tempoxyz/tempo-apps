# TODO: Populate deployment metadata (`transactionHash`, `blockNumber`, `deployer`)

## Context

The `contract_deployments` table has columns for `transaction_hash`, `block_number`, `transaction_index`, and `deployer` (see `src/database/schema.ts` L91–L127), but they have **never been populated**. Both verification routes (`src/route.verify.ts` L900–L907 and `src/route.verify-legacy.ts` L394–L401) only insert `chainId`, `address`, and `contractId`.

The API response at `GET /v2/contract/:chainId/:address?fields=all` already reads and returns these fields (see `src/route.lookup.ts` L483–L494) — they just come back as `null`:

```json
{
  "deployment": {
    "chainId": "42431",
    "address": "0xc0951f25838d83c04eba09ba2dd99ac37e59dc55",
    "transactionHash": null,
    "blockNumber": null,
    "transactionIndex": null,
    "deployer": null
  }
}
```

## Task

### 1. Populate on new verifications

In both `src/route.verify.ts` and `src/route.verify-legacy.ts`, after verification succeeds, fetch the contract's creation transaction from the RPC and store it in the deployment row.

A viem `publicClient` is already instantiated in `route.verify.ts` (L625–L629) using the chain's RPC URL. Use it (or create one in the legacy route) to look up the deployment transaction.

**Approach — use Tempo's block explorer API or trace-based lookup:**

Tempo doesn't have a native `eth_getContractCreator` RPC method. Options:

- **Option A**: Query the Tempo explorer/indexer API for the contract's creation tx hash, then call `client.getTransaction()` and `client.getTransactionReceipt()` to get `blockNumber`, `transactionIndex`, and `from` (deployer). The explorer API base URLs are in `src/wagmi.config.ts` under each chain's `blockExplorers.default.url`.

- **Option B**: Use `eth_getCode` with binary search over block ranges to find the creation block, then scan that block's transactions. This is slower but doesn't depend on an external indexer.

- **Option C**: Accept the creation tx hash as an optional parameter in the verification request body (forge already knows it from the broadcast). This is the simplest approach — the data is already available client-side.

**Example implementation sketch (Option C — preferred):**

```typescript
// In the verify request body schema, add optional field:
// creationTransactionHash: z.string().optional()

// In the deployment insert (route.verify.ts ~L900):
const deploymentMeta = body.creationTransactionHash
  ? await client.getTransactionReceipt({ hash: body.creationTransactionHash })
  : null

await db.insert(contractDeploymentsTable).values({
  id: deploymentId,
  chainId,
  address: addressBytes,
  contractId,
  transactionHash: deploymentMeta
    ? Bytes.fromHex(deploymentMeta.transactionHash)
    : null,
  blockNumber: deploymentMeta?.blockNumber
    ? Number(deploymentMeta.blockNumber)
    : null,
  transactionIndex: deploymentMeta?.transactionIndex ?? null,
  deployer: deploymentMeta
    ? Bytes.fromHex(deploymentMeta.from)
    : null,
  createdBy: auditUser,
  updatedBy: auditUser,
})
```

Note: The `address` and `transactionHash` columns are `blob` type (raw bytes). Use `Bytes.fromHex()` from `ox` to convert hex strings, matching the existing pattern in the codebase.

### 2. Backfill existing verified contracts

Write a one-time script (e.g., `scripts/backfill-deployment-meta.ts`) that:

1. Queries all `contract_deployments` rows where `transaction_hash IS NULL`
2. Groups by `chain_id`
3. For each deployment, looks up the creation tx (via explorer API or on-chain search)
4. Updates the row with `transaction_hash`, `block_number`, `transaction_index`, and `deployer`

```typescript
// Pseudocode for backfill script
import { createPublicClient, http } from 'viem'
import { chains } from '#wagmi.config.ts'

const deployments = await db
  .select()
  .from(contractDeploymentsTable)
  .where(isNull(contractDeploymentsTable.transactionHash))

for (const deployment of deployments) {
  const chain = chains.find(c => c.id === deployment.chainId)
  const client = createPublicClient({ chain, transport: http(chain.rpcUrls.default.http[0]) })
  const address = Hex.fromBytes(new Uint8Array(deployment.address))

  // Fetch creation tx from explorer API
  const explorerUrl = chain.blockExplorers.default.url
  const resp = await fetch(`${explorerUrl}/api/v2/addresses/${address}`)
  const data = await resp.json()
  const creationTxHash = data.creation_tx_hash

  if (creationTxHash) {
    const receipt = await client.getTransactionReceipt({ hash: creationTxHash })
    await db
      .update(contractDeploymentsTable)
      .set({
        transactionHash: Bytes.fromHex(receipt.transactionHash),
        blockNumber: Number(receipt.blockNumber),
        transactionIndex: receipt.transactionIndex,
        deployer: Bytes.fromHex(receipt.from),
      })
      .where(eq(contractDeploymentsTable.id, deployment.id))
  }
}
```

### 3. Update the existing deployment path

When a deployment row already exists (the `existingDeployment.length > 0` branch in both routes), check if `transactionHash` is null and update it if we now have the data. This handles re-verification of previously verified contracts.

## Files to modify

| File | Change |
|------|--------|
| `src/route.verify.ts` L895–L908 | Add deployment metadata to insert + update existing |
| `src/route.verify-legacy.ts` L389–L402 | Same as above |
| `scripts/backfill-deployment-meta.ts` | New script for backfilling existing rows |
| `openapi.json` | Add optional `creationTransactionHash` to verify request schema (if using Option C) |

## Verification

After implementing, re-run the test script and confirm the fields are populated:

```bash
VERIFIER_URL="http://localhost:22222" bash scripts/test-vyper.sh

# Then check the response:
curl "http://localhost:22222/v2/contract/42431/<deployed-address>?fields=all" | jq '.deployment'
# Expected: transactionHash, blockNumber, deployer are non-null
```
