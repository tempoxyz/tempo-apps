# Prover devnet explorer

Deploy `zone-prover` at `https://explore.zone-prover.devnet.tempo.xyz` to inspect
the Tempo L1 that settles the prover zone. It retains chain ID 31318. This is a
separate Worker with fixed upstreams, not an alias for the standard devnet.

## Backends and secrets

Apply the companion `dev-infra` prover explorer resources first. Then provision
these server-only Cloudflare Worker secrets in `explorer-zone-prover`:

- `ZONE_PROVER_RPC_AUTH`: complete Basic authorization header for
  `https://rpc-zone-prover.devnet.tempoxyz.dev`.
- `ZONE_PROVER_TIDX_AUTH`: complete Basic authorization header for
  `https://tidx-zone-prover.devnet.tempoxyz.dev`.

Never put credentials in `VITE_` variables, URLs, source control or PR comments.
These credentials must match the infrastructure's independent htpasswd files.
The browser uses the same-origin `/api/rpc` read-only relay; server reads and
simulation use the fixed authenticated RPC directly. No prover call falls back
to `/rpc/31318`. Missing credentials fail the affected request explicitly.

Run `pnpm --filter explorer deploy:zone-prover` after provisioning. Main-branch
CI includes this environment; bootstrap the Worker secrets before merging this
change. PR previews also need those Worker secrets to query the live backends.

## Supported scope

Block and transaction/receipt browsing, RPC contract reads, simulations, and
Zone Portal deposits, withdrawals and checkpoints use the dedicated backends.
The checkpoint tab remains `?tab=batches`. Checkpoint rows link to the L1
submission transaction and processed deposit/withdrawal boundaries.

The shared Tempo API and source-verification service route by chain ID only.
They are deliberately unavailable on this environment: general address history,
aggregate balances, curated token pages/logos, API activity enrichment and
verified contract sources require a prover-specific API deployment in a later
change. Local receipt decoding and portal balances continue to use the L1 RPC.
The explorer must not substitute another devnet's records for these features.

## Acceptance checks before enabling the endpoint

1. Confirm the prover RPC and indexer reject unauthenticated requests and the
   dedicated indexer's tip hash matches the L1 RPC, not just its chain ID.
2. Open a known prover L1 block and settlement transaction. Compare their hashes
   and receipt fields to the direct RPC.
3. Open the deployed Zone Portal's `?tab=batches`, follow a submission receipt,
   and check a deposit/withdrawal's processing checkpoint.
4. Check the browser network log: RPC goes only to the same-origin relay; no
   credentials or requests to shared devnet RPC/API/source-verification appear.
5. Make a prover backend unavailable in a test deployment and confirm errors,
   with no fallback to the standard devnet.

## Regenesis

Stop traffic and the indexer before a separately approved reset. Reinitialize
only the prover's index stores, verify the new genesis/tip hashes, and update
`ZONE_PROVER_DATA_EPOCH` in the Worker configuration before redeploying. The
epoch namespaces persistent explorer caches. A fresh Worker version also clears
in-memory caches; clients should reload after the reset.
