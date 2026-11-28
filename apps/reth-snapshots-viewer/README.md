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

Local development uses `wrangler.json`. Production builds use `wrangler.prd.json`; keep the two in sync.

## Development

```bash
pnpm --filter reth-snapshots-viewer dev  # Local development at http://localhost:8787
```

## Deployment

Pushes to `main` that touch this app deploy it to snapshots.reth.rs through the [Cloudflare Deploy Broker](https://github.com/tempoxyz/cloudflare-deploy-broker); CI holds no Cloudflare credentials. The broker only accepts a build that matches the `reth-snapshots-viewer` entry in [`cloudflare-deploy-policies`](https://github.com/tempoxyz/cloudflare-deploy-policies/blob/main/policies/tempoxyz/tempo-apps.yaml). New bindings, variables or domains need a policy change first.

## Project Structure

```
reth-snapshots-viewer/
├── src/
│   └── index.ts        # Main Worker logic
├── wrangler.json       # Local development configuration
├── wrangler.prd.json   # Production configuration built by the deploy broker
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
