# Server Middleware Reference

**Server-Side Middleware Specifications.**

The `@tempo/402-server` package provides the technical primitives to gate API resources behind a 402 Settlement flow. It is optimized for multi-instance environments, prioritizing security through replay protection and efficiency through verification coalescing.

---

## Express Middleware

### `createPaymentGate(config: ExpressGateConfig)`

Returns an Express-compatible `RequestHandler` that enforces financial settlement.

#### `ExpressGateConfig` Specifications

| Property | Requirement | Description |
|:---|:---|:---|
| `recipient` | **Required** | The wallet address authorized to receive AlphaUSD. |
| `amount` | **Required** | The required fee in atomic units (BigInt string). |
| `rpcUrl` | **Required** | Tempo Moderato RPC endpoint. |
| `token` | Optional | AlphaUSD contract address. Defaults to standard. |
| `allowedAgeSeconds` | Optional | Maximum age for transaction validity. Default: `300s`. |
| `replayCache` | Optional | Custom `ReplayProtection` instance. |
| `coalescer` | Optional | Custom `VerificationCoalescer` instance. |
| `logger` | Optional | Institutional logging instance. |

---

## Hono Middleware

The middleware is also available for [Hono](https://hono.dev) via the `fourZeroTwo` export, supporting edge-computing and high-performance API architectures.

```typescript
import { fourZeroTwo } from '@tempo/402-server';

app.use('/premium/*', fourZeroTwo({
    recipient: '0x...',
    amount: '1000000',
    rpcUrl: process.env.RPC_URL
}));
```

---

## Security & Performance Primitives

### `ReplayProtection` (Class)
Prevents "Replay Attacks" by maintaining an in-memory cache of verified transaction hashes. The cache enforces a TTL (Time-To-Live) aligned with the `allowedAgeSeconds` config.

- **`markUsed(txHash: string): boolean`**: Returns `true` if the hash is unique and successfully marked; `false` if the hash has been previously seen.

### `VerificationCoalescer` (Class)
Deduplicates concurrent verification attempts for the same transaction hash. This ensures that a surge in traffic does not result in redundant RPC calls to the Tempo network.

---

## Verifier

### `verifyPaymentHash(txHash: string, config: PaymentGateConfig)`
The underlying verification logic extracted from the middleware for standalone use. It performs atomic checks on transaction existence, recipient, amount, token, and finality status.

---

## Configuration Utilities

### `loadConfigFromEnv()`
A helper function that automatically pulls configuration from environment variables (prefixed with `TEMPO_`). This is the recommended way to initialize the middleware for zero-config deployments.

- **Returns**: A `Partial<PaymentGateConfig>` object populated from current environment state.

---

Next: [Error Schema Reference](./errors.md) | [Architecture Overview](../architecture.md)
