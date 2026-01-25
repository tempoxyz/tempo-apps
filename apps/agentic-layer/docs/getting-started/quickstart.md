# Developer Quick Start

**High-Performance Integration for the Autonomous Economy.**

Initialize the Tempo Agentic Layer in minutes to enable secure, verifiable financial settlement for your services and agents.

---

## Prerequisites

- **Node.js**: Version 20 or higher.
- **npm**: Standard installation.

---

## 1. Installation

Deploy the necessary framework components for your environment:

```bash
# Infrastructure: For Node.js (Express, Hono, Next.js, Fastify)
npm install @tempo/402-server

# Client: For Autonomous Signers and Agents
npm install @tempo/402-sdk
```

---

## 2. Server-Side Protection

Protect your API resources using the "Settlement Barrier" middleware.

### Configure the Environment
Create a `.env` file in your root directory:

```bash
TEMPO_RECIPIENT=0xYourAuthorizedWallet
TEMPO_AMOUNT=100000        # Requirement in atomic units (0.10 AlphaUSD)
TEMPO_RPC_URL=https://rpc.moderato.tempo.xyz
```

### Implement via Next.js (Example)
```typescript
import { with402 } from '@tempo/402-server';
import { NextResponse } from 'next/server';

export const GET = with402({
    recipient: process.env.TEMPO_RECIPIENT!,
    amount: process.env.TEMPO_AMOUNT!,
    rpcUrl: process.env.TEMPO_RPC_URL!
}, async (request) => {
    return NextResponse.json({ data: "Premium Content" });
});
```

---

## 3. Autonomous Client Settlement

Enable your agent to autonomously navigate 402 challenges.

```typescript
import { TempoAgent } from '@tempo/402-sdk';

const agent = new TempoAgent({
    privateKey: process.env.AGENT_KEY as `0x${string}`,
    rpcUrl: 'https://rpc.moderato.tempo.xyz'
});

async function runTask() {
    try {
        // 🤖 Agentic Request: The SDK automatically handles the 402 flow
        const response = await agent.request({ 
            url: 'https://api.your-service.com/premium-resource' 
        });
        
        console.log('Success:', response.data);
    } catch (error) {
        console.error('Settlement Failure:', error.message);
    }
}

runTask();
```

---

## Next Steps

- **[Pluggability Guide](../guides/pluggability.md)** — Integration with Fastify, LangChain, and native `fetch`.
- **[Configuration Reference](./configuration.md)** — Security hardening and environment variables.

