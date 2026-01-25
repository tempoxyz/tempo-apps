# Error Schema Reference

**Traceability and Error Mitigation for Autonomous Systems.**

The Tempo Agentic Layer utilizes a structured error schema designed for deterministic machine-analysis and rapid human-remediation. Every error contains sufficient context to allow autonomous agents to execute fallback strategies or escalate to human oversight.

---

## Standard Error Structure

Error payloads are standardized across the SDK and Middleware:

| Field | Type | Description |
|:---|:---|:---|
| `code` | `string` | Unique identifier for the error category. |
| `message` | `string` | Human-readable diagnostic message. |
| `context` | `object` | Machine-readable metadata (e.g., `txHash`, `rpcUrl`). |
| `fix` | `string` | Actionable remediation strategy. |

---

## Protocol Error Codes

### `PAYMENT_REQUIRED`
**HTTP Status**: `402`
**Description**: The requested resource requires financial settlement. This triggers the autonomous settlement flow in the SDK.
- **Remediation**: Execute an AlphaUSD transfer on Tempo Moderato according to the `paymentInfo` payload.

### `REPLAY_ERROR`
**HTTP Status**: `402`
**Description**: The provided transaction hash has already been used to satisfy a settlement barrier.
- **Remediation**: The agent must generate a new, unique transaction for the current request.

### `INVALID_TX_HASH`
**HTTP Status**: `400`
**Description**: The provided identifier does not match the cryptographic requirements for a Tempo transaction hash.
- **Remediation**: Verify that the `Authorization` header contains a valid 66-character hex hash.

### `NETWORK_ERROR` / `SERVICE_UNAVAILABLE`
**HTTP Status**: `503`
**Description**: The verification infrastructure is temporarily unable to reach the Tempo blockchain.
- **Remediation**: Implement a standard exponential backoff and retry strategy.

### `PAYMENT_VERIFICATION_FAILED`
**HTTP Status**: `402`
**Description**: The transaction was found but failed the specific settlement criteria (e.g., wrong recipient, insufficient amount, or expired timestamp).
- **Remediation**: Verify the agent's configuration matches the server's requirements.

---

## Programmatic Error Handling (Node.js)

In backend integrations, developers should use the standardized error schema to provide clear feedback to autonomous clients:

```typescript
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    if (err.isTempoError) {
        return res.status(err.statusCode).json({
            error: err.name,
            code: err.code,
            message: err.message,
            fix: err.fix,
            context: err.context
        });
    }
    next(err);
});
```

---

Next: [Architecture Overview](../architecture.md) | [Documentation Portal](../README.md)
