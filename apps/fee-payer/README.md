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

2. Set up environment variables in `wrangler.jsonc` or create a `.env` file:
```bash
# Required
SPONSOR_PRIVATE_KEY=0x...

# Optional (defaults are configured in wrangler.jsonc)
TEMPO_RPC_URL=https://rpc.testnet.tempo.xyz
TEMPO_RPC_USERNAME=eng
TEMPO_RPC_PASSWORD=zealous-mayer
ALLOWED_ORIGINS=*
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
- `SPONSOR_PRIVATE_KEY`: Private key of the sponsor account

**Note**: RPC credentials (`TEMPO_RPC_USERNAME` and `TEMPO_RPC_PASSWORD`) are currently configured in `wrangler.jsonc`. For production deployments, consider moving these to secrets as well.

### Manual Deployment

```bash
# Deploy to staging
pnpm --filter tempo-sponsor deploy:staging

# Deploy to production
pnpm --filter tempo-sponsor deploy:production
```

## Configuration

The worker uses the following environment variables:

- `SPONSOR_PRIVATE_KEY`: Private key of the account that sponsors transactions (required, should be set as a Cloudflare secret)
- `TEMPO_RPC_URL`: RPC endpoint for Tempo network (default: https://rpc.testnet.tempo.xyz)
- `TEMPO_RPC_USERNAME`: Username for Tempo RPC basic auth (default: eng)
- `TEMPO_RPC_PASSWORD`: Password for Tempo RPC basic auth (default: zealous-mayer)
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

The worker exposes a single POST endpoint that accepts JSON-RPC requests. It supports two methods:

### Supported Methods

- `eth_sendRawTransaction`: Submits a transaction and returns immediately
- `eth_sendRawTransactionSync`: Submits a transaction and waits for confirmation

### Request
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "eth_sendRawTransaction",
  "params": ["0x76..."] // Serialized transaction
}
```

Or for synchronous submission:
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "eth_sendRawTransactionSync",
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

## Testing

The project includes an integration test that verifies the sponsor service is working correctly.

### Run Integration Tests

1. Start the development server:
```bash
pnpm dev
```

2. In another terminal, run the integration test:
```bash
pnpm test:integration
```

The test will:
- Create a test transaction with a fee payer
- Submit it to the local sponsor service
- Verify the transaction is successfully sponsored and submitted

You can configure the test with environment variables:
- `SPONSOR_URL`: URL of the sponsor service (default: http://localhost:8787)
- `TEST_PRIVATE_KEY`: Private key for the test sender account

## Sponsor Account

Address: `0xf364A31ACF9B7ae96e428e55e4FBE1af8962bc8a`

This account needs to be funded with the appropriate fee token to sponsor transactions.

## Security Notes

### Current Limitations
- This service sponsors ALL incoming transactions without restrictions
- No rate limiting or transaction amount limits
- No allowlists or authentication required
- CORS allows all origins by default (configurable via `ALLOWED_ORIGINS`)

### Production Recommendations
- Ensure the sponsor account is adequately funded but not overfunded
- Monitor usage and costs regularly
- Consider implementing rate limiting or allowlists for production use
- Implement authentication for the sponsor endpoint
- Restrict CORS origins to known client applications

### Development Security
⚠️ **Warning**: The current configuration includes hardcoded RPC credentials in `wrangler.jsonc` and a test private key in `.env`. These are suitable for development/testing only:
- Never commit real production credentials to version control
- Use Cloudflare secrets for production deployments
- Rotate credentials if accidentally exposed
- Ensure `.env` is in `.gitignore` for any production keys