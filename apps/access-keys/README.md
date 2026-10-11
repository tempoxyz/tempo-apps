# Managed access keys

`managed-access-keys` is a private Cloudflare Worker used by Tempo API. Its public
fetch handler always returns 404; production has no public route, workers.dev
hostname, or preview URL. Bind Tempo API to the named `AccessKeys` entrypoint.
Only trusted Workers should receive this binding: it accepts the tenant identity
that Tempo API derives from an authenticated API key, not an end-user credential.

## Security and policy

- Keys are generated server-side with viem and are never imported or exported.
- Only public metadata or signed Tempo transactions leave the service.
- AES-256-GCM encrypts private keys before storage, with a random 96-bit nonce and
  authenticated organization, project, environment, id, account, chain, and creation time.
- Each organization/project/environment tuple owns a distinct SQLite-backed Durable Object.
  Signing and revocation are serialized within that object; revocation deletes the ciphertext.
- Signatures use viem's Tempo access-key account, bound to the stored root account and chain.
  Signed input, root authorizations, multisig envelopes, and fee-payer signatures are refused.
- The service cannot authorize its own keys on-chain. The root wallet must authorize the
  returned address and choose its expiry, per-token spending limits, and contract/call scopes.
  Tempo API checks active authorization before signing; the chain enforces the policy at execution.
- Local revocation stops future signing. The root wallet must revoke on-chain authorization
  separately to invalidate previously signed transactions.
- Normal API-key authentication, scope gates, IP allowlists, rate limits, and sandbox/Zone
  access checks remain in Tempo API. Fee sponsorship continues through the existing relay.

This is a custodial signer, not an HSM or zero-knowledge service. The running
Worker can decrypt keys using its encryption secret. Restrict deployments,
service bindings, and secret access accordingly. Deleting an API credential
does not delete managed keys; another authorized key in the same tenant can use them.

## Configuration and rollout

Configure these as Cloudflare secrets, never in checked-in Wrangler vars:

| Secret | Value |
| --- | --- |
| `ACCESS_KEYS_ACTIVE_KEY_ID` | Identifier used for new ciphertexts |
| `ACCESS_KEYS_ENCRYPTION_KEYS` | JSON object mapping key identifiers to base64-encoded, cryptographically random 32-byte AES keys |

Provision the Worker and secrets before enabling the Tempo API binding. Missing
or invalid encryption keys fail closed with 503, without writing plaintext.

```sh
pnpm --filter access-keys deploy
pnpm --filter access-keys exec wrangler secret put ACCESS_KEYS_ENCRYPTION_KEYS
pnpm --filter access-keys exec wrangler secret put ACCESS_KEYS_ACTIVE_KEY_ID
```

Tempo API's binding must select the named entrypoint:

```json
{ "binding": "MANAGED_ACCESS_KEYS", "service": "managed-access-keys", "entrypoint": "AccessKeys" }
```

Do not bind PR previews to the production signer. Development can use an
independent Worker and encryption key ring with a local service binding.

To rotate the encryption key, add a new random key to the ring and then select
its identifier as active. Keep old entries until every record encrypted with
them has been migrated or revoked. Changing the active id does not re-encrypt
existing records. Removing an old key prematurely makes those records unusable.

## Private request contract

All calls are JSON POSTs to the named service entrypoint. The tenant is
`{ orgId, projectId: string | null, environment: 'production' | 'sandbox' }`.

| Operation | Additional fields | Response |
| --- | --- | --- |
| `create` | `account`, `chainId` | 201 public key metadata |
| `list` | optional `cursor` access-key id | 200 `{ data, nextCursor }`, up to 100 entries |
| `get` | `id` (`ak_`-prefixed handle) | 200 public key metadata |
| `revoke` | `id` | 200 metadata with `revokedAt`, idempotent |
| `sign` | `id`, unsigned serialized Tempo `transaction` | 200 `{ serializedTransaction }` |

Expected errors are 400 for malformed input, 404 for another tenant or absent
keys, and 409 for revoked keys. Dependency/encryption failures return 503 and
emit `managed_access_keys_failure` with only the bounded operation name.
Do not log private keys, ciphertexts, credentials, or transaction bodies.

## Validation

```sh
pnpm --filter access-keys test
pnpm --filter access-keys check:types
pnpm --filter access-keys build
```

Tests execute the real Worker entrypoint and Durable Objects, not mocked storage.
They cover tenant isolation, encryption context integrity, ciphertext-only storage,
access-key signatures, chain binding, and permanent revocation.
