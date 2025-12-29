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
TEMPO_ENV=testnet pnpm test          # Run tests against testnet
```

Tests use Cloudflare's [vitest-pool-workers](https://developers.cloudflare.com/workers/testing/vitest-integration/) to run the Worker in a local Miniflare environment.

**Transaction sponsorship tests** require a local Tempo node. The test setup automatically starts a Tempo container via [Prool](https://github.com/wevm/prool) when Docker is running. No manual setup is required - the sponsor account is derived from a deterministic test mnemonic and is pre-funded on localnet.

Environment variables:
- `TEMPO_ENV` - `localnet` (default), `testnet`, or `devnet`
- `TEMPO_TAG` - Docker image tag for localnet (default: `latest`)

## API

| Method | Route | Params |
|--------|-------|--------|
| GET | `/usage` | - optional: `blockTimestampFrom` (epoch seconds)<br>- optional: `blockTimestampTo` (epoch seconds) |
| POST | `*` | JSON-RPC request body for fee sponsorship<br>Supported methods: `eth_signTransaction`, `eth_signRawTransaction`, `eth_sendRawTransaction`, `eth_sendRawTransactionSync` |
