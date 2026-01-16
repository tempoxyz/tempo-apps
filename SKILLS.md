# Tempo Apps Skills

Skills for AI agents to build full-stack Tempo applications.

---

## tempo-fullstack

**Description**: Build complete Tempo web applications with React frontend and Cloudflare Workers backend.

### Workflow

1. **Understand the requirements**
   - What does the app do?
   - Which Tempo features does it need? (TIP-20 tokens, fee sponsorship, payments)
   - Does it need a database (D1), storage (R2), or real-time features (Durable Objects)?

2. **Scaffold the app**
   ```bash
   mkdir -p apps/{app-name}/src
   ```

3. **Copy boilerplate from explorer**
   - `package.json` (adjust name and dependencies)
   - `tsconfig.json`
   - `wrangler.jsonc`
   - `vite.config.ts`
   - `.env.example`
   - `.gitignore`

4. **Implement the app**
   - Start with `src/index.ts` for API-only apps
   - Use TanStack Start for full-stack apps with SSR

5. **Test locally**
   ```bash
   pnpm dev
   ```

6. **Deploy**
   ```bash
   pnpm deploy
   ```

### Key Files

| File | Purpose |
|------|---------|
| `src/index.ts` | Worker entrypoint |
| `wrangler.jsonc` | Cloudflare config |
| `vite.config.ts` | Build config |
| `env.d.ts` | Environment types |

---

## tempo-payments

**Description**: Implement IETF Payment Authorization (402) for paid APIs and content.

### When to Use

- Monetizing API endpoints
- Gating premium content
- Pay-per-use services
- Subscription verification

### Implementation

```typescript
import { paymentAuth } from '@paymentauth/hono'
import { createPublicClient, http } from 'viem'
import { tempoModerato } from 'tempo.ts/chains'

const client = createPublicClient({
  chain: tempoModerato,
  transport: http()
})

app.get('/api/premium', paymentAuth({
  method: 'tempo',
  realm: 'my-service',
  destination: env.PAYMENT_ADDRESS,
  asset: '0x20c0000000000000000000000000000000000001', // AlphaUSD
  amount: '100000', // $0.10
  description: 'Access to premium API',
  
  async verify(signedTx, request) {
    // Decode and validate the transaction
    const tx = parseTransaction(signedTx)
    
    // Check destination, amount, asset match
    if (tx.to !== request.destination) return { valid: false }
    if (tx.value < BigInt(request.amount)) return { valid: false }
    
    return { valid: true, from: tx.from }
  },
  
  async broadcast(signedTx) {
    try {
      const hash = await client.sendRawTransaction({ 
        serializedTransaction: signedTx 
      })
      return { success: true, transactionHash: hash }
    } catch (error) {
      return { success: false, error: error.message }
    }
  },
  
  async confirm(txHash) {
    const receipt = await client.waitForTransactionReceipt({ hash: txHash })
    return { blockNumber: receipt.blockNumber }
  }
}), (c) => {
  const payment = c.get('payment')
  return c.json({ 
    data: 'Premium content here',
    paidBy: payment.payer,
    txHash: payment.txHash
  })
})
```

### Dependencies

```json
{
  "dependencies": {
    "@paymentauth/hono": "workspace:*",
    "@paymentauth/protocol": "workspace:*"
  }
}
```

---

## tempo-onramp

**Description**: Integrate fiat-to-crypto onramp for user funding flows.

### Implementation

```typescript
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import * as z from 'zod'

const app = new Hono()

const orderSchema = z.object({
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  amount: z.number().min(5).max(10000),
  email: z.string().email().optional(),
})

app.post('/onramp/order', zValidator('json', orderSchema), async (c) => {
  const { address, amount, email } = c.req.valid('json')
  
  // Create Coinbase onramp order
  const response = await fetch('https://api.coinbase.com/onramp/v1/orders', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${await generateJWT(env.CB_API_KEY_ID, env.CB_API_KEY_SECRET)}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      destination_address: address,
      destination_network: 'tempo',
      purchase_amount: { value: amount.toFixed(2), currency: 'USD' },
      user: { email: email ?? `${address.slice(0, 10)}@tempo.xyz` }
    })
  })
  
  const order = await response.json()
  return c.json({ orderId: order.id, redirectUrl: order.redirect_url })
})
```

### Required Secrets

```bash
wrangler secret put CB_API_KEY_ID
wrangler secret put CB_API_KEY_SECRET
```

---

## tempo-fee-sponsor

**Description**: Implement gas-free transactions with fee sponsorship.

### When to Use

- Onboarding new users (no gas needed)
- Simplifying UX for non-crypto users
- Enterprise/B2B transaction sponsorship

### Implementation

```typescript
import { Handler } from 'tempo.ts/server'
import { privateKeyToAccount } from 'viem/accounts'
import { tempoModerato } from 'tempo.ts/chains'
import { http } from 'viem'

// Worker handles JSON-RPC requests for fee sponsorship
const handler = Handler.feePayer({
  account: privateKeyToAccount(env.SPONSOR_PRIVATE_KEY),
  chain: tempoModerato,
  transport: http(env.TEMPO_RPC_URL),
  
  // Optional: filter which transactions to sponsor
  async onRequest(request) {
    // Log, rate limit, or reject requests
    console.log(`Sponsoring: ${request.method}`)
    
    // Return false to reject sponsorship
    // return false
  }
})

app.all('/sponsor/*', async (c) => handler.fetch(c.req.raw))
```

### Client-Side Integration

```typescript
import { createWalletClient, http } from 'viem'
import { tempoModerato } from 'tempo.ts/chains'
import { sponsoredTransport } from 'tempo.ts/sponsored'

const client = createWalletClient({
  chain: tempoModerato,
  transport: sponsoredTransport({
    sponsorUrl: 'https://sponsor.tempo.xyz',
    fallback: http()
  })
})

// Transactions are automatically sponsored
await client.sendTransaction({ to: '0x...', value: 0n })
```

---

## tempo-activity

**Description**: Query on-chain activity and transaction history using IDXS.

### Implementation

```typescript
import { Idxs } from 'idxs'

const idxs = new Idxs()

// Get transfer history for an address
async function getTransferHistory(address: string) {
  const transfers = await idxs.query({
    chain: 'tempo',
    signature: 'event Transfer(address indexed from, address indexed to, uint256 value)',
    limit: 100,
  })
  
  return transfers.filter(t => 
    t.from === address.toLowerCase() || t.to === address.toLowerCase()
  )
}

// Get recent swaps
async function getRecentSwaps() {
  return idxs.query({
    chain: 'tempo',
    signature: 'event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)',
    limit: 50,
  })
}

// Raw SQL for complex queries
async function getTopSenders(tokenAddress: string) {
  return idxs.sql(`
    SELECT "from", count(*) as tx_count, sum(value) as total_value
    FROM transfer 
    WHERE chain = 111557750 AND address = '${tokenAddress}'
    GROUP BY "from"
    ORDER BY tx_count DESC
    LIMIT 10
  `, {
    signature: 'event Transfer(address indexed from, address indexed to, uint256 value)'
  })
}
```

---

## tempo-subscription

**Description**: Implement subscription services with cron-triggered renewals.

### Worker with Cron

```jsonc
// wrangler.jsonc
{
  "triggers": {
    "crons": ["0 0 * * *"]  // Daily at midnight
  },
  "d1_databases": [
    { "binding": "DB", "database_name": "subscriptions", "database_id": "..." }
  ]
}
```

### Implementation

```typescript
import { Hono } from 'hono'

const app = new Hono()

// Create subscription
app.post('/subscribe', async (c) => {
  const { address, plan, accessKeyAddress } = await c.req.json()
  
  await env.DB.prepare(`
    INSERT INTO subscriptions (address, plan, access_key, expires_at, created_at)
    VALUES (?, ?, ?, datetime('now', '+30 days'), datetime('now'))
  `).bind(address, plan, accessKeyAddress).run()
  
  return c.json({ success: true })
})

// Check subscription
app.get('/subscription/:address', async (c) => {
  const { address } = c.req.param()
  
  const sub = await env.DB.prepare(`
    SELECT * FROM subscriptions 
    WHERE address = ? AND expires_at > datetime('now')
  `).bind(address).first()
  
  return c.json({ active: !!sub, subscription: sub })
})

// Scheduled renewal processing
export default {
  async fetch(request, env, ctx) {
    return app.fetch(request, env, ctx)
  },
  
  async scheduled(event, env, ctx) {
    // Find expiring subscriptions
    const expiring = await env.DB.prepare(`
      SELECT * FROM subscriptions 
      WHERE expires_at BETWEEN datetime('now') AND datetime('now', '+1 day')
      AND auto_renew = 1
    `).all()
    
    for (const sub of expiring.results) {
      // Charge using access key
      const result = await chargeAccessKey(sub.access_key, sub.plan_price)
      
      if (result.success) {
        await env.DB.prepare(`
          UPDATE subscriptions 
          SET expires_at = datetime(expires_at, '+30 days')
          WHERE id = ?
        `).bind(sub.id).run()
      }
    }
  }
}
```

---

## tempo-passkey

**Description**: Implement passkey-based authentication for wallet-less onboarding.

### Flow

1. User registers with passkey (WebAuthn)
2. Server creates a Tempo smart wallet for the user
3. Passkey signs transactions on behalf of the wallet

### Implementation

```typescript
import { startRegistration, startAuthentication } from '@simplewebauthn/browser'

// Registration flow
app.post('/auth/register/options', async (c) => {
  const options = await generateRegistrationOptions({
    rpName: 'Tempo App',
    rpID: 'app.tempo.xyz',
    userID: crypto.randomUUID(),
    userName: 'user@example.com',
  })
  
  // Store challenge in KV
  await env.KV.put(`challenge:${options.challenge}`, JSON.stringify(options), { expirationTtl: 300 })
  
  return c.json(options)
})

app.post('/auth/register/verify', async (c) => {
  const { credential, challenge } = await c.req.json()
  
  const options = JSON.parse(await env.KV.get(`challenge:${challenge}`))
  
  const verification = await verifyRegistrationResponse({
    response: credential,
    expectedChallenge: challenge,
    expectedOrigin: 'https://app.tempo.xyz',
    expectedRPID: 'app.tempo.xyz',
  })
  
  if (verification.verified) {
    // Create Tempo wallet for user
    const wallet = await createSmartWallet(verification.registrationInfo.credentialPublicKey)
    
    // Store credential
    await env.DB.prepare(`
      INSERT INTO users (credential_id, public_key, wallet_address)
      VALUES (?, ?, ?)
    `).bind(
      verification.registrationInfo.credentialID,
      verification.registrationInfo.credentialPublicKey,
      wallet.address
    ).run()
    
    return c.json({ address: wallet.address })
  }
  
  return c.json({ error: 'Verification failed' }, 400)
})
```

---

## tempo-ui

**Description**: Build consistent UI components with Tailwind CSS v4 and CVA.

### Component Patterns

```typescript
// src/components/Button.tsx
import { cva, type VariantProps } from 'cva'

const button = cva({
  base: [
    'inline-flex items-center justify-center gap-2',
    'rounded-lg font-medium transition-all',
    'focus:outline-none focus:ring-2 focus:ring-offset-2',
    'disabled:opacity-50 disabled:cursor-not-allowed',
  ],
  variants: {
    variant: {
      primary: 'bg-blue-500 text-white hover:bg-blue-600 focus:ring-blue-500',
      secondary: 'bg-gray-100 text-gray-900 hover:bg-gray-200 focus:ring-gray-500',
      ghost: 'hover:bg-gray-100 focus:ring-gray-500',
      danger: 'bg-red-500 text-white hover:bg-red-600 focus:ring-red-500',
    },
    size: {
      sm: 'h-8 px-3 text-sm',
      md: 'h-10 px-4',
      lg: 'h-12 px-6 text-lg',
    },
  },
  defaultVariants: {
    variant: 'primary',
    size: 'md',
  },
})

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof button> {
  loading?: boolean
}

export function Button({ variant, size, loading, children, ...props }: ButtonProps) {
  return (
    <button className={button({ variant, size })} disabled={loading} {...props}>
      {loading && <Spinner className="h-4 w-4" />}
      {children}
    </button>
  )
}
```

### Theme Setup

```css
/* src/app.css */
@import 'tailwindcss';
@import 'tw-animate-css';

@theme {
  /* Colors */
  --color-tempo-bg: #0A0A0B;
  --color-tempo-surface: #141416;
  --color-tempo-border: #27272A;
  --color-tempo-text: #FAFAFA;
  --color-tempo-muted: #71717A;
  --color-tempo-accent: #3B82F6;
  
  /* Spacing */
  --spacing-page: 1rem;
  
  /* Border radius */
  --radius-card: 0.75rem;
}

@layer base {
  body {
    @apply bg-tempo-bg text-tempo-text antialiased;
  }
}
```

### wagmi Integration

```typescript
// src/lib/wagmi.ts
import { createConfig, http } from 'wagmi'
import { tempoModerato } from 'tempo.ts/chains'
import { injected, walletConnect } from 'wagmi/connectors'

export const config = createConfig({
  chains: [tempoModerato],
  connectors: [
    injected(),
    walletConnect({ projectId: 'YOUR_PROJECT_ID' }),
  ],
  transports: {
    [tempoModerato.id]: http(),
  },
})

// In your app
import { WagmiProvider } from 'wagmi'
import { QueryClientProvider } from '@tanstack/react-query'

function App() {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <YourApp />
      </QueryClientProvider>
    </WagmiProvider>
  )
}
```

---

## Local Development

### OrbStack + Custom Domains

For local development with custom domains and HTTPS:

1. Install OrbStack
2. Add to `/etc/hosts`: `127.0.0.1 app.local.tempo.xyz`
3. Use `mkcert` for local HTTPS certificates

### Tailscale for Device Testing

Expose local dev server via Tailscale for testing features like Apple Pay:

```bash
# Start dev server
pnpm dev

# Expose via Tailscale (in another terminal)
tailscale funnel 3000
```

---

## Checklist for New Apps

- [ ] Create app folder in `apps/`
- [ ] Set up `package.json` with catalog dependencies
- [ ] Configure `wrangler.jsonc` with environments
- [ ] Add to CI matrix in `.github/workflows/main.yml`
- [ ] Add to README table
- [ ] Test locally with `pnpm dev`
- [ ] Deploy to moderato first: `wrangler deploy --env moderato`
