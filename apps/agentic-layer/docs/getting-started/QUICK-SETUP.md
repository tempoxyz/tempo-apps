# ⚡ Quick Setup

Get the Tempo Agentic Layer running in 60 seconds.

## 1. Prerequisites
- **Node.js**: v20+
- **pnpm**: `npm install -g pnpm`

## 2. One-Command Setup
From the **monorepo root**:
```bash
npm run setup:agentic
```

## 3. Build & Run
```bash
pnpm build
cd apps/agentic-layer/examples/demo
pnpm run start:server:express
```

## 4. Verify
Open `http://localhost:3000` to see the 402 challenge flow in action.

---
For detailed integration steps, see [Full Quick Start](./quickstart.md).
