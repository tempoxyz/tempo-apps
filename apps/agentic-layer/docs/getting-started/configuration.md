# Configuration Specifications

**Deterministic Configuration for Autonomous Reliability.**

The Tempo Agentic Layer is engineered with security-first defaults and supports both environment-driven and programmatic configuration. This ensure that service providers and agents can maintain operational consistency across diverse deployment environments.

---

## Environment Variables

Global settings can be defined using `TEMPO_` prefixed environment variables. To utilize these in the middleware, you must utilize the `loadConfigFromEnv()` utility from the `@tempo/402-server` (or common) package.

| Variable | Description | Default |
|:---|:---|:---|
| `TEMPO_RECIPIENT` | Authorized EVM address for AlphaUSD settlement. | - |
| `TEMPO_AMOUNT` | Settlement fee in atomic units (e.g., `1000000`). | - |
| `TEMPO_RPC_URL` | Tempo Moderato JSON-RPC endpoint. | - |
| `TEMPO_TOKEN` | AlphaUSD contract address. | Standard Deployment |
| `TEMPO_ALLOWED_AGE_SECONDS`| Maximum age (s) for valid transactions. | `300` (5 mins) |

---

## Middleware Configuration (Server)

Server-side middleware requires a configuration object. You can either construct this manually or load it from the environment.

### Example: Dynamic Fee Adjustment
```typescript
app.use(createPaymentGate({
    amount: fetchDynamicFee(), // Override environment default
    logger: institutionalLogger
}));
```

### `GateConfig` Interface
The configuration object supports injection of custom security primitives:
- `replayCache`: An instance of `ReplayProtection` for cryptographic hash tracking.
- `coalescer`: An instance of `VerificationCoalescer` for request deduplication.

---

## Agent SDK Configuration (Client)

The `Agent` configuration ensures that autonomous signers have the necessary context to navigate settlement challenges.

```typescript
const agent = new Agent({
    privateKey: '0x...',       // Strategic signer key
    rpcUrl: 'https://...',     // Explicit RPC endpoint
    feeToken: '0x...',         // Explicit AlphaUSD address
    txTimeout: 60000,          // Confirmation window in ms
    logger: customLogger       // Telemetry integration
});
```

---

## Fail-Fast Validation

To prevent configuration drift and operational downtime, the framework executes strict validation on initialization. If mandatory parameters are missing or malformed, a `PaymentConfigError` is thrown with clear remediation steps.

```json
{
    "code": "PAYMENT_CONFIG_ERROR",
    "message": "Missing required configuration: recipient",
    "fix": "Define TEMPO_RECIPIENT in .env or provide it in the GateConfig object."
}
```

---

Next: [API Reference](../api/agent-sdk.md) | [Architecture Overview](../architecture.md)
