# Fee Payer Service

A Cloudflare Worker that provides fee sponsorship for Tempo transactions.

```bash
cp .env.example .env  # Copy example environment variables
pnpm install          # Install dependencies
pnpm dev              # Start development server
pnpm dev:playground   # Start playground
```

## Testing

```bash
pnpm test                            # Run integration tests (requires Docker)
TEMPO_ENV=moderato pnpm test         # Run tests against moderato (42431)
```

Tests use Cloudflare's [vitest-pool-workers](https://developers.cloudflare.com/workers/testing/vitest-integration/) to run the Worker in a local Miniflare environment.

**Transaction sponsorship tests** require a local Tempo node. The test setup automatically starts a Tempo container via [Prool](https://github.com/wevm/prool) when Docker is running. No manual setup is required - the sponsor account is derived from a deterministic test mnemonic and is pre-funded on localnet.

Environment variables:
- `TEMPO_ENV` - `localnet` (default), `moderato`, or `devnet` (`testnet` is accepted as a backwards-compatible alias of `moderato`)
- `TEMPO_TAG` - Docker image tag for localnet (default: `latest`)

## API

| Method | Route | Params |
|--------|-------|--------|
| GET | `/usage` | - optional: `blockTimestampFrom` (epoch seconds)<br>- optional: `blockTimestampTo` (epoch seconds) |
| POST | `*` | JSON-RPC request body for fee sponsorship<br>Supported sponsorship methods: `eth_signRawTransaction`, `eth_sendRawTransactionSync` (other JSON-RPC methods may be proxied, e.g. `eth_chainId`) |

## Metrics

Metrics are emitted through `cloudflare-worker-metrics` with these global tags:

- `service:fee-payer`
- `tempo_env` from `TEMPO_ENV`
- `build_version`

| Metric | Type | Tags |
| --- | --- | --- |
| `http_request_count` | counter | `method`, `route` |
| `http_response_count` | counter | `method`, `route`, `status`, optional `error_type` |
| `http_response_duration_ms` | histogram | `method`, `route` |
| `fee_payer_rpc_request_count` | counter | `rpc_method`, `keyed_route`, `chain_id` |
| `fee_payer_sponsorship_response_count` | counter | `rpc_method`, `keyed_route`, `chain_id`, `status` (`success` or `error`) |

Routes are normalized and metrics never include API keys, addresses, origins, or transaction hashes.
