# Key Manager

WebAuthn key management service using `Handler.webAuthn` from `accounts/server`.

## Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/register/options` | POST | Generate credential creation options |
| `/register` | POST | Verify registration and store a credential |
| `/login/options` | POST | Generate credential request options |
| `/login` | POST | Verify authentication |

## Development

```sh
pnpm i
pnpm dev
```
