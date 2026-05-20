# Reth Snapshots Viewer

Cloudflare Worker that displays Reth snapshots stored in R2, including legacy single-archive snapshots and v2 modular manifests.

## Prerequisites

- R2 bucket `reth-snapshots` with public domain at `snapshots-r2.reth.rs`
- Monorepo dependencies installed from the repository root with `pnpm install`

## Setup

```bash
pnpm install
pnpm --filter reth-snapshots-viewer gen:types
```

Worker configuration lives in `wrangler.json`.

## Development

```bash
pnpm --filter reth-snapshots-viewer dev  # Local development at http://localhost:8787
```

## Deployment

```bash
pnpm --filter reth-snapshots-viewer deploy  # Deploys to snapshots.reth.rs
```

## Project Structure

```
reth-snapshots-viewer/
├── src/
│   └── index.ts        # Main Worker logic
├── wrangler.json       # Worker configuration
├── package.json        # Dependencies
├── tsconfig.json       # TypeScript config
├── worker-configuration.d.ts
└── README.md           # This file
```

## How It Works

1. The worker scans the bucket for both legacy root-level metadata files and v2 snapshot directories containing `manifest.json`.
2. It normalizes every snapshot into one API shape, groups them by profile/channel, and caches the result at the edge.
3. The UI lets users filter by chain ID, profile, channel, and date.
4. Modular snapshots expose component-size presets for minimal, full, and archive node bootstrapping.

API endpoint: `/api/snapshots` returns the normalized snapshot list without raw manifest payloads.
