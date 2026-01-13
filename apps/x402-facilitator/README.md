# x402 Facilitator

x402 payment protocol facilitator for Tempo blockchain.

## Development

```bash
pnpm dev
```

## Deploy

```bash
pnpm deploy:testnet    # Deploy to testnet
pnpm deploy:devnet     # Deploy to devnet
pnpm deploy:moderato   # Deploy to moderato
```

## Environment Variables

- `SPONSOR_PRIVATE_KEY` - Private key for fee payer account
- `TEMPO_RPC_URL` - Tempo RPC endpoint
- `TEMPO_ENV` - Environment (testnet, devnet, moderato)
- `FEE_TOKEN` - TIP-20 token address for fee payment
- `ALLOWED_ORIGINS` - CORS allowed origins (\* for all)

## API Endpoints

- `GET /health` - Health check
- `GET /payment-requirements` - Get payment requirements
- `POST /verify` - Verify payment payload
- `POST /settle` - Settle payment transaction
