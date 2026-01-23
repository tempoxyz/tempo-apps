# Key Manager

WebAuthn key management service using `Handler.keyManager` from `tempo.ts`.

## Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/challenge` | GET | Generate a new WebAuthn challenge |
| `/:id` | GET | Retrieve the public key for a credential |
| `/:id` | POST | Register a new credential with its public key |

## Development

```sh
pnpm i
pnpm dev
```
