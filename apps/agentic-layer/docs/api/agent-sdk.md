# Agent SDK Reference

**Autonomous Financial Settlement for AI Agents.**

The `@tempo/402-sdk` provides a robust, deterministic framework for AI agents to navigate the 402 Settlement Barrier. It abstracts the complexity of blockchain interactions, allowing agents to focus on task execution while maintaining financial compliance.

---

## `Agent` (Class)

The `Agent` class is the primary orchestrator for outbound settlement requests.

### Constructor

```typescript
const agent = new Agent(config: TempoAgentConfig);
```

#### `TempoAgentConfig` Specifications

| Property | Type | Requirement | Description |
|:---|:---|:---|:---|
| `privateKey` | `Hex` | Conditional | 64-character hex string. Required if `walletClient` is not provided. |
| `walletClient` | `WalletClient` | Conditional | A [viem](https://viem.sh) Wallet Client. Required if `privateKey` is not provided. |
| `publicClient` | `PublicClient` | Optional | A [viem](https://viem.sh) Public Client for reading chain state. |
| `rpcUrl` | `string` | Optional | Tempo Moderato RPC endpoint. Defaults to network standard. |
| `feeToken` | `Hex` | Optional | AlphaUSD contract address. Defaults to standard deployment. |
| `txTimeout` | `number` | Optional | Settlement confirmation window (ms). Default: `60000`. |
| `logger` | `Logger` | Optional | Institutional logging instance. Defaults to `SilentLogger`. |

---

### Methods

#### `request<T>(config: AxiosRequestConfig): Promise<AxiosResponse<T>>`

Executes an HTTP request with automatic 402 challenge resolution.

1. **Detection**: Intercepts `402 Payment Required` responses.
2. **Analysis**: Decodes the `WWW-Authenticate` header and `paymentInfo` payload.
3. **Execution**: Signs and broadcasts an AlphaUSD transfer on Tempo Moderato.
4. **Validation**: Monitors the network for 1 confirmation.
5. **Finalization**: Retries the original request with the `Authorization: Tempo <txHash>` header.

**Throws**: `PaymentFailureError` upon settlement failure or verification timeout.

---

## `PaymentFailureError` (Class)

A specialized exception for handling settlement discontinuities. Preserves original error context for diagnostic traceability.

### Properties
- `name`: Fixed to `PaymentFailureError`.
- `message`: Specific failure reason.
- `originalError`: The underlying Axios or RPC exception.

---

## Institutional Guardrails

### Input Validation
The SDK performs synchronous validation of all configuration parameters:
- `privateKey`: Enforces 0x-prefixed 64-character hex format.
- `rpcUrl`: Enforces valid URL schema.
- `feeToken`: Enforces 0x-prefixed 40 address format.

### Error Handling
The framework handles non-standard status codes gracefully. While `402` is handled automatically, `5xx` and other infrastructure errors are bubbled up for agentic fallback strategy execution.

---

Next: [Server Middleware Reference](./server-middleware.md) | [Architecture Overview](../architecture.md)
