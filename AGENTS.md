# Agent Instructions

## Progress Logging (REQUIRED)

**All agents MUST log their progress in `.agents/progress.md` at the end of each session.**

Include: what was done, key decisions, artifacts created/modified, blockers, next steps.

## Project Documentation

Agent-specific documentation, plans, and progress logs are stored in `.agents/` (gitignored).

- **Progress Log**: `.agents/progress.md` - Global progress log (ALL agents write here)

### Current Projects

| Project | Location | Description |
|---------|----------|-------------|
| Coinbase Onramp | `.agents/onramp/` | Apple Pay onramp integration |

### Onramp Project

- **Plan**: `.agents/onramp/plan.md` - Full implementation plan with phases
- **Progress**: `.agents/onramp/progress.md` - Onramp-specific details

Tasks are tracked in Amp's task_list system. Query with:
```
task_list action: "list", repoURL: "https://github.com/tempoxyz/tempo-apps"
```

## Build & Development

```bash
# Install dependencies
pnpm install

# Run the app (moderato env)
pnpm --filter app dev

# Run the app (devnet env)
pnpm --filter app dev:devnet

# Type check
pnpm --filter app check:types

# Lint
pnpm --filter app check:biome
```

## Code Conventions

- Use `pnpm` as package manager
- TypeScript with strict mode
- Biome for linting/formatting
- TanStack Router for routing
- Wagmi/Viem for blockchain interactions
- Cloudflare Workers for backend services
