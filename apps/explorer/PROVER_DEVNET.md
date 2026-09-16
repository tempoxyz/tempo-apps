# Employee-only prover devnet explorer

Cloudflare hosts `https://explore-zone-prover.tehq.net`. The Access application
requires broker-backed identity AND Tailscale app-connector egress, matching the
`ai.tehq.net` browser gate. It has no public-path exceptions. `workers.dev` and
version previews are disabled and also covered by Access policies. Existing
Tailscale `*.tehq.net` and `*.porto.workers.dev` connector routes cover these names.

This explores the Tempo L1 `tempo-devnet-zone-prover`, not the zone RPC in
`tempo-zone-prover`. Chain ID stays 31318; explicit network selection prevents
fallback to other devnets. The browser's read-only `/api/rpc` relay keeps backend
credentials server-side. RPC and TIDX use separate authenticated HTTPS gateways.

## Rollout order

1. Apply the companion `tempoxyz/cloudflare` PR first. Verify the custom hostname,
   stable Worker hostname and version aliases deny unauthenticated/non-Tailscale
   requests. These policies also cover the version uploaded by earlier PR CI.
2. Follow dev-infra's database/indexer bootstrap. Provision independent random
   RPC/TIDX gateway credentials; verify both reject requests without credentials.
3. Set Worker secrets `ZONE_PROVER_RPC_AUTH` and `ZONE_PROVER_TIDX_AUTH` to the
   matching complete `Basic ...` header values. Do not put them in Vite variables,
   source control, browser code or documentation.
4. Only after verifying Access, explicitly deploy from `apps/explorer`:

   ```sh
   PROVER_ACCESS_READY=1 pnpm deploy --env zone-prover
   ```

   The flag acknowledges the operator's Access check; it does not query Cloudflare.
   This environment is deliberately absent from automatic deploy/preview CI.
5. Verify an authorized employee on Tailscale can load the explorer, while an
   unauthenticated client, nonemployee identity and client outside Tailscale cannot.
   Check `/api/rpc` and server-function paths too, not just the homepage. Confirm
   alternate Worker URLs are disabled/protected and no public bypass exists.
6. Compare a known L1 block hash, settlement receipt and Zone Portal checkpoint
   (`?tab=batches`) against the prover RPC after backfill. Matching chain IDs or
   heights alone is insufficient. Check linked deposits and withdrawals too.

General shared-API address history, aggregate balances, curated tokens and verified
sources remain unavailable without a dedicated Tempo API integration; never show
another devnet's records. PostHog/Datadog/Sentry browser telemetry stays disabled.

Before regenesis, stop explorer/indexer, preserve old data if needed, and reset both
index stores through a separately reviewed operation. Change `ZONE_PROVER_DATA_EPOCH`
and repeat hash/backfill checks; do not reuse indexed rows across genesis epochs.
