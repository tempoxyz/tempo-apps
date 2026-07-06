---
name: verify
description: Build, launch, and drive the Tempo explorer app to verify changes end-to-end. Use when verifying explorer changes at runtime (SSR meta tags, API routes, pages).
---

# Verifying the explorer app

## Launch

```bash
cd apps/explorer
pnpm dev:testnet   # vite dev on http://localhost:3000, ready in ~5s
```

No env vars needed for read-only flows; anonymous api.tempo.xyz requests are
rate-limited and occasionally 502 (transient — retry before concluding).

## Drive

- SSR surface (OG/social cards, head tags): `curl -sL http://localhost:3000/address/<addr>`
  and inspect `<meta property="og:image" ...>`. Always pass `-L`: non-checksummed
  addresses 307-redirect to the checksummed path, returning an empty body without it.
- Piping SSR HTML through `grep` can silently fail (macOS grep treats the payload
  as binary). Use `grep -a`, or `tr '>' '>\n'` first, or save to a file and `head -c`.
- API routes: `curl http://localhost:3000/api/address/metadata/<addr>` etc.
- Cold address-metadata lookups take 7–9s upstream (count queries); warm repeats
  are sub-second (30s in-process cache). Set `--max-time 90` on cold fetches.

## OG card rendering (apps/og)

Cards render in a separate worker (og.tempo.xyz). To see actual pixels locally:

```bash
cd apps/og && pnpm exec wrangler dev --port 8799
curl "http://localhost:8799/token/<addr>?name=X&symbol=Y&supply=1.00" -o card.webp
sips -s format png card.webp --out card.png   # then Read the png
```

## Useful fixtures (testnet, chainId 42431)

- Verified token with holders/created: `0x20C0000000000000000000000000000000000001` (AlphaUSD)
- Unverified token (no upstream holderCount): any recent token from
  `https://api.tempo.xyz/v1/tokens?chainId=42431&limit=25`
- Production comparison: `https://explore.testnet.tempo.xyz/...` (same routes)
