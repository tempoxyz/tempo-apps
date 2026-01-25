# Installation Guide 📦

Learn how to install the Tempo Agentic Layer in your project.

## Package Manager Requirement

The Tempo Agentic Layer is optimized for [pnpm](https://pnpm.io/). While `npm` and `yarn` might work, `pnpm` is highly recommended for better monorepo support and deterministic builds.

---

## 🛡️ Server Middleware

Monetize your backend with the `@tempo/402-server` package.

### Node.js (Express, Hono, Fastify)

```bash
pnpm add @tempo/402-server @tempo/402-common
```

If using Express, also install types:
```bash
pnpm add -D @types/express
```

---

## 🤖 Agent SDK

Enable autonomous payments in your client or AI agent.

### Client-side (Node.js, Browser)

```bash
pnpm add @tempo/402-sdk @tempo/402-common
```

**Note**: The SDK depends on `viem` for blockchain interactions. It is bundled, so no additional setup is required.

---

## 🛠️ Monorepo Setup (For Contributors)

If you are cloning this repository to build or contribute:

1. Clone the repository:
   ```bash
   git clone https://github.com/tempo/tempo-apps.git
   cd tempo-apps/apps/agentic-layer
   ```

2. Install dependencies (from root):
   ```bash
   cd ../../../
   pnpm install
   ```

3. Build the packages:
   ```bash
   cd apps/agentic-layer
   pnpm build
   ```

4. Run tests:
   ```bash
   pnpm test
   ```
