# Internal prover devnet explorer

This environment explores the Tempo L1 in `tempo-devnet-zone-prover`, not the
zone RPC in `tempo-zone-prover`. It retains chain ID 31318, with explicit
environment routing and independent TIDX/PostgreSQL/ClickHouse storage.

## Hosting

The intended URL is `https://dev-eu-zone-prover-explorer.tail388b2e.ts.net`.
The explorer runs inside dev-eu behind a Tailscale Kubernetes ingress. There is
no public custom domain, Cloudflare deployment/preview, or Tailscale Funnel.
Tailnet ACLs must grant only the intended internal users access to
`tag:dev-eu-zone-prover-explorer` on TCP 443. Review existing broad grants too.
Tailscale HTTPS requires MagicDNS/HTTPS support; its certificate hostname may
appear in public certificate-transparency logs, but the service remains private.

`runtime/server.mjs` runs the built Cloudflare Worker with pinned Miniflare/workerd
and local static assets. This is a self-hosted internal devnet runtime, not a
replacement for the public explorer's Cloudflare deployment. It has no inspector,
remote Cloudflare bindings or browser-rendering binding. PostHog, Datadog and Sentry
browser telemetry are disabled for this build. Rate limits are process-local;
without Cloudflare client metadata, clients share the `unknown` IP bucket.
Restarting the pod clears local caches and rate limits.

The browser uses same-origin `/api/rpc`; server reads and simulation go to
`http://nodes-rpc-service.tempo-devnet-zone-prover.svc.cluster.local:8545`.
TIDX queries go to `http://tidx.tempo-devnet-zone-prover.svc.cluster.local:8080`.
These services need no public ingress or Basic-auth gateway. The read-only RPC
relay rejects writes, large batches and oversized bodies. Workerd egress allows
private networks only; no fallback to a public/shared devnet is configured.

## Build and rollout

From the repository root:

```sh
docker build -f apps/explorer/Dockerfile -t explorer-zone-prover .
docker run --rm -p 127.0.0.1:8080:8080 explorer-zone-prover
node apps/explorer/runtime/smoke.mjs
```

The dedicated image workflow builds and smoke-tests PRs without publishing;
main builds publish `ghcr.io/tempoxyz/explorer-zone-prover:<commit-sha>` and
`:main`. It does not deploy. Ordinary Cloudflare deploy/preview matrices exclude
this environment; `scripts/deploy.sh --env zone-prover` rejects it too.

1. Merge/build this image; pin its published digest in the companion dev-infra
   manifest before first manual Argo sync. No Cloudflare credentials are needed.
2. Follow dev-infra's database/indexer bootstrap and Tailscale ACL prerequisites.
3. Open the URL from an authorized client. Verify denial outside Tailscale and
   from a tailnet identity without a grant.
4. Compare a known L1 block hash and settlement receipt with the RPC. Check
   Zone Portal's `?tab=batches` checkpoint list and its deposits/withdrawals after
   TIDX catches up. Matching chain IDs or heights alone is insufficient.
5. Check browser RPC stays same-origin, indexer failures do not fall back to
   standard devnet, and no public Cloudflare route/preview was created.

The initial revision of this PR's CI uploaded an `explorer-zone-prover` Worker
version before the switch to internal hosting (no preview URL was emitted).
Verify/remove that unused Cloudflare artifact during rollout; removing a CI
matrix entry alone does not delete existing Cloudflare resources.

For local development, use `pnpm --filter explorer dev:zone-prover` from a network
that resolves/reaches cluster services. The image smoke test does not require
the devnet: it checks static assets and server routing with a rejected write.

## Scope and resets

Block/receipt browsing, RPC reads/simulation, and Zone Portal checkpoints,
deposits and withdrawals use dedicated backends. General address history,
aggregate balances, curated tokens and verified contract sources still need a
dedicated Tempo API/source-verification integration: they fail explicitly instead
of showing another chain-31318 devnet's records. Portal social cards stay static.

Before regenesis, stop explorer and indexer; retain old data if needed and
reinitialize both index stores through a separately reviewed reset. Do not reuse
indexed chain-31318 rows across genesis epochs. Set a fresh
`ZONE_PROVER_DATA_EPOCH` in the Deployment and repeat hash/backfill checks.
