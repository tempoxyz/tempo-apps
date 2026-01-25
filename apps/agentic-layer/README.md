# Tempo Agentic Layer

**A Protocol for Autonomous Financial Settlement.**

The Tempo Agentic Layer is a technical framework designed to bridge autonomous AI agents with the Tempo financial network. By implementing a standardized HTTP 402 (Payment Required) workflow, it enables agents to settle service fees using **AlphaUSD** stablecoins on Tempo Moderato with deterministic settlement finality.

---

## 🏛️ Architecture

Tempo Agentic Layer is built as a lightweight, modular monorepo providing end-to-end settlement infrastructure:

- **[`@tempo/402-sdk`](./packages/sdk)** — Core logic for resolving 402 challenges. Now includes framework-agnostic `SettlementHandler`, native `fetch` support, and AI tool definitions for LangChain/OpenAI.
- **[`@tempo/402-server`](./packages/server)** — Universal middleware for 402 authorization. Supports **Express**, **Hono**, **Next.js (App Router)**, and **Fastify**.
- **[`@tempo/402-common`](./packages/common)** — Core primitives, shared types, and utility functions.

## 🛡️ Institutional-Grade Features

Designed for the rigors of autonomous operations, the framework prioritizes security and efficiency:

- **Settlement Finality**: Native support for AlphaUSD on Tempo Moderato ensures immutable payment confirmation.
- **Pluggable Integration**: Decoupled handlers allow integration into any stack, from legacy Node.js APIs to modern Edge functions and AI agents.
- **Replay Protection**: Cryptographic enforcement prevents the reuse of transaction hashes for authorization.
- **Verification Coalescing**: Efficient deduplication of concurrent verification requests to minimize RPC overhead.

## Quick Start

> [!TIP]
> For a rapid deployment overview, refer to the [Quick Setup Guide](./docs/getting-started/QUICK-SETUP.md).

### 1. Initialize the Environment
From the monorepo root:
```bash
npm install
npm run build
```

### 2. Implementation Overview
- **Client**: Use `SettlementHandler` to resolve 402 challenges.
- **Server**: Apply the `fourZeroTwo` (Hono) or `with402` (Next.js) middleware to your premium routes.

For a complete walkthrough, see the [Pluggability Guide](./docs/guides/pluggability.md).

## 📚 Documentation
For detailed integration guides and API references, visit the [Documentation Portal](./docs/README.md).

---

## ⚖️ License
MIT © 2026 Tempo Foundation

