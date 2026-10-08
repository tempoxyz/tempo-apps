# Multisig devnet explorer

The `multisig1` environment targets `tempo-devnet-multisig1`, chain ID 31318,
at `explore.multisig1.devnet.tempo.xyz`. It provides RPC-backed block,
transaction, receipt, and contract-bytecode inspection. It does not change the
devnet's genesis or chain ID.

RPC routing is selected by the Worker deployment, not the shared chain ID.
The browser uses same-origin `/api/rpc`; server rendering uses the same
authenticated `rpc-multisig1.devnet.tempoxyz.dev` gateway. Missing credentials
fail closed. Shared API/indexer and source-verification requests are disabled
for this deployment so they cannot return regular-devnet data for chain 31318.
Indexed history, token lists, and source verification are unavailable until
dedicated multisig backends are configured.

## Rollout

1. Merge and provision the authenticated RPC gateway from
   [dev-infra #3106](https://github.com/tempoxyz/dev-infra/pull/3106).
   Provision its Infisical htpasswd credential, DNS/TLS, and manually sync its
   Argo application. Do not expose the unauthenticated node's admin namespace.
2. Verify authenticated `eth_chainId` returns `0x7a56` and that missing or
   incorrect credentials are rejected. Verify the gateway returns the same
   genesis hash and transaction receipt as the multisig node, not another devnet.
3. Set `RPC_AUTH` on `explorer-multisig1` with
   `pnpm exec wrangler secret put RPC_AUTH --env multisig1`. Supply the gateway's
   literal `username:password`, not a `Basic` header. Never put credentials in
   source control, shell arguments, or browser-visible variables.
4. Build with `CLOUDFLARE_ENV=multisig1 bash scripts/build.sh`, then deploy with
   `pnpm deploy --env multisig1`. The main workflow deploys this environment;
   pull requests upload its preview version. Both require the Worker secret.
5. Verify the public hostname and preview load, check `/api/rpc`, a latest block,
   and `/receipt/0x4268dcab5bf3255235578ec3ba3855500a705cd5894a59fc18191336c2111964`.
   Check that shared indexed-data requests do not return regular-devnet data
   and that gateway credentials never appear in browser requests or assets.

Do not claim the explorer is live until the gateway, Worker secret, deployment,
and exact transaction page have been verified. A built Worker or merged PR alone
does not complete these rollout steps.
