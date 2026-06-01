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
                                3. for each page: GET <page>.md with
                                   If-None-Match (per-page ETag)
                                4. 304 → skip; 200 → uploadAndPoll,
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

Tail logs locally during a manual cron:

```bash
pnpm --filter docs-mcp tail --format json
```

Query historical runs in the Cloudflare dashboard → Workers → `docs-mcp` →
Logs, e.g. `$.event = "source.failed"` to surface broken sources.

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

- **`uploadAndPoll` is sequential within a batch.** Page fetches are
  concurrent (8 at a time), but indexing happens per page. For sources with
  hundreds of changed pages, a forced sync may take several seconds.
- **No backfill for orphaned items.** If KV is wiped, the next sync re-uploads
  every page but loses track of items that AI Search still has from previous
  runs. Recovery: re-run a forced sync, then prune from the AI Search dashboard
  if needed.
