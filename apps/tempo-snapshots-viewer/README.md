# Tempo Snapshots

Cloudflare Worker for browsing and downloading Tempo snapshots stored in R2. The UI lets operators choose a Tempo network, select a published snapshot, and generate the matching `tempo download` command for minimal, full, archive, or custom component profiles.

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
3. The UI presents Tempo network selection for mainnet, Moderato, and devnet, then derives download profiles from the selected manifest.
4. If a network has not published a modular manifest yet, the UI falls back to the latest archive download command for that network.

API endpoint: `/api/snapshots` returns the normalized snapshot list without raw manifest payloads.
