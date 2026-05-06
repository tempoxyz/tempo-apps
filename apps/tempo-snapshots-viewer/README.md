# Tempo Snapshots Viewer

Cloudflare Worker that displays Tempo snapshots stored in R2, including legacy single-archive snapshots and Reth-style v2 modular manifests across multiple Tempo networks.

## Prerequisites

- R2 bucket `tempo-node-snapshots` with public domain at `tempo-node-snapshots.tempoxyz.dev`
- Monorepo dependencies installed from the repository root with `pnpm install`

## Setup

```bash
pnpm install
pnpm --filter tempo-snapshots-viewer gen:types
```

Worker configuration lives in `wrangler.json`.

## Development

```bash
pnpm --filter tempo-snapshots-viewer dev  # Local development at http://localhost:8787
```

## Deployment

```bash
pnpm --filter tempo-snapshots-viewer deploy  # Deploys to snapshots.tempoxyz.dev
```

## Project Structure

```
apps/tempo-snapshots-viewer/
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
2. It normalizes every snapshot into one API shape, groups them by Tempo network, and caches the result at the edge.
3. The UI uses the same modular snapshot experience as the Reth viewer, but adds Tempo network selection for mainnet, testnet, and moderato.
4. If a network has not published a v2 manifest yet, the UI falls back to the latest legacy archive download command for that network.

API endpoint: `/api/snapshots` returns the normalized snapshot list without raw manifest payloads.
