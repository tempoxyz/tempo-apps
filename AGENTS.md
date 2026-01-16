# Tempo Apps - Agent Guide

## Overview

Monorepo for Tempo full-stack web applications. Cloudflare Workers + Vite + React stack deployed to Workers with Wrangler.

## Quick Reference

```bash
pnpm install                    # Install all dependencies
pnpm run dev:explorer           # Run explorer app
pnpm run dev:sponsor            # Run fee-payer (sponsor) app
pnpm run check                  # Lint + typecheck all apps
pnpm run check:types            # Typecheck only (uses tsgo for speed)
pnpm run build                  # Build all apps
pnpm run deploy                 # Deploy all apps
```

## Repository Structure

```
tempo-apps/
├── apps/
│   ├── explorer/               # Chain explorer (explore.tempo.xyz)
│   ├── fee-payer/              # Fee sponsorship service (sponsor.*.tempo.xyz)
│   ├── contract-verification/  # Contract verification (contracts.tempo.xyz)
│   ├── tokenlist/              # Token registry (tokenlist.tempo.xyz)
│   └── og/                     # OG image generation
├── scripts/                    # Shared scripts
├── biome.json                  # Shared linter/formatter config
├── pnpm-workspace.yaml         # Workspace + catalog dependencies
└── package.json                # Root scripts
```

## Stack

| Layer | Technology |
|-------|------------|
| **Runtime** | Cloudflare Workers |
| **Framework** | Hono (API), TanStack Start (SSR React) |
| **UI** | React 19, Tailwind CSS v4, CVA |
| **Routing** | TanStack Router |
| **Data** | TanStack Query, idxs (Index Supply), tempo.ts |
| **Wallet** | wagmi v3, viem |
| **Build** | Vite (Rolldown), tsgo (typecheck) |
| **Lint/Format** | Biome |
| **Deploy** | Wrangler |

---

## Creating a New App

### 1. Scaffold the app

```bash
mkdir -p apps/my-app/src
cd apps/my-app
```

### 2. package.json

```json
{
  "name": "my-app",
  "private": true,
  "type": "module",
  "imports": {
    "#*": "./src/*",
    "#wrangler.json": "./wrangler.jsonc"
  },
  "scripts": {
    "postinstall": "pnpm gen:types",
    "dev": "vite dev --port 3000",
    "build": "vite build",
    "check": "pnpm check:biome && pnpm check:types",
    "check:biome": "biome check --write --unsafe",
    "check:types": "tsgo --project tsconfig.json --noEmit",
    "predeploy": "pnpm build",
    "deploy": "wrangler deploy",
    "gen:types": "test -f .env || cp .env.example .env; wrangler types"
  },
  "dependencies": {
    "@tanstack/react-query": "catalog:",
    "@tanstack/react-router": "catalog:",
    "@tanstack/react-start": "catalog:",
    "hono": "catalog:",
    "idxs": "catalog:",
    "ox": "catalog:",
    "react": "catalog:",
    "react-dom": "catalog:",
    "tailwindcss": "catalog:",
    "tempo.ts": "catalog:",
    "viem": "catalog:",
    "wagmi": "catalog:",
    "zod": "catalog:"
  },
  "devDependencies": {
    "@cloudflare/vite-plugin": "catalog:",
    "@cloudflare/workers-types": "catalog:",
    "@tailwindcss/vite": "catalog:",
    "@types/react": "catalog:",
    "@types/react-dom": "catalog:",
    "@vitejs/plugin-react": "catalog:",
    "vite": "catalog:",
    "wrangler": "catalog:"
  }
}
```

### 3. wrangler.jsonc

```jsonc
{
  "$schema": "https://esm.sh/wrangler/config-schema.json",
  "name": "my-app",
  "compatibility_date": "2025-12-17",
  "compatibility_flags": ["nodejs_compat"],
  "main": "./src/index.ts",
  "workers_dev": true,
  "preview_urls": true,
  "observability": {
    "enabled": true,
    "logs": { "enabled": true, "head_sampling_rate": 1 }
  },
  "env": {
    "moderato": {
      "name": "my-app-moderato",
      "routes": [
        { "pattern": "my-app.moderato.tempo.xyz", "zone_name": "tempo.xyz", "custom_domain": true }
      ],
      "vars": {
        "TEMPO_RPC_URL": "https://proxy.tempo.xyz/rpc/42431",
        "TEMPO_ENV": "moderato"
      }
    }
  }
}
```

### 4. Basic API Worker (Hono)

```typescript
// src/index.ts
import { env } from 'cloudflare:workers'
import { Hono } from 'hono'
import { cors } from 'hono/cors'

const app = new Hono()

app.use('*', cors({ origin: '*' }))

app.get('/health', (c) => c.json({ ok: true }))

app.get('/api/example', async (c) => {
  return c.json({ message: 'Hello from Tempo!' })
})

export default app
```

### 5. Full-Stack App (TanStack Start)

See `apps/explorer` for a complete example with:
- SSR React with TanStack Router
- Cloudflare Vite plugin integration
- Query persistence with IndexedDB
- wagmi wallet integration

---

## Tempo Integration Patterns

### Using tempo.ts

```typescript
import { createPublicClient, http } from 'viem'
import { tempoModerato } from 'tempo.ts/chains'
import { publicActionsL2 } from 'tempo.ts'

const client = createPublicClient({
  chain: tempoModerato,
  transport: http()
}).extend(publicActionsL2())

// Get TIP-20 token balance
const balance = await client.getBalance({
  address: '0x...',
  token: '0x20c0000000000000000000000000000000000001' // AlphaUSD
})
```

### Fee Sponsorship (Access Keys)

```typescript
import { Handler } from 'tempo.ts/server'
import { privateKeyToAccount } from 'viem/accounts'

// In your Worker
const handler = Handler.feePayer({
  account: privateKeyToAccount(env.SPONSOR_PRIVATE_KEY),
  chain: tempoModerato,
  transport: http(env.TEMPO_RPC_URL),
})

// Handle JSON-RPC requests for fee sponsorship
return handler.fetch(request)
```

### IDXS (Index Supply) for Activity History

```typescript
import { Idxs } from 'idxs'

const idxs = new Idxs()

// Get recent transfers
const transfers = await idxs.query({
  chain: 'tempo',
  signature: 'event Transfer(address indexed from, address indexed to, uint256 value)',
  address: tokenAddress,
  limit: 50
})
```

---

## Cloudflare Features

### D1 (SQLite)

```jsonc
// wrangler.jsonc
{
  "d1_databases": [
    { "binding": "DB", "database_name": "my-db", "database_id": "..." }
  ]
}
```

```typescript
// Usage
const results = await env.DB.prepare('SELECT * FROM users WHERE id = ?')
  .bind(userId)
  .all()
```

### R2 (Object Storage)

```jsonc
// wrangler.jsonc
{
  "r2_buckets": [
    { "binding": "BUCKET", "bucket_name": "my-bucket" }
  ]
}
```

```typescript
// Usage
await env.BUCKET.put('key', data)
const object = await env.BUCKET.get('key')
```

### Durable Objects

```jsonc
// wrangler.jsonc
{
  "durable_objects": {
    "bindings": [
      { "name": "COUNTER", "class_name": "Counter" }
    ]
  }
}
```

```typescript
// Define the Durable Object
export class Counter {
  constructor(private state: DurableObjectState) {}
  
  async fetch(request: Request) {
    const count = (await this.state.storage.get('count')) ?? 0
    await this.state.storage.put('count', count + 1)
    return new Response(JSON.stringify({ count: count + 1 }))
  }
}
```

### Rate Limiting

```jsonc
// wrangler.jsonc
{
  "ratelimits": [
    { "name": "RateLimiter", "namespace_id": "123", "simple": { "limit": 100, "period": 60 } }
  ]
}
```

### Cron Triggers (Scheduled Workers)

```jsonc
// wrangler.jsonc
{
  "triggers": {
    "crons": ["0 * * * *"]  // Every hour
  }
}
```

```typescript
export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    // Run subscription renewals, cleanup, etc.
  },
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    return app.fetch(request, env, ctx)
  }
}
```

---

## IETF Payment Authorization (402 Payment Required)

Integrate payment-gated endpoints using the IETF draft standard:

```typescript
import { paymentAuth } from '@paymentauth/hono'

app.get('/paid-content', paymentAuth({
  method: 'tempo',
  realm: 'my-app',
  destination: '0x...', // Payment recipient
  asset: '0x20c0000000000000000000000000000000000001', // AlphaUSD
  amount: '100000', // 0.10 USD (6 decimals)
  async verify(signedTx, request) {
    // Verify the signed transaction matches the payment request
    return { valid: true, from: '0x...' }
  },
  async broadcast(signedTx) {
    // Broadcast to Tempo
    const hash = await client.sendRawTransaction({ serializedTransaction: signedTx })
    return { success: true, transactionHash: hash }
  }
}), (c) => {
  const payment = c.get('payment')
  return c.json({ content: 'Premium content!', txHash: payment.txHash })
})
```

---

## Onramp Integration

Integrate fiat-to-crypto onramp (Steven's Onramp / Coinbase):

```typescript
import { createOnrampOrder } from './lib/coinbase-api.js'

app.post('/onramp/order', async (c) => {
  const { address, amount } = await c.req.json()
  
  const result = await createOnrampOrder({
    keyId: env.CB_API_KEY_ID,
    keySecret: env.CB_API_KEY_SECRET,
    destinationAddress: address,
    destinationNetwork: 'base',
    purchaseAmount: amount.toFixed(2),
    domain: env.APP_DOMAIN,
    email: `${address.slice(0, 10)}@tempo.xyz`,
  })
  
  return c.json(result)
})
```

---

## UI Patterns

### Tailwind CSS v4 Setup

```typescript
// vite.config.ts
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [tailwindcss()]
})
```

```css
/* src/app.css */
@import 'tailwindcss';
@import 'tw-animate-css';

@theme {
  --color-tempo-primary: #3B82F6;
  --color-tempo-bg: #0A0A0B;
}
```

### CVA for Component Variants

```typescript
import { cva } from 'cva'

const button = cva({
  base: 'rounded-lg font-medium transition-colors',
  variants: {
    intent: {
      primary: 'bg-blue-500 text-white hover:bg-blue-600',
      secondary: 'bg-gray-200 text-gray-800 hover:bg-gray-300',
    },
    size: {
      sm: 'px-3 py-1.5 text-sm',
      md: 'px-4 py-2',
      lg: 'px-6 py-3 text-lg',
    }
  },
  defaultVariants: { intent: 'primary', size: 'md' }
})

export function Button({ intent, size, ...props }) {
  return <button className={button({ intent, size })} {...props} />
}
```

---

## Environment Configuration

### Tempo Networks

| Network | Chain ID | RPC URL |
|---------|----------|---------|
| Moderato (Testnet) | 42431 | `https://rpc.moderato.tempo.xyz` |
| Testnet | — | `https://rpc.testnet.tempo.xyz` |
| Devnet | — | `https://rpc.devnet.tempoxyz.dev` |
| Mainnet | — | `https://rpc.tempo.xyz` |

### Common Environment Variables

```bash
TEMPO_RPC_URL=https://rpc.moderato.tempo.xyz
TEMPO_ENV=moderato
SPONSOR_PRIVATE_KEY=0x...          # Fee payer private key
ALLOWED_ORIGINS=*                   # CORS origins
```

---

## Deployment

### Per-Environment Deploy

```bash
# Deploy to specific environment
cd apps/my-app
wrangler deploy --env moderato
wrangler deploy --env mainnet
```

### CI/CD (GitHub Actions)

Deployments trigger on push to `main`. Each app/env combination deploys in parallel.

Changes are detected per-app - only modified apps redeploy.

---

## Code Quality

### Typecheck with tsgo

```bash
tsgo --project tsconfig.json --noEmit
```

Uses the native Go-based TypeScript compiler for 10x faster type checking.

### Biome Lint + Format

```bash
biome check --write --unsafe
```

Configuration in root `biome.json`. Uses tabs, single quotes, no semicolons.

---

## Key Patterns

1. **Catalog dependencies**: Use `"catalog:"` in package.json to reference versions from `pnpm-workspace.yaml`
2. **Environment-specific Workers**: Use wrangler `env` blocks for different deployments
3. **Type generation**: Run `wrangler types` to generate `worker-configuration.d.ts`
4. **Import aliases**: Use `#*` for src imports, `#wrangler.json` for config
5. **Observability**: Enable in wrangler.jsonc for logs and traces
