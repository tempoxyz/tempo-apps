# Tempo Explorer

## Getting Started

To run this application (defaults to `testnet` chain):

```bash
pnpm install
pnpm dev
```

To run `devnet` chain:

```sh
pnpm dev:devnet
```

### Styling

This project uses [Tailwind CSS](https://tailwindcss.com) for styling.

### Linting, Formatting & Type Checking

This project uses [Biome](https://biomejs.dev) for linting and formatting.

To format & lint:

```bash
pnpm check
```

To check types:

```bash
pnpm check:types
```

## Adding new features

When adding new features, please read TanStack Router and Start docs first.

[TanStack Router](https://tanstack.com/router/latest/docs)
[TanStack Start](https://tanstack.com/start/latest/docs)

# RPC backend configuration

See [RPC.md](./RPC.md) for the `/api/rpc` endpoint, per-Worker Orchestra secrets,
and rollout verification.

### Disposable stack runtime

Build `Dockerfile.preview` from the repository root for a Node-based explorer
that can attach to a single development chain. Set `PREVIEW_CHAIN_ID`,
`PREVIEW_RPC_URL`, `TEMPO_API_URL`, `TEMPO_API_KEY`, and `APP_URL` at startup.
Mainnet and Moderato IDs are rejected. Browser requests use the same-origin RPC
proxy, and only the numeric chain ID is injected into HTML; RPC and API
credentials stay on the server. `/healthz` reports the configured chain ID.

`Build preview runtime` builds on main and PRs. Same-repository PRs publish a GHCR
image and record its immutable digest in the Actions summary. Use that digest in
the `preview-stack-create` workflow or Dev Platform Preview stacks page. The
existing Cloudflare build and deployment entries remain the default for other
environments.
