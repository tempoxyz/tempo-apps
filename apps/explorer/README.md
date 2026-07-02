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

To run against a local anvil node:

```sh
pnpm dev:anvil
```

This starts `anvil --network tempo --block-time 1 --chain-id 31337` on
`http://127.0.0.1:8545`, then launches a local explorer instance pointed at
that RPC URL. Override defaults with `ANVIL_BLOCK_TIME`, `ANVIL_CHAIN_ID`,
`ANVIL_NETWORK`, `ANVIL_PORT`, or `EXPLORER_PORT`.

If an anvil-compatible node is already running:

```sh
VITE_TEMPO_RPC_URL=http://127.0.0.1:8545 VITE_TEMPO_CHAIN_ID=31337 pnpm dev:localnet
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
