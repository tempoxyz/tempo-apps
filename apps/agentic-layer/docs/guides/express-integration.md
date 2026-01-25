# Express.js Integration

**Secure API Monetization for Node.js Environments.**

The `@tempo/402-server` package provides a standardized middleware for Express.js, enabling developers to gate premium resources behind verifiable AlphaUSD transactions on the Tempo network.

---

## Installation

Add the server framework to your Node.js environment:

```bash
npm install @tempo/402-server
```

---

## Implementing the Settlement Barrier

The `createPaymentGate` factory generates a standard Express `RequestHandler`. It manages the 402 challenge lifecycle and transaction verification autonomously.

### Configuration via Environment
Use the `loadConfigFromEnv()` helper to initialize the gate with settings from your environment variables (`TEMPO_RECIPIENT`, `TEMPO_AMOUNT`, etc.).

```typescript
import express from 'express';
import { createPaymentGate, loadConfigFromEnv } from '@tempo/402-server';

const app = express();
const gate = createPaymentGate(loadConfigFromEnv());

// 🛡️ Apply protection to premium routes
app.get('/api/v1/premium-data', gate, (req, res) => {
    res.json({ message: 'Authorized access to premium payload.' });
});

app.listen(3000);
```

---

## Accessing Settlement Metadata

Upon successful verification, the middleware attaches a `payment` context to the request. This provides upstream handlers with immutable proof of settlement.

```typescript
import { type PaymentRequest } from '@tempo/402-server';

app.get('/v1/secure-trace', gate, (req: PaymentRequest, res) => {
    const { txHash } = req.payment || {};
    res.json({ 
        status: 'Settled', 
        transaction: txHash 
    });
});
```

---

## Infrastructure Resilience

Verification depends on the stability of the Tempo Moderato RPC. If the network is unreachable, the middleware responds with a structured **503 Service Unavailable** error. This indicates a temporary infrastructure discontinuity and signals the agent to retry.

---

[Pluggability Guide](./pluggability.md) | [Documentation Portal](../README.md)
