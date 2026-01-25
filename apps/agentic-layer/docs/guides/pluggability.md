# Pluggability & Integration Patterns

**Architectural flexibility for the autonomous economy.**

The Tempo Agentic Layer is engineered as a set of decoupled primitives. This design ensures that the 402 Settlement protocol can be integrated into any existing stack—from legacy APIs to modern Edge functions and autonomous AI agent workflows.

---

## 🏛️ SDK Integration Patterns

### 1. Framework-Agnostic Settlement
For environments where `TempoAgent` (Axios-based) is not ideal, use the `SettlementHandler` directly to orchestrate on-chain settlement.

```typescript
import { SettlementHandler } from '@tempo/402-sdk';

const settlement = new SettlementHandler({
    publicClient,
    walletClient,
    rpcUrl: process.env.TEMPO_RPC_URL
});

// Manual 402 Resolution
const txHash = await settlement.settle(paymentRequirement);
```

### 2. Native Fetch Interceptor
The `createFetch` utility provides a thin wrapper around the native `fetch` API, automatically resolving 402 challenges.

```typescript
import { SettlementHandler, createFetch } from '@tempo/402-sdk';

const settlement = new SettlementHandler({ ... });
const authFetch = createFetch(settlement);

// Transparently handles 402 retries
const response = await authFetch('https://api.premium-service.com/data');
```

### 3. AI Agent Tooling (LangChain / OpenAI)
Monetize your agent's interactions by integrating settlement as a standard tool.

```typescript
import { SettlementHandler, createOpenAITool } from '@tempo/402-sdk';

const tools = [
    createOpenAITool(new SettlementHandler({ ... })).definition
];
```

---

## 🛡️ Server-Side Integration

### 1. Next.js (App Router)
Protect Route Handlers with the `with402` higher-order function.

```typescript
import { with402 } from '@tempo/402-server';

export const GET = with402({
    recipient: '0x...',
    amount: '1000',
    rpcUrl: '...'
}, async (req) => {
    return Response.json({ data: 'Premium Payload' });
});
```

### 2. Fastify Integration
Register the `@tempo/402-server-fastify` plugin to enforce settlement across entire namespaces.

```typescript
import { fastify402 } from '@tempo/402-server';

fastify.register(fastify402, {
    recipient: '0x...',
    amount: '1000',
    rpcUrl: '...'
});
```

### 3. Custom Middleware Construction
Use the framework-agnostic `handle402Request` helper to build custom protection for any Node.js or Edge framework.

```typescript
import { handle402Request, prepareGateConfig } from '@tempo/402-server';

const config = prepareGateConfig({ ... });

// Inside any request/response lifecycle
const result = await handle402Request(headers.get('authorization'), config);
if (!result.authorized) return response(result.body, result.status);
```
