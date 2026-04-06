# Virtual Addresses — TIP-1022 Demo

Interactive demo for [TIP-1022](https://github.com/tempoxyz/tempo/pull/3286) virtual addresses on Tempo. Three views:

- **Intro** — TIP-1022 docs landing page: motivation, address layout, protocol flow, properties, and security considerations.
- **Registry** — Mine a salt, register as a virtual-address master, derive deposit addresses, and test transfers. Works with a connected wallet or manual address input.
- **Walkthrough** — Animated visual walkthrough of the full TIP-1022 flow (register → derive → send → resolve → forward), with real on-chain transactions using pre-funded test accounts.

## Prerequisites

- [Node.js](https://nodejs.org/) ≥ 24
- [pnpm](https://pnpm.io/) ≥ 10
- [Rust](https://rustup.rs/) toolchain (for building the Tempo node)
- [just](https://github.com/casey/just) (`brew install just`)

## 1. Start a local Tempo node

The demo requires a local Tempo node with TIP-1022 (T3 hardfork) enabled. Clone the tempo repo and checkout the TIP-1022 branch:

```bash
cd /path/to/tempo
git fetch origin pull/3286/head:tip-1022
git checkout tip-1022
```

Start the node:

```bash
cd scripts
rm -rf data logs
just tempo-dev-up
```

The node starts at `http://localhost:8545` (chain ID 1337) with anvil test accounts pre-funded.

## 2. Install dependencies

From the monorepo root:

```bash
pnpm install
```

## 3. Configure environment

The `.dev.vars` file should already exist with anvil test keys:

```
EXCHANGE_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
SENDER_PRIVATE_KEY=0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d
RPC_URL=http://localhost:8545
```

These are the standard anvil accounts 0 and 1 — safe for local development only.

## 4. Run the app

```bash
pnpm --filter virtual-addresses dev
```

Open [http://localhost:3002](http://localhost:3002).

## Architecture

```
src/
├── app.tsx                          # Hash-based router: #intro | #registry | #walkthrough
├── server.ts                        # Hono API routes (Cloudflare Workers)
├── comps/
│   ├── header.tsx                   # Navigation links + wallet connect
│   ├── intro-view.tsx               # TIP-1022 docs landing page
│   ├── registry-view.tsx            # Salt miner flow (4 steps)
│   ├── step-mine.tsx                # Multi-threaded WASM salt miner
│   ├── step-register.tsx            # On-chain registration
│   ├── step-generate.tsx            # Offline address derivation
│   ├── step-transfer.tsx            # Demo transfer
│   ├── address-anatomy.tsx          # Color-coded virtual address breakdown
│   └── walkthrough/
│       ├── walkthrough-demo.tsx     # 3-column layout + speed controls
│       ├── exchange-panel.tsx       # Exchange actor panel
│       ├── protocol-panel.tsx       # TIP-1022 registry + TIP-20 precompile
│       ├── sender-panel.tsx         # Sender actor panel
│       ├── guide-overlay.tsx        # Spotlight walkthrough (intro + post-demo)
│       ├── event-log.tsx            # Animated transaction log
│       └── status-badge.tsx         # State indicator
├── store/
│   └── walkthrough-store.ts         # Zustand state machine with speed control
└── lib/
    ├── abi.ts                       # Contract ABIs + addresses
    ├── demo-client.ts               # Client-side viem RPC calls for walkthrough
    ├── virtual-address.ts           # Address building/decoding utilities
    ├── walkthrough-types.ts         # Demo state types
    ├── wagmi.ts                     # Wagmi config (tempoLocalnet)
    ├── miner.worker.ts              # WASM keccak256 mining (hash-wasm)
    ├── miner.pool.ts                # Web Worker pool manager
    ├── miner.protocol.ts            # Worker message protocol
    ├── use-miner.ts                 # React hook for miner
    └── css.ts                       # cx() utility
```

## How the walkthrough works

1. **Fund** — Pre-funds exchange and sender accounts with PathUSD via `tempo_fundAddress` + `Actions.token.mint`
2. **Register** — Calls `registerVirtualMaster(salt)` with a pre-mined salt (hardcoded for anvil account 0)
3. **Derive** — Builds a virtual address offline: `[masterId][FDFDFD...FD magic][userTag]`
4. **Transfer** — Sender sends 100 PathUSD to the virtual address
5. **Resolve** — TIP-20 precompile detects magic bytes, looks up masterId → master address
6. **Forward** — Tokens credited to master; two Transfer events emitted

All RPC calls go through vite's `/rpc` proxy to bypass CORS (`localhost:3002/rpc` → `localhost:8545`).

## Key addresses

| Contract | Address |
|----------|---------|
| PathUSD (TIP-20) | `0x20C0000000000000000000000000000000000000` |
| Virtual Registry | `0xfDC0000000000000000000000000000000000000` |
| Exchange (anvil 0) | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` |
| Sender (anvil 1) | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` |

## Virtual address format

```
0x [masterId 4B] [magic 10B: FDFDFDFDFDFDFDFDFDFD] [userTag 6B]
    ^^^^^^^^      ^^^^^^^^^^^^^^^^^^^^^^^^^^^^      ^^^^^^^^^^^^
    blue          purple                            green
```

## Checks

```bash
pnpm --filter virtual-addresses check        # biome lint + type check
pnpm --filter virtual-addresses build        # production build
```
