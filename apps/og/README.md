# Open Graph API

A Worker that generates OG preview image dynamically.

```bash
pnpm i          # Install dependencies
pnpm dev        # Start development server
```

<sub>[What is The Open Graph Protocol?](https://ogp.me)</sub>

## Explorer design system

All generated cards share Regen's Pilat Regular/Demi typography, JetBrains Mono Light for hashes, neutral surfaces, subtle borders, and the explorer's blue link accent. Card type is scaled for 1200 × 630 social previews. Fonts are bundled locally; generation does not fetch third-party font CSS.

Coverage: homepage, block/token listings, transaction fallback, transaction, receipt, block, token, account, contract, zone portal, and empty/failed states. Detail templates live in `src/ui.tsx`; shared branding lives in `src/brand.tsx`. All card families use the original Tempo ray artwork: centered Explore for the homepage, Examine for tokens, and Glance for transactions. Receipts show up to three numbered steps with registry token logos immediately before token names and green asset highlighting. An explicit remaining-step count reserves space for fees and totals. The count comes from the complete transaction, even when only six steps are encoded in the URL. Social images stay static for broad client support.

Run `pnpm --filter og test` to render every route and validate error responses in a real local Worker.
