# mpp-identity

Issuer for MPP identity attestations. A client proves something about the payer (first type: control of an email address, via a one-time code) and receives a short-lived **attestation**: a compact EdDSA JWS that an MPP server accepts in the `Identity-Attestation` request header.

Each attestation is bound to one audience (the MPP server's origin) and verifies against this service's public keys at `/.well-known/jwks.json`.

## Protocol (v1)

`ISSUER` is this service's base URL (no trailing slash), such as `https://identity.mpp.tempo.xyz`.

| Endpoint | Request | Response |
| -------- | ------- | -------- |
| `POST /email/otp` | `{"email", "audience"}` | `200 {"id", "expires_at"}`; `400 {"error"}`; `429 {"error"}` with `Retry-After` |
| `POST /email/verify` | `{"id", "code"}` | `200 {"attestation", "expires_at"}`; `400 {"error": "Invalid or expired code."}` |
| `GET /.well-known/jwks.json` | | `{"keys": [{"kty": "OKP", "crv": "Ed25519", "x", "kid", "alg": "EdDSA", "use": "sig"}]}` |
| `GET /` | | Service description |

All endpoints allow any origin (CORS, no credentials).

- `email` is trimmed and lowercased, at most 254 characters, one plain address.
- `audience` is the MPP server's origin, such as `https://merchant.example` (a trailing slash is allowed and removed). It must be https, except `http://localhost` and `http://127.0.0.1` on any port.
- Codes have 6 digits and expire after 10 minutes. Only `SHA-256(id + code)` is stored. An id allows 5 wrong attempts, then it is burned; a correct code is single use.
- Sending is limited, in any 10 minutes, to 3 codes per inbox, 10 per client and 100 per recipient domain. The inbox ignores a `+tag` on any domain, and on Gmail also dots, with googlemail.com counted as gmail.com; the code is still sent to, and `sub` is, the exact address requested. A client is its IPv4 address, or its IPv6 /64 prefix.

The attestation is a compact JWS:

```text
header  {"alg": "EdDSA", "typ": "mpp-attestation+jwt", "kid": KID}
payload {"iss": ISSUER, "aud": audience, "sub": email, "type": "email", "iat", "exp", "jti"}
```

`exp` is `iat + ATTESTATION_TTL` (default 86400 seconds). `KID` is the RFC 7638 SHA-256 thumbprint of the public JWK. An MPP server checks the signature against the issuer's JWKS, and that `iss` is a trusted issuer, `aud` is its own origin, `type` is `email` and `exp` has not passed.

## Flow

```bash
ISSUER=https://identity.mpp.tempo.xyz

# 1. Send a code to the email address, for the MPP server at https://merchant.example.
curl -s -X POST "$ISSUER/email/otp" -H 'Content-Type: application/json' \
  -d '{"email": "alice@example.com", "audience": "https://merchant.example"}'
# {"id": "WkuerQV8tbiIYwdQvpesZg", "expires_at": "..."}

# 2. Exchange the code from the email for an attestation.
ATTESTATION=$(curl -s -X POST "$ISSUER/email/verify" -H 'Content-Type: application/json' \
  -d '{"id": "WkuerQV8tbiIYwdQvpesZg", "code": "123456"}' | jq -r .attestation)

# 3. Call the MPP server with it.
curl -s https://merchant.example/paid-resource -H "Identity-Attestation: $ATTESTATION"
```

## Local development

```bash
pnpm keygen   # writes .dev.vars: a fresh signing key, ISSUER=http://localhost:8787, EMAIL_FROM, DEV_LOG_OTP=true
pnpm dev      # wrangler dev on http://localhost:8787
pnpm test     # vitest in the Workers runtime
```

Emails are not delivered locally. With `DEV_LOG_OTP=true`, the worker logs `OTP for <id>: <code>` to the console and carries on if the local email binding fails.

> [!WARNING]
> `DEV_LOG_OTP` is for local development only. Never set it in production, as a var or a secret: it writes every code to the logs and keeps issuing codes when email delivery fails.

`.dev.vars` holds a private key and is gitignored. Never commit it.

## Deploy

- Secret: `ATTESTATION_PRIVATE_KEY`, the Ed25519 private JWK as a JSON string (with `d` and `x`). Generate one with `pnpm keygen` (copy the value out of `.dev.vars`) and set it with `wrangler secret put ATTESTATION_PRIVATE_KEY`.
- Vars in `wrangler.json`: `ISSUER` (must equal the public base URL, since it becomes `iss`), `EMAIL_FROM` and `ATTESTATION_TTL`.
- Email goes through Cloudflare Email Service (the `send_email` binding `EMAIL`). The `EMAIL_FROM` domain must be onboarded for sending in the Cloudflare account.
- Codes and rate limits live in two SQLite-backed Durable Objects (`OtpStore`, `RateLimiter`).
- Route: a placeholder for `identity.mpp.tempo.xyz` is commented out in `wrangler.json`; enable it once the domain is set up.

```bash
pnpm deploy
```

Rotating the key changes the `kid`. MPP servers cache the JWKS for up to 5 minutes, and attestations signed with the old key stop verifying once it is removed.
