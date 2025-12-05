# A General Proxy Worker for Tempo

[api.tempo.xyz](https://api.tempo.xyz)

A Cloudflare Worker proxying requests to various sources. Each source is a sub-app.
A sub-app is a route under `api.tempo.xyz`, defined by a `Hono` app in [`./src/sources`](./src/sources).

All sub-apps are registered in [`./src/index.ts`](./src/index.ts).
To register a new sub-app (aka to proxy a new third-party API), you need to:

- Create a new sub-app in [`./src/sources`](./src/sources)
- Register the sub-app in [`./src/index.ts`](./src/index.ts)

## Sub-Apps

### Index Supply

- Works the same way as the Index Supply API.
- Expects an `api-key` query parameter or `x-api-key` header.

```sh
curl 'https://api.tempo.xyz/indexer/query' \
    --get \
    --header 'x-api-key: **YOUR_API_KEY**' \
    --data-urlencode 'query=select "from", "to", tokens from transfer where chain = 8453 limit 1' \
    --data-urlencode 'signatures=Transfer(address indexed from, address indexed to, uint tokens)'

# `/query-live` and all the other routes from IS work the same way.
```

## Development

```bash
cp .env.example .env  # Copy example environment variables
pnpm install          # Install dependencies
pnpm dev              # Start development server
pnpm build            # Build the worker
pnpm deploy           # Deploy the worker
```
