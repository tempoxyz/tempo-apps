# Tempo Sponsor - Fee Payer Service

A Cloudflare Worker that provides fee sponsorship for Tempo transactions, enabling gasless experiences for users.

## Overview

This service implements a fee payer that sponsors all incoming transactions without any rate limiting or restrictions. It receives partially signed transactions from clients and adds the fee payer signature before submitting them to the Tempo network.

## Setup

### Local Development

1. Install dependencies:
```bash
pnpm install
```

2. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your sponsor private key
```

3. Run locally:
```bash
pnpm dev
```

### Deployment

The service automatically deploys via GitHub Actions when changes are pushed to the main branch.

#### Required GitHub Secrets:

- `CLOUDFLARE_API_TOKEN`: Your Cloudflare API token
- `CLOUDFLARE_ACCOUNT_ID`: Your Cloudflare account ID
- `SPONSOR_PRIVATE_KEY`: Private key of the sponsor account (0x27e1afb7cc43a7f9608e0441cd505599cc082f1d3e0be4aa78be22dcb432b7a0)

### Manual Deployment

```bash
# Deploy to staging
pnpm --filter tempo-sponsor deploy:staging

# Deploy to production
pnpm --filter tempo-sponsor deploy:production
```

## Configuration

The worker uses the following environment variables:

- `SPONSOR_PRIVATE_KEY`: Private key of the account that sponsors transactions
- `TEMPO_RPC_URL`: RPC endpoint for Tempo network (default: https://eng:zealous-mayer@rpc.testnet.tempo.xyz)
- `ALLOWED_ORIGINS`: CORS allowed origins (default: *)

## Client Integration

To use this fee payer service in your application:

```typescript
import { createClient, http } from 'viem'
import { tempo } from 'tempo.ts/chains'
import { withFeePayer } from 'tempo.ts/viem'

const client = createClient({
  chain: tempo({ feeToken: '0x20c0000000000000000000000000000000000001' }),
  transport: withFeePayer(
    http('https://eng:zealous-mayer@rpc.testnet.tempo.xyz'),
    http('https://tempo-sponsor.your-domain.workers.dev'), // Your deployed worker URL
  ),
})

// Send sponsored transaction
const hash = await client.sendTransactionSync({
  feePayer: true,
  to: '0x...',
  value: 1000000n,
})
```

## API

The worker exposes a single POST endpoint that accepts JSON-RPC requests:

### Request
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "eth_sendRawTransaction",
  "params": ["0x76..."] // Serialized transaction
}
```

### Response
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": "0x..." // Transaction hash
}
```

## Sponsor Account

Address: `0xf364A31ACF9B7ae96e428e55e4FBE1af8962bc8a`

This account needs to be funded with the appropriate fee token to sponsor transactions.

## Security Notes

- This service sponsors ALL incoming transactions without restrictions
- Ensure the sponsor account is adequately funded but not overfunded
- Monitor usage and costs regularly
- Consider implementing rate limiting or allowlists for production use