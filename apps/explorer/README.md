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

The UI is built on [Tempo Design System](https://github.com/tempoxyz/ds) (`@tempoxyz/ds` Platform) and styled with [zyzz](https://zyzz.style), which compiles typed style definitions to static CSS. See the styling section of the repository `AGENTS.md` for conventions.

zyzz relies on native CSS `light-dark()` and nesting, so the explorer supports Chrome and Edge 123+, Firefox 120+, and Safari 17.5+.

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
