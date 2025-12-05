# Index Supply Proxy Worker

A Cloudflare Worker proxying requests to https://api.indexsupply.net/v2/query

```bash
cp .env.example .env  # Copy example environment variables
pnpm install          # Install dependencies
pnpm dev              # Start development server
pnpm build            # Build the worker
pnpm deploy           # Deploy the worker
```
