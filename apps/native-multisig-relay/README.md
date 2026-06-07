# Native Multisig Relay

Cloudflare Worker for Tempo native multisig relay flows. This is separate from `apps/fee-payer`: fee-payer sponsors regular wallet transactions, while this Worker stores native multisig approvals and broadcasts once quorum is reached.

If `SPONSOR_PRIVATE_KEY` is configured, the Worker can also sponsor the finalized multisig transaction with the same `feePayer: true` flow as the hosted fee-payer idea. Without it, the multisig account pays its own transaction fee.

## Development

```bash
pnpm dev
pnpm test:e2e
```

The e2e script defaults to:

- `ACCOUNTS_REPO=~/github/tempoxyz/accounts` so it can test the accounts native multisig relay branch before the package is published.
- `TEMPO_TAG=~/github/tempoxyz/tempo/target/debug/tempo` when that local Tempo binary exists, otherwise Prool starts the Docker image tag.
- `TEMPO_ENV=localnet`.

Override any of those values when needed:

```bash
ACCOUNTS_REPO=~/github/tempoxyz/accounts \
TEMPO_TAG=sha-abc123 \
pnpm test:e2e
```

`eth_signTransaction` is intentionally not implemented by this Worker. Owners sign approvals locally; the Worker receives native multisig raw transaction submissions through `eth_sendRawTransaction` or `eth_sendRawTransactionSync`.
