# Prover devnet

The `zone-prover` build targets Tempo L1 chain **31319**, not the zone chain.
The deployment hostname is configured in `wrangler.json`. Apply the companion
Cloudflare Access policy before publishing; default Worker and preview URLs
remain disabled. This environment is intentionally absent from automatic CI
deployment matrices.

## Deploy prerequisites

1. Apply the companion Access policy and provision the authenticated RPC/TIDX
   gateways and dedicated indexer in dev-infra. Verify the RPC returns chain
   ID `0x7a57` and the indexer has caught up with that same chain.
2. Set `ZONE_PROVER_RPC_AUTH` and `ZONE_PROVER_TIDX_AUTH` with
   `wrangler secret put <name> --env zone-prover`. Values are the complete
   `Basic ...` headers for the respective gateways. Never use a `VITE_` variable
   or commit credentials. Missing credentials fail closed, without RPC fallback.
3. Confirm shared Tempo API and contract-verification support for **31319**.
   This PR connects RPC and raw TIDX queries; it does not onboard the chain to
   those shared services. Address history, balances, token metadata, source
   verification remain deployment acceptance checks. Portal social cards use
   the renderer's static fallback for unsupported networks.
   Do not advertise a fully functioning explorer until they pass.
4. Build with `CLOUDFLARE_ENV=zone-prover VITE_TEMPO_ENV=zone-prover pnpm build`,
   then deploy with `PROVER_ACCESS_READY=1 pnpm deploy --env zone-prover`.
   The flag acknowledges prior verification; it does not create/check Access.
5. Verify authorized access and rejection without the required identity/network,
   including alternate Worker URLs. Check a known L1 block/receipt, a checkpoint
   and its deposits/withdrawals, and simulation on chain 31319. Browser RPC uses
   same-origin `/api/rpc`; credentials must not appear in browser requests/assets.

On regenesis, separately review index-store reset/reindexing and redeploy the
Worker to clear in-memory caches. Do not reuse an old 31318 index as 31319.
