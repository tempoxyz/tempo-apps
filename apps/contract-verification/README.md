# Tempo Contract Verification Service

[contracts.tempo.xyz/docs](https://contracts.tempo.xyz/docs)

Sourcify-compatible smart contract verification service. Currently supports Tempo Testnets and Devnets.

## Architecture

```mermaid
graph LR
    Client["Client"]
    Worker["Worker<br/>Hono Routes"]
    Container["Container<br/>Solc"]
    D1["D1<br/>SQLite"]
    
    Client -->|HTTP| Worker
    Worker -->|compile| Container
    Worker -->|query/write| D1
    Worker -->|response| Client
    
    style Worker fill:#2563eb,color:#fff
    style Container fill:#8b5cf6,color:#fff
    style D1 fill:#f59e0b,color:#fff
```

## API Endpoints

### Verification

- `POST /v2/verify/:chainId/:address` - Verify contract with source code
- `GET /v2/verify/:verificationId` - Check verification status

### Lookup

- `GET /v2/contract/:chainId/:address` - Get verified contract details
- `GET /v2/contract/all-chains/:address` - Find contract across all chains
- `GET /v2/contracts/:chainId` - List all verified contracts on a chain

### Usage

#### With [Foundry](https://getfoundry.sh)

Pass the API URL to the `--verifier-url` flag and set `--verifier` to `sourcify`:

```bash
forge script script/Mail.s.sol --verifier-url https://contracts.tempo.xyz --verifier sourcify
```

See [/apps/contract-verification/scripts/verify-solidity.sh](./scripts/verify-solidity.sh)
and [/apps/contract-verification/scripts/verify-vyper.sh](./scripts/verify-vyper.sh) for small examples you can run.

#### Direct API Usage

- Standard JSON: see [/apps/contract-verification/scripts/verify-via-curl.sh](./scripts/verify-via-curl.sh) for a full example.

### Development

#### Prerequisites

- A container runtime (e.g., [OrbStack](https://docs.orbstack.dev), [Colima](https://github.com/abiosoft/colima), Docker Desktop)

```sh
cp .env.example .env  # Copy example environment variables
pnpm install          # Install dependencies
pnpm dev              # Start development server
```

Once dev server is running, you can run scripts in the [/apps/contract-verification/scripts](./scripts) directory to populate your local database with verified contracts.

#### Dynamic Chain Registry

By default the worker only knows about the statically-bundled chains (Tempo Testnets and Devnets). To support additional chains at runtime without redeploying, the worker can pull a chainlist.org-compatible JSON document from an external URL and merge it with the static list.

Configure it via two env vars in [wrangler.json](./wrangler.json):

- `CHAINS_CONFIG_URL` — HTTPS URL returning a JSON object keyed by chain id. Each entry must include `chainId` and a non-empty `rpc` array; `name`, `nativeCurrency`, `explorers`, and `hidden` are optional. See [src/lib/chain-registry.ts](./src/lib/chain-registry.ts) for the full schema.
- `CHAINS_CONFIG_AUTH_TOKEN` — optional bearer token sent as `Authorization: Bearer <token>` when fetching the URL. Leave empty if your registry is public.

If `CHAINS_CONFIG_URL` is unset the worker stays on the static chain list and `CHAINS_CONFIG_AUTH_TOKEN` is ignored.

##### Secrets Store

The note below applies **only** to `CHAINS_CONFIG_AUTH_TOKEN` (the dynamic chain registry token). Other vars in [wrangler.json](./wrangler.json) are plain config and don't need a Secrets Store binding.

`CHAINS_CONFIG_AUTH_TOKEN` is intended to be sourced from a [Cloudflare Secrets Store](https://developers.cloudflare.com/secrets-store/) binding in production. It is left as a plain `vars` entry in [wrangler.json](./wrangler.json) so local development works out of the box.

To wire it up to a Secrets Store secret:

1. Create a secret in your Cloudflare account's Secrets Store (e.g. via `wrangler secrets-store secret create`) and note the `store_id` and `secret_name`.
2. Remove `CHAINS_CONFIG_AUTH_TOKEN` from the `vars` block in [wrangler.json](./wrangler.json) (Workers will reject having the same name in both `vars` and `secrets_store_secrets`).
3. Add a `secrets_store_secrets` entry to [wrangler.json](./wrangler.json):

   ```jsonc
   "secrets_store_secrets": [
     {
       "binding": "CHAINS_CONFIG_AUTH_TOKEN",
       "store_id": "<your-store-id>",
       "secret_name": "<your-secret-name>"
     }
   ]
   ```

4. Run `pnpm gen:types` (or `wrangler types`) to regenerate `worker-configuration.d.ts` so the binding is typed correctly.
5. Deploy with `pnpm deploy` — the worker will read the secret from the Secrets Store binding at runtime.

For local development, set `CHAINS_CONFIG_AUTH_TOKEN` in your `.env` (or leave it empty if you're not exercising the dynamic chain registry).

#### Database

We use [D1](https://developers.cloudflare.com/d1), a serverless SQLite-compatible database by Cloudflare.
For local development, keep migrations and seeding separate:

```bash
pnpm db:prepare:local  # Apply local D1 migrations non-interactively
pnpm db:seed:local     # Seed native/precompile contract metadata into local D1
```

For remote D1:

```bash
pnpm db:prepare:remote # Apply remote D1 migrations non-interactively
pnpm db:seed:remote    # Seed native/precompile contract metadata into remote D1
```

The seed script uses Wrangler's D1 binding path rather than opening the SQLite file directly, so the same seeding logic works for both local and remote D1.

`pnpm db:studio` uses the Drizzle D1 HTTP config. If you need to inspect the local SQLite file directly, resolve it with [local-d1.ts](./scripts/local-d1.ts) and point a SQLite-capable tool at that path instead.

| environment | database      | dialect | GUI                                                                 |
|-------------|---------------|---------|---------------------------------------------------------------------|
| production  | Cloudflare D1 | SQLite  | [DrizzleKit Studio](https://github.com/drizzle-team/drizzle-studio) |
| development | Local SQLite  | SQLite  | [local-d1.ts](./scripts/local-d1.ts) + your SQLite tool of choice   |
