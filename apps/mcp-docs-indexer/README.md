# mcp-docs-indexer

Resolver Worker that ingests configured external doc sites into
the shared **Cloudflare AI Search** instance `tempo-global`. The AI Search
instance owns the docs.tempo.xyz crawl directly; this Worker handles the
non-owned sources by uploading their canonical Markdown pages into the
instance's **built-in storage**, tagged with a `source` metadata field for
filtering at query time.

The MCP endpoint is exposed by AI Search itself. This Worker also serves as
a thin transparent proxy on `mcp.tempo.xyz` → the AI Search MCP upstream, so
clients connect to a stable branded URL instead of the opaque
`<instance-id>.search.ai.cloudflare.com` hostname.

```
MCP clients ──▶ https://mcp.tempo.xyz/ ──▶ AI Search MCP (proxied 1:1)
Cron ──▶ mcp-docs-indexer Worker ──▶ AI Search items.upload() (ingest plane)
```

## How it works

```
┌─────────────────────────┐
│ Cron (hourly) ──────────┼─▶ for each source in SOURCES:
└─────────────────────────┘     1. GET <base><indexPath> with If-None-Match
                                2. parse → page URLs
                                3. for each page: GET <page>.md, or the listed
                                   .md URL, with If-None-Match (per-page ETag)
                                4. 304 → skip; 200 → items.upload(),
                                   record { item id, etag } in KV
                                5. diff against last sync, delete items
                                   that fell out of llms.txt
                                6. save new index + llms.txt ETag to KV
```

Once per UTC day (00:00 cron tick) the worker does a **forced deep sync** that
bypasses every ETag, as a backstop for sources whose `llms.txt` ETag doesn't
roll over when individual pages change.

### KV layout (per source)

| Key                 | Value                                                    |
| ------------------- | -------------------------------------------------------- |
| `etag:<id>`         | last-seen `llms.txt` ETag (only stored on clean syncs)   |
| `last_sync:<id>`    | ISO timestamp of last sync attempt                       |
| `index:<id>`        | JSON map: `{ "<key>": { "id": "...", "etag": "..." } }`  |

`index` is the source of truth for stale-page deletion. We only advance
`etag` and `index` after a fully clean sync — partial failures don't update
state, so they retry on the next run instead of permanently desyncing.

The Worker exposes the MCP proxy only. It has **no public sync or ingest
endpoint**: source ingestion runs exclusively from the scheduled cron handler
inside Cloudflare Workers.

## Bindings (wrangler.jsonc)

- `AI_SEARCH` — `ai_search_namespaces` binding to the `default` namespace.
- `ETAG_CACHE` — KV namespace tracking per-source ETag and last-sync timestamp.

## Vars

- `AI_SEARCH_INSTANCE_ID` (default `tempo-global`) — instance must exist and
  have been created after 2026-04-16 (when built-in storage shipped).
- `SOURCES` — JSON array configured in `wrangler.jsonc`. Each entry has `id`,
  `base`, optional `description`, and optional `indexPath` (defaults to
  `/llms.txt`). Adding a docs source should be a config-only change.

## AI Search metadata

Custom metadata fields must be defined on the AI Search instance before MCP
queries can filter on uploaded metadata. The checked-in schema lives at
`ai-search-custom-metadata.json` and matches the metadata attached by the
ingestor:

| Field                | Type   | Purpose                                  |
| -------------------- | ------ | ---------------------------------------- |
| `source`             | `text` | Filter results to one configured source  |
| `url`                | `text` | Return the canonical source page URL     |
| `source_description` | `text` | Describe the upstream docs source        |

Apply it with:

```bash
CLOUDFLARE_ACCOUNT_ID=<account-id> \
CLOUDFLARE_API_TOKEN=<api-token-with-ai-search-edit> \
pnpm --filter mcp-docs-indexer configure:metadata
```

Changing AI Search custom metadata triggers a full re-index. Re-run a forced
sync afterward if existing built-in-storage items need the new schema applied.

`docs.tempo.xyz` is intentionally not listed in `SOURCES` — it's the AI Search
instance's external website data source and is auto-crawled.

## Setup

```bash
# from repo root
pnpm install

# Create the KV namespace (one time) and copy the id into wrangler.jsonc
pnpm --filter mcp-docs-indexer exec wrangler kv namespace create ETAG_CACHE

# Generate Worker types
pnpm --filter mcp-docs-indexer gen:types

# Configure AI Search custom metadata so MCP queries can filter by source.
# Requires Cloudflare auth with AI Search:Edit permissions.
pnpm --filter mcp-docs-indexer configure:metadata

# Verify
pnpm --filter mcp-docs-indexer check
pnpm --filter mcp-docs-indexer test
```

## Tests

Unit tests use Vitest with mocked `fetch` / AI Search / KV bindings:

```bash
pnpm --filter mcp-docs-indexer test
```

## Observability

Cloudflare Workers Logs is enabled in `wrangler.jsonc` (`observability.logs`
with `invocation_logs: true`). Every cron run emits structured JSON lines via
`src/lib/log.ts`:

| Event                | When                                | Useful fields                                                              |
| -------------------- | ----------------------------------- | -------------------------------------------------------------------------- |
| `cron.start`         | scheduled handler invoked           | `cron`, `scheduled_time`, `instance`, `sources`, `force`                   |
| `source.complete`    | source synced or 304-unchanged      | `source`, `status`, `pages`, `unchanged`, `failed`, `deleted`, `duration_ms` |
| `source.failed`      | source threw or llms.txt non-OK     | `source`, `error`, `duration_ms`                                           |
| `cron.complete`      | all sources processed               | `duration_ms`, `sources`, `synced`, `unchanged`, `errors`, `force`         |
| `page.fetch_failed`  | per-page `<page>.md` GET non-OK     | `source`, `url`, `status`                                                  |
| `page.empty`         | empty markdown body                 | `source`, `url`                                                            |
| `page.too_large`     | page exceeds 3.5MB upload cap       | `source`, `url`, `bytes`                                                   |
| `page.upload_failed` | `uploadAndPoll` threw               | `source`, `url`, `error`                                                   |
| `page.delete_failed` | `items.delete` threw on stale page  | `source`, `key`, `item_id`, `error`                                        |
| `index.parse_failed` | corrupt JSON in `index:<source>` KV | `key`, `error`                                                             |

Tail logs to inspect cron runs:

```bash
pnpm --filter mcp-docs-indexer tail --format json
```

Query historical runs in the Cloudflare dashboard → Workers → `mcp-docs-indexer` →
Logs, e.g. `$.event = "source.failed"` to surface broken sources.

## Deploy

```bash
pnpm --filter mcp-docs-indexer deploy
```

Cron runs hourly. The Worker is not bound to a public route — `workers_dev`
is disabled in `wrangler.jsonc`. Tail logs to confirm the cron is firing:

```bash
pnpm --filter mcp-docs-indexer tail
```

## Verifying the result

After a sync, open the AI Search dashboard → `tempo-global` → **Items** tab.
You should see entries keyed by configured source id, such as `viem/...`,
`wagmi/...`, `vocs/...`, `mpp/...`, and `regen/...`, alongside the
auto-crawled `docs.tempo.xyz` entries.

Query the MCP endpoint to confirm cross-source ranking works:

```bash
curl https://mcp.tempo.xyz/ \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc":"2.0","id":1,"method":"tools/call",
    "params":{"name":"search","arguments":{"query":"permit2 signing with viem on tempo"}}
  }'
```

Streamable HTTP MCP responses are server-sent events; strip the wrapper with
`sed -n 's/^data: //p' | jq` if you want to pipe them into `jq`.

## Known limitations

- **No backfill for orphaned items.** If KV is wiped, the next sync re-uploads
  every page but loses track of items that AI Search still has from previous
  runs. Recovery: re-run a forced sync, then prune from the AI Search dashboard
  if needed.
