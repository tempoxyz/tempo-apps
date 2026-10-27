# Open Graph API

A Worker that generates OG preview image dynamically.

```bash
pnpm i          # Install dependencies
pnpm dev        # Start development server
```

<sub>[What is The Open Graph Protocol?](https://ogp.me)</sub>

## Design

Cards follow the explorer's Tempo Design System (TDS 0.2.2) look in its dark scheme: the `background.primary` canvas (`#100f0f`), white foreground, and the warm gray ramp for secondary (`gray.900`) and tertiary (`gray.700`) text. Every card renders at 1200 × 630 and is read at about half that size in a feed, so type, spacing and radii use twice the TDS pixel values. Inter (with TDS tracking and tabular figures) sets all text and Geist Mono sets addresses and hashes; both are TDS's variable fonts, bundled locally, so generation never fetches fonts.

Each card has one hierarchy, taken from the explorer's receipt and block pages:

1. The Tempo lockup and, when the URL carries it (`chainId` or the Zone Portal `network`), the network as the explorer header shows it: a green dot on Mainnet, amber elsewhere.
2. A small title with a TDS Tag for status (Confirmed, Failed, Fee token).
3. One dominant value, up to 112px: the payment amount or total, the block number, the token or contract name, or the short address (0xd8dA…6045). It shrinks to fit, long names wrap onto two balanced lines, and only then is it cut.
4. A subtitle: what happened (with registry token logos before token names), the time in UTC, a description, or the full address or hash.
5. Up to four facts below a hairline. Hashes take the TDS short form, and when values do not fit, units and trailing facts go before any number is cut.

Families: homepage (the landing page's wordmark and search field), block, token and transaction listings, transaction fallback, transaction and receipt (single action, multi-step with the first actions as tags and the true remaining count, failed with a struck amount, and hash-only), block (with the previous blocks' transaction counts as bars), token, account, contract, and Zone Portal (counts and balance, or "Data temporarily unavailable"). Accounts and contracts carry the TDS Identicon for their address; tokens without a registry logo keep the TDS gray circle. Missing data is left out, never shown as zero.

Shared primitives (colors, type, the frame, Tag, Identicon and the facts row) live in `src/brand.tsx`; card templates live in `src/ui.tsx`. Social images stay static for broad client support.

Run `pnpm --filter og test` to render every route and validate error responses in a real local Worker.
