# _template

Template app for Tempo. Copy this folder to create a new app.

## Quick Start

```bash
# 1. Copy template
cp -r apps/_template apps/my-app

# 2. Update names in package.json and wrangler.jsonc
# Replace "_template" with "my-app"

# 3. Install dependencies
pnpm install

# 4. Run locally
cd apps/my-app
pnpm dev
```

## Features

This template includes:

- **Hono** - Fast, lightweight web framework
- **tempo.ts** - Tempo blockchain client
- **IDXS** - On-chain data indexing
- **Zod** - Request validation
- **CORS** - Cross-origin support

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Health check |
| `GET /api/balance/:address` | Get balance for address |
| `GET /api/transfers` | Get recent transfers |

## Adding Features

### D1 Database

1. Create database: `wrangler d1 create my-db`
2. Uncomment `d1_databases` in wrangler.jsonc
3. Add `DB: D1Database` to env.d.ts

### R2 Storage

1. Create bucket: `wrangler r2 bucket create my-bucket`
2. Uncomment `r2_buckets` in wrangler.jsonc
3. Add `BUCKET: R2Bucket` to env.d.ts

### Fee Sponsorship

See `apps/fee-payer` for a complete example.

### Payment Auth (402)

```typescript
import { paymentAuth } from '@paymentauth/hono'

app.get('/paid', paymentAuth({ ... }), (c) => {
  return c.json({ content: 'Premium!' })
})
```

## Deployment

```bash
# Deploy to moderato testnet
pnpm deploy --env moderato

# Deploy to mainnet
pnpm deploy --env mainnet
```

## Secrets

```bash
# Set secrets for production
wrangler secret put SPONSOR_PRIVATE_KEY --env moderato
wrangler secret put API_KEY --env moderato
```
