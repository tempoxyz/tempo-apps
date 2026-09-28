# Explorer RPC

Each Explorer Worker serves `POST /api/rpc` for its configured network. Browser
RPC calls use this same-origin endpoint; server rendering and simulations call
the same Orchestra backend directly. No request uses `proxy.tempo.xyz`.

## Worker secrets

Provision a dedicated Explorer client in each network's Orchestra configuration
with an appropriate rate-limit preset. Store its `client_id:api_key` as the
**`RPC_AUTH` secret** on the corresponding Worker. Supply the literal credentials,
without a `Basic ` prefix or base64 encoding. This is an Orchestra credential,
not a Tempo API key. Never use a `VITE_` variable for credentials.

| Wrangler environment | Worker | Upstream | Secret |
| --- | --- | --- | --- |
| `mainnet` | `explorer-mainnet` | `https://rpc.tempo.xyz` | `RPC_AUTH` for mainnet |
| `testnet` | `explorer-testnet` | `https://rpc.testnet.tempo.xyz` | `RPC_AUTH` for Moderato |
| `devnet` | `explorer-devnet` | `https://rpc.devnet.tempoxyz.dev` | `RPC_AUTH` for devnet |
| `nextfork` | `explorer-nextfork` | `https://rpc-nextfork.devnet.tempoxyz.dev` | `RPC_AUTH` for nextfork |
| `zone-prover` | `explorer-zone-prover` | `https://rpc-zone-prover.devnet.tempoxyz.dev` | Existing `ZONE_PROVER_RPC_AUTH` (complete `Basic <base64(client_id:api_key)>` header) |

From `apps/explorer`, set the secrets interactively before deploying:

```sh
pnpm exec wrangler secret put RPC_AUTH --env mainnet
pnpm exec wrangler secret put RPC_AUTH --env testnet
pnpm exec wrangler secret put RPC_AUTH --env devnet
pnpm exec wrangler secret put RPC_AUTH --env nextfork
```

Wrangler prompts for each value; do not put credentials in shell arguments,
source control, or PR comments. Preview Workers also need the credential for
their configured network. For local development, set `RPC_AUTH` in the app's
ignored `.env` file and select the matching `pnpm dev:<environment>` command.

Keep existing non-RPC secrets, including `TEMPO_API_KEY` and the prover's
`ZONE_PROVER_TIDX_AUTH`. `TEMPO_RPC_KEY` is no longer used by Explorer. Remove it
only after the new version is deployed and verified.

## Request policy and rollout

The Worker deployment selects the upstream. Callers cannot select a URL, network,
or upstream credential; devnet and nextfork remain distinct despite sharing
chain ID 31318. Missing or malformed credentials fail closed. The endpoint
allows reviewed reads, tracing/simulation, and signed transaction broadcasts;
the prover endpoint retains its read-only policy. Node-managed signing, admin,
faucet and unlisted methods are rejected, including in batches. Requests are
limited to 128 KiB and 50 calls, with a 15-second upstream timeout. Existing Worker
IP, ASN and global rate limits still apply. Origin headers do not grant access.

This endpoint supports HTTP JSON-RPC, not WebSocket upgrades. Existing live-head
subscriptions already use the chain's direct public WebSocket URL; chains without
one poll through `/api/rpc`. Verify block updates and reconnect behavior during
rollout as well as blocks, balances, transaction traces, simulations and signed
broadcasts. Verify `eth_chainId` through each Worker's `/api/rpc`, and check for
unexpected 429/502/503 responses. Server-side auth must not appear in browser
requests or built client assets.

Roll out each network after its secret is set. Keep the old proxy running until
remaining consumers have migrated and traffic has drained. This PR does not
deploy Workers, provision Orchestra clients, or retire the proxy service.
