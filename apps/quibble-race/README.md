# Quibble Race

Browser game prototype for wagering on a quibble race with Tempo-settled buy-ins.

## Development

```bash
pnpm install
pnpm --filter quibble-race dev
```

The current implementation keeps the race loop client-side and exposes a mock Tempo settlement rail in the UI. The payment boundary is isolated in `buildTempoPaymentPayload` so it can be wired to the production wallet and contract flow without changing game state logic.
