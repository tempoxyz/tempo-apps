# AGENTS.md

## Repository Overview

This is a **TypeScript monorepo** for applications on the Tempo blockchain applications. Applications in this repo run on Cloudflare, unless explicitly declared otherwise.

### Existing Apps

| Workspace | Description |
| --------- | ----------- |
| `apps/explorer` | Chain explorer UI |
| `apps/fee-payer` | Transaction fee sponsorship service |
| `apps/key-manager` | WebAuthn key management service |
| `apps/tokenlist` | Token registry API |
| `apps/contract-verification` | Smart contract verification |
| `apps/og` | OpenGraph image generation |

## Commands

```bash
pnpm install                    # Install all dependencies
pnpm check                      # Run Biome lint + format (with auto-fix)
pnpm check:types                # Type check all workspaces
pnpm build                      # Build all apps
```

## CRITICAL: Pre-Commit Requirements

### Before Every Commit, You MUST:

1. ✅ **Type check**: `pnpm check:types` - ZERO errors
2. ✅ **Lint/Format**: `pnpm check` - ZERO errors (auto-fixes applied)
3. ✅ **Tests pass**: `pnpm test` in affected apps

## Code Style Guidelines

## Dependencies

* You *must* use wagmi, viem, or ox to interact with tempo
* You should *never* use tempo.ts - prefer the equivilant implementation in wagmi or viem or ox directly
* When adding a new dependancy, look at other apps and see if there is a similar dependancy 

### TypeScript

- **Type imports**: Use `import type` for type-only imports
- **Props pattern**: Use namespace declarations for component props:

```typescript
export function MyComponent(props: MyComponent.Props): React.JSX.Element {
  // ...
}

export declare namespace MyComponent {
  type Props = {
    value: string
    optional?: string | undefined
  }
}
```

### React Components

- Function components only (no classes)
- Explicit return type `React.JSX.Element`
- Use `cx()` helper for conditional classNames (from `#lib/css`)
- Icons from `unplugin-icons`: `import XIcon from '~icons/lucide/x'`

### Tailwind CSS

- Use Tailwind v4 syntax
- Custom variants: `@custom-variant`, `@theme`
- Prefer utility classes over custom CSS

## Making Changes to an Application

### Before Starting Any Code Changes:
- [ ] Understand which app(s) you're modifying
- [ ] Check existing patterns in similar files
- [ ] Identify affected tests

### After Completing Code Changes (BEFORE declaring "done"):
- [ ] Run `pnpm check` from repo root
- [ ] Run `pnpm check:types` from repo root
- [ ] Fix ALL type/lint errors before proceeding
- [ ] Run tests in affected apps: `pnpm test`
- [ ] Only THEN declare task complete

### Before Any Commit:
- [ ] All above checks must pass
- [ ] All related tests must pass
- [ ] No outstanding type or lint errors
- [ ] No console.log statements left (except in tests)

## Adding a New Application

1. Create a new directory under `apps/`
2. Add a `package.json` with scripts: `dev`, `build`, `check`, `check:types`
3. Add a `tsconfig.json` extending strict TypeScript settings
4. Add a `wrangler.jsonc` for Cloudflare Workers deployment
5. Add `.env.example` with required environment variables
6. Update this file's "Existing Apps" table

### Required Files for New Apps

```
apps/my-app/
├── src/
│   └── index.ts          # Entry point
├── package.json          # Must include standard scripts
├── tsconfig.json         # TypeScript config
├── wrangler.jsonc        # Cloudflare Workers config
└── .env.example          # Environment template
```

### Standard package.json Scripts

```json
{
  "scripts": {
    "dev": "vite dev",
    "build": "vite build",
    "check": "pnpm check:biome && pnpm check:types",
    "check:biome": "biome check --write --unsafe",
    "check:types": "tsgo --project tsconfig.json --noEmit",
    "gen:types": "wrangler types"
  }
}
```

## Library Documentation

You can find the documentation for common libraries at the following links:

- [Cloudflare Workers](https://developers.cloudflare.com/llms.txt)
- [TanStack Start](https://context7.com/websites/tanstack_start/llms.txt?tokens=1000000)
- [TanStack Router](https://context7.com/websites/tanstack_router/llms.txt?tokens=1000000)
- [React](https://context7.com/websites/react_dev/llms.txt?tokens=1000000)
- [Tailwind CSS v4](https://context7.com/websites/tailwindcss/llms.txt?tokens=1000000)
- [Wagmi React reference](https://context7.com/websites/wagmi_sh_react/llms.txt?tokens=1000000)
- [Wagmi Tempo reference](https://context7.com/websites/wagmi_sh_tempo_getting-started/llms.txt?tokens=1000000)
- [Viem general reference](https://viem.sh/llms.txt)
- [Viem Tempo reference](https://context7.com/websites/viem_sh_tempo/llms.txt?tokens=1000000)
- [Ox](https://ox.sh/llms.txt)
- [Hono](https://hono.dev/llms.txt)
- [Zod](https://zod.dev/llms.txt)
