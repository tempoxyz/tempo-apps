# Fee Payer Service

A Cloudflare Worker that provides fee sponsorship for Tempo transactions.

```bash
cp .env.example .env  # Copy example environment variables
pnpm install          # Install dependencies
pnpm dev              # Start development server
pnpm dev:playground   # Start playground
```

## API

| Method | Route | Params |
|--------|-------|--------|
| GET | `/usage` | - optional: `blockTimestampFrom` (epoch seconds)<br>- optional: `blockTimestampTo` (epoch seconds) |
| POST | `*` | JSON-RPC request body for fee sponsorship<br>Supported methods: `eth_signTransaction`, `eth_signRawTransaction`, `eth_sendRawTransaction`, `eth_sendRawTransactionSync` |
