# docs-mcp

Resolver Worker that ingests external doc sites (viem, wagmi, vocs, mpp) into
the shared **Cloudflare AI Search** instance `tempo-global`. The AI Search
instance owns the docs.tempo.xyz crawl directly; this Worker handles the
non-owned sources by uploading their canonical Markdown pages into the
instance's **built-in storage**, tagged with a `source` metadata field for
filtering at query time.

The MCP endpoint is exposed by AI Search itself
(`https://<instance-id>.search.ai.cloudflare.com/mcp`) — this Worker is the
ingest plane, not the query plane.

## How it works

```
┌─────────────────────────┐
│ Cron (hourly) ──────────┼─▶ for each source in SOURCES:
└─────────────────────────┘     1. GET <base>/llms.txt with If-None-Match
                                2. parse → page URLs
                                3. for each page: GET <page>.md
                                4. instance.items.uploadAndPoll(key, content, {
                                     metadata: { source, url, title, ... }
                                   })
                                5. save new ETag to KV
```

The Worker has **no public HTTP surface** beyond a trivial `GET /` health
string — sync only runs on the scheduled cron. To trigger an out-of-band
sync, use `wrangler` from an operator's machine:

```bash
pnpm --filter docs-mcp exec wrangler triggers cron --once "0 * * * *"
```

## Bindings (wrangler.jsonc)

- `AI_SEARCH` — `ai_search_namespaces` binding to the `default` namespace.
- `ETAG_CACHE` — KV namespace tracking per-source ETag and last-sync timestamp.

## Vars

- `AI_SEARCH_INSTANCE_ID` (default `tempo-global`) — instance must exist and
  have been created after 2026-04-16 (when built-in storage shipped).

The set of sources is fixed in `src/lib/sources.ts`. To add a source, edit
that file.

## Setup

```bash
# from repo root
pnpm install

# Create the KV namespace (one time) and copy the id into wrangler.jsonc
pnpm --filter docs-mcp exec wrangler kv namespace create ETAG_CACHE

# Generate Worker types
pnpm --filter docs-mcp gen:types

# Verify
pnpm --filter docs-mcp check
pnpm --filter docs-mcp test
```

## Tests

Unit tests use Vitest with mocked `fetch` / AI Search / KV bindings:

```bash
pnpm --filter docs-mcp test
```

## Deploy

```bash
pnpm --filter docs-mcp deploy
```

Cron runs hourly. The Worker is not bound to a public route — `workers_dev`
is disabled in `wrangler.jsonc`. Tail logs to confirm the cron is firing:

```bash
pnpm --filter docs-mcp tail
```

## Verifying the result

After a sync, open the AI Search dashboard → `tempo-global` → **Items** tab.
You should see entries keyed `viem/...`, `wagmi/...`, `vocs/...` alongside
the auto-crawled `docs.tempo.xyz` entries.

Query the MCP endpoint to confirm cross-source ranking works:

```bash
curl https://<INSTANCE_ID>.search.ai.cloudflare.com/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc":"2.0","id":1,"method":"tools/call",
    "params":{"name":"search","arguments":{"query":"permit2 signing with viem on tempo"}}
  }'
```

## Known limitations

- **No deletion of stale pages.** When a source removes a page from
  `llms.txt`, the corresponding upload stays in built-in storage until the key
  is overwritten or explicitly deleted. Add a reaper pass if this becomes an
  issue.
- **Per-source ETag only.** We assume `llms.txt` changes whenever any page on
  the site changes, which is true for Vocs and `vitepress-plugin-llms`. If a
  source bypasses that contract, we'll miss updates until the next full
  re-sync.
- **No per-page ETag.** Every page in a changed source is re-uploaded, even
  if the page itself didn't change. AI Search dedupes by key + content hash
  internally, so this is wasted bandwidth but not wasted index churn.
