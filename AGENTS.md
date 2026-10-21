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
| `apps/mcp-docs-indexer` | Resolver that uploads external docs (viem, wagmi, vocs) into the shared `tempo-global` AI Search instance for unified MCP search |
| `apps/reth-snapshots-viewer` | Reth snapshots viewer |
| `apps/tempo-snapshots-viewer` | Tempo snapshots viewer |

## Commands

```bash
pnpm install                    # Install all dependencies
pnpm check                      # Run Biome lint + format (with auto-fix), then type check (via postcheck)
pnpm check:types                # Type check all workspaces (uses tsgo, the native TypeScript compiler)
pnpm build                      # Build all apps
```

## Git Workflow

Work in the main checkout on `main` and push each completed change directly to `main`. Never create worktrees or feature branches. Commit only your own changes and leave other dirty or untracked files alone; if a push is rejected, rebase onto `origin/main`, resolve conflicts and push again.

## CRITICAL: Pre-Commit Requirements

### Before Every Commit, You MUST

1. ✅ **Type check**: `pnpm check:types` - ZERO errors
2. ✅ **Lint/Format**: `pnpm check` - ZERO errors (auto-fixes applied)
3. ✅ **Tests pass**: `pnpm test` in affected apps
4. ✅ **Pre-commit hooks pass**: `pnpm precommit`

## Code Style Guidelines

## Dependencies

* You *must* use wagmi, viem, or ox to interact with tempo
* When adding a new dependency, look at other apps and see if there is a similar dependency

### TypeScript

* **Type imports**: Use `import type` for type-only imports
* **Props pattern**: Use namespace declarations for component props:

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

* Function components only (no classes)
* Explicit return type `React.JSX.Element`
* Icons from `@tempoxyz/ds/icons`: `import { Copy } from '@tempoxyz/ds/icons'`. For icons TDS lacks, use `unplugin-icons`: `import XIcon from '~icons/lucide/x'`

### UI (Tempo Design System + zyzz)

The explorer is built with [Tempo Design System](https://ds.tehq.dev/) (`@tempoxyz/ds`) and styles its own markup with [zyzz](https://zyzz.style), which compiles typed style definitions to static CSS.

* Read https://ds.tehq.dev/llms.txt first. Before using a component, read its page as Markdown, such as https://ds.tehq.dev/docs/components/button.md. Treat each page's Guidelines, Content, and Accessibility sections as requirements.
* Use library components first. Don't rebuild one, and don't substitute a raw Base UI primitive. Router links go through `render`: `<Button.Link render={<Link to="/" />}>Home</Button.Link>`.
* Format addresses and hashes with `Hex` (`#comps/Address` links one to its page), amounts with `Amount`, and token logos with `Token`. Don't format them by hand.
* Don't restyle a TDS component through `className`; add only properties it leaves unset, such as placement.
* Style your own markup with `style` and `variants` from `@tempoxyz/ds` and TDS tokens (`color: 'gray.900'`, `gap: '8'`, `typography: 'label.12'`). Size keys are pixel values (`padding: '16'`, `borderRadius: '12'`, `boxShadow: '15'`), and weight and tracking come only from `typography` sets. A literal on a token-mapped property takes the ` !custom` suffix; keep those rare.
* Explorer additions TDS lacks (link and code colors, shared recipes) live in `#styles/explorer`; document-level rules live in `#styles/globals`.
* Keep a component's definitions in a module-level `namespace styles` at the bottom of its file and spread them onto elements: `<div {...styles.card()} />`. Combine with `cx` from `zyzz`, one spread per element. Route files do the same.
* Use `variants` for finite choices and `data-*`/ARIA attribute selectors for state, not class-name logic.
* Import style modules by name; `import * as` from a style module does not compile. Declare shared partial records at module scope, not inside `namespace styles`. Variant axis names are lowercase.
* Write interface copy with the TDS Content foundations: sentence case and verb-first button labels.

## Making Changes to an Application

### Before Starting Any Code Changes

* [ ] Understand which app(s) you're modifying
* [ ] Check existing patterns in similar files
* [ ] Identify affected tests

### After Completing Code Changes (BEFORE declaring "done")

* [ ] Run `pnpm check` from repo root
* [ ] Run `pnpm check:types` from repo root
* [ ] Fix ALL type/lint errors before proceeding
* [ ] Run tests in affected apps: `pnpm test`
* [ ] Only THEN declare task complete

### Before Any Commit

* [ ] All above checks must pass
* [ ] All related tests must pass
* [ ] No outstanding type or lint errors
* [ ] No console.log statements left (except in tests)

## Pull Request Guidelines

### UI Changes (apps with visual components)

When creating PRs that include UI changes (e.g., `apps/explorer`), include a before/after comparison table in the PR description:

```markdown
## Screenshots

| Before | After |
|--------|-------|
| ![before](url-to-before-screenshot) | ![after](url-to-after-screenshot) |
```

Add multiple rows if the change affects different views or states.

## Adding a New Application

1. Create a new directory under `apps/`
2. Add a `package.json` with scripts: `dev`, `build`, `check`, `check:types`
3. Add a `tsconfig.json` extending strict TypeScript settings
4. Add a `wrangler.json` for Cloudflare Workers deployment
5. Add `.env.example` with required environment variables
6. Update this file's "Existing Apps" table

### Required Files for New Apps

```txt
apps/my-app/
├── src/
│   └── index.ts          # Entry point
├── package.json          # Must include standard scripts
├── tsconfig.json         # TypeScript config
├── wrangler.json         # Cloudflare Workers config
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

> **Note**: `dev` varies per app (e.g., `wrangler dev` for worker-only apps). Adapt to fit the app's runtime.

## Library Documentation

You can find the documentation for common libraries at the following links:

* [Cloudflare Workers](https://developers.cloudflare.com/llms.txt)
* [TanStack Start](https://context7.com/websites/tanstack_start/llms.txt?tokens=1000000)
* [TanStack Router](https://context7.com/websites/tanstack_router/llms.txt?tokens=1000000)
* [React](https://context7.com/websites/react_dev/llms.txt?tokens=1000000)
* [zyzz](https://zyzz.style/llms.txt)
* [Wagmi React reference](https://context7.com/websites/wagmi_sh_react/llms.txt?tokens=1000000)
* [Wagmi Tempo reference](https://context7.com/websites/wagmi_sh_tempo_getting-started/llms.txt?tokens=1000000)
* [Viem general reference](https://viem.sh/llms.txt)
* [Viem Tempo reference](https://context7.com/websites/viem_sh_tempo/llms.txt?tokens=1000000)
* [Ox](https://ox.sh/llms.txt)
* [Hono](https://hono.dev/llms.txt)
* [Zod](https://zod.dev/llms.txt)

## Recording Browser GIFs with Chrome DevTools MCP

To capture a page load from the very first frame using MCP tools:

1. **Navigate to about:blank first** to reset the page state
2. **Call `navigate_page` and `take_screenshot` in parallel** - use `timeout=0` on navigate so both execute simultaneously
3. **Continue taking sequential screenshots** for the remaining frames
4. **Combine frames with ImageMagick**: `magick -delay 50 -loop 0 /tmp/frame_*.png -resize 650x /tmp/recording.gif`
5. **Upload to imgbb**: `curl --location --request POST "https://api.imgbb.com/1/upload?key=API_KEY" --form "image=@/tmp/recording.gif"`

Example parallel tool call (MCP pseudo-syntax, not bash):

```bash
navigate_page(url="https://...", timeout=0)
take_screenshot(filePath="/tmp/frame_01.png")
```

Then sequential screenshots for frames 02-10, combine, and upload.
