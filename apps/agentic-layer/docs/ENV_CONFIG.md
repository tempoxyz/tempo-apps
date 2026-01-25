# Environment Variable Configuration

The Tempo Agentic Layer now supports zero-config setup via environment variables.

## Quick Start

Create a `.env` file:

```bash
TEMPO_RECIPIENT=0x1234567890123456789012345678901234567890
TEMPO_AMOUNT=1000000
TEMPO_TOKEN=0x20c0000000000000000000000000000000000001
TEMPO_RPC_URL=https://rpc.moderato.tempo.xyz
TEMPO_ALLOWED_AGE_SECONDS=300
```

Then use the middleware without any configuration:

```typescript
import express from 'express'
import { createPaymentGate } from '@tempo/402-server'

const app = express()

// Zero-config setup - uses environment variables
app.use('/api/premium', createPaymentGate())

app.get('/api/premium/data', (req, res) => {
  res.json({ data: 'Premium content' })
})
```

## Environment Variables

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `TEMPO_RECIPIENT` | Yes* | Ethereum address to receive payments | - |
| `TEMPO_AMOUNT` | Yes* | Payment amount in atomic units | - |
| `TEMPO_TOKEN` | No | Token contract address | `ALPHA_USD_ADDRESS` |
| `TEMPO_RPC_URL` | Yes* | RPC URL for payment verification | - |
| `TEMPO_ALLOWED_AGE_SECONDS` | No | Maximum transaction age in seconds | `300` |

\* Required if not provided in config object

## Configuration Priority

Explicit configuration always overrides environment variables:

```typescript
// Environment variables are used as defaults
// Explicit config takes precedence
app.use('/api/premium', createPaymentGate({
  amount: '2000000', // Overrides TEMPO_AMOUNT
  // recipient and rpcUrl come from env vars
}))
```

## Validation

The middleware validates all configuration and provides helpful error messages:

```
Missing required configuration: recipient, amount.
Set environment variables (TEMPO_RECIPIENT, TEMPO_AMOUNT, TEMPO_RPC_URL) or pass config object.
```

## Hono Support

The same environment variable support is available for Hono:

```typescript
import { Hono } from 'hono'
import { fourZeroTwo } from '@tempo/402-server'

const app = new Hono()

// Zero-config setup
app.use('/api/premium/*', fourZeroTwo())

app.get('/api/premium/data', (c) => {
  return c.json({ data: 'Premium content' })
})
```
