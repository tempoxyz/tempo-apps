# Documentation Portal

**Technical Documentation for the Tempo Agentic Layer.**

Welcome to the documentation portal. This site contains the technical specifications and integration guides required to implement and manage 402-layer settlement for autonomous agent services.

---

## 🧭 Navigation

### Fundamentals
- [**Architecture Overview**](./architecture.md) — The 402 Settlement Barrier and protocol flow.
- [**Quick Start Guide**](./getting-started/quickstart.md) — 5-minute integration for developers.
- [**Configuration Reference**](./getting-started/configuration.md) — Environment variables and security defaults.

### Integration Guides
- [**Pluggability Guide**](./guides/pluggability.md) — Comprehensive guide for custom integration patterns (Next.js, Fastify, AI Tools).
- [**Express.js Integration**](./guides/express-integration.md) — Technical guide for Node.js API monetization.
- [**Hono Integration**](./guides/hono-integration.md) — Performance-first edge API workflows.
- [**Production Checklist**](./guides/production.md) — Security hardening and RPC optimization.

### API Reference
- [**Agent SDK**](./api/agent-sdk.md) — Autonomous client specifications and error handling.
- [**Server Middleware**](./api/server-middleware.md) — Middleware configuration and verification logic.
- [**Error Schema**](./api/errors.md) — Protocol-level error codes and remediation strategies.

---

## 🔒 Security Specifications

The Agentic Layer is engineered for technical reliability and security:
- **HTTP 402 Standard**: RFC-compliant implementation for Payment Required workflows.
- **Settlement Finality**: Leveraging AlphaUSD on Tempo Moderato for deterministic transactions.
- **Replay Protection**: Cryptographic enforcement against transaction hash reuse.

---

## 🤝 Support & Ecosystem

- [**GitHub Repository**](https://github.com/tempo/agentic-layer) — Source code and issues.
- [**Tempo Network**](https://tempo.xyz) — Details on the underlying settlement layer.
- [**Mission Control**](./examples/README.md) — Visualization and demo environments.

---

© 2026 Tempo Foundation. All rights reserved.

