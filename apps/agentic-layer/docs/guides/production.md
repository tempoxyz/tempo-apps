# Production Deployment Specifications

**Security Hardening and Operational Continuity for the Settlement Barrier.**

Before deploying the Tempo Agentic Layer to production environments, ensure that the following security and performance specifications are met. Adherence to these standards is critical for maintaining the integrity of the autonomous economy.

---

## 🛡️ Security Hardening

- **[ ] Signer Key Management**: Never expose private keys in source control or unencrypted environment files. Utilize a hardware security module (HSM) or a managed secrets provider (e.g., AWS Secrets Manager, Doppler).
- **[ ] Transport Layer Security**: All API traffic must be served via HTTPS. The standard 402 headers and Authorization tokens contain sensitive state transitions that must be encrypted in transit.
- **[ ] Cross-Origin Resource Sharing (CORS)**: Configure strict CORS policies to prevent unauthorized browser-based agents from interacting with your settlement infrastructure.
- **[ ] Persistent Replay Protection**: While the default middleware includes an in-memory cache, multi-instance or serverless deployments require a distributed persistence layer (e.g., Redis) to prevent cross-instance replay attacks.

---

## ⚡ Performance Optimization

- **[ ] RPC Infrastructure**: Utilize a private, high-availability RPC provider for the Tempo network. Public testnet endpoints are susceptible to rate-limiting and are unsuitable for professional service delivery.
- **[ ] Verification Coalescing**: Ensure that the `VerificationCoalescer` is enabled to prevent "request storms" from overwhelming your RPC infrastructure during peak settlement periods.
- **[ ] Protocol Timing**: Align `TEMPO_ALLOWED_AGE_SECONDS` with your typical block-finality requirements. A standard value of `300` (5 minutes) provides an optimal balance between agentic latency and security.

---

## 📈 Operational Telemetry

- **[ ] Institutional Logging**: Inject a formal logger (e.g., `pino`, `winston`) into the middleware. Monitor for verification failures, which may indicate signer misconfiguration or net-settlement discontinuities.
- **[ ] Infrastructure Monitoring**: Track the frequency of **503 Service Unavailable** responses. This metric is a direct indicator of RPC infrastructure health and network reachability.

---

## 🏗️ Production Environment Variables

Ensure that your production environment is configured with deterministic values for the settlement barrier:

```bash
TEMPO_RECIPIENT=0x...                     # Authorized recipient address
TEMPO_AMOUNT=1000000                      # Requirement in AlphaUSD atomic units
TEMPO_RPC_URL=https://rpc.tempo.xyz       # High-availability RPC endpoint
```

---

Next: [Architecture Overview](../architecture.md) | [Documentation Portal](../README.md)
