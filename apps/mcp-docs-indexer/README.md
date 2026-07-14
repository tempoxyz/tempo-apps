# mcp-docs-indexer

Resolver Worker that ingests configured external doc sites into
the shared **Cloudflare AI Search** instance `tempo-global`. The AI Search
instance may also crawl public websites directly, but this Worker uploads
canonical Markdown pages for configured sources into the instance's
**built-in storage**, tagged with a `source` metadata field for filtering at
query time.

The Worker exposes an optimized MCP endpoint on `mcp.tempo.xyz`. It handles
`tools/list`, `tools/call` for `search`, and docs source `resources/*` locally
so it can provide a compact tool schema, source-aware filters, and lower-token
search responses. Unsupported MCP methods fall through to the AI Search MCP
upstream, so clients still connect to a stable branded URL instead of the
opaque `<instance-id>.search.ai.cloudflare.com` hostname.

```
MCP clients ──▶ https://mcp.tempo.xyz/ ──▶ optimized search/resources
                                      └─▶ AI Search MCP fallback
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
                                4. strip repeated sitemap/docs chrome noise
                                5. unchanged content hash → skip upload
                                6. 304 → skip; 200 → items.upload(),
                                   record { item id, etag, content hash } in KV
                                7. diff against last sync, delete items
                                   that fell out of llms.txt
                                8. save new index + llms.txt ETag to KV
```

Once per UTC day (00:00 cron tick) the worker does a **forced deep sync** that
bypasses every ETag, as a backstop for sources whose `llms.txt` ETag doesn't
roll over when individual pages change.

Uploaded pages are normalized before indexing: repeated Vocs sitemap comments
and common docs UI chrome are stripped so AI Search embeds documentation text
instead of navigation boilerplate.

### KV layout (per source)

| Key                 | Value                                                    |
| ------------------- | -------------------------------------------------------- |
| `etag:<id>`         | last-seen `llms.txt` ETag (only stored on clean syncs)   |
| `last_sync:<id>`    | ISO timestamp of last sync attempt                       |
| `index:<id>`        | JSON map: `{ "<key>": { "id": "...", "etag": "...", "content_hash": "..." } }` |

`index` is the source of truth for stale-page deletion. We only advance
`etag` and `index` after a fully clean sync — partial failures don't update
state, so they retry on the next run instead of permanently desyncing.

The Worker has **no public sync or ingest endpoint**: source ingestion runs
exclusively from the scheduled cron handler inside Cloudflare Workers.

## MCP search behavior

The local `search` tool accepts Code Mode-friendly top-level controls:

| Field          | Purpose                                                        |
| -------------- | -------------------------------------------------------------- |
| `query`        | Natural-language question or code task                         |
| `source`       | Optional single source filter, e.g. `tempo`, `viem`, `mpp`     |
| `sources`      | Optional multi-source filter                                   |
| `max_results`  | Maximum chunks to return; defaults to `5`                      |
| `max_chars_per_chunk` | Maximum compact text chars per chunk; defaults to `1200` |
| `max_total_chars` | Maximum total compact chunk text chars; defaults to `2400` |
| `include_raw`  | Return full AI Search chunks instead of compact chunks         |
| `response_format` | Use `structured` to return data in MCP `structuredContent` with a short text summary |

When `source` and `sources` are omitted, the server applies a conservative
source hint for source-specific queries (for example `viem`, `wagmi`,
`virtual addresses`, `MCP server`, or `Regen button`). Explicit source filters
always take precedence.

Use `find_pages` when the task names a specific source and you need exact page
candidates before retrieving content. It searches the source's cached
`llms.txt` index and returns compact `{ title, url, score }` rows without
calling AI Search or reading page bodies.

Use `read_page` when a search result points at the exact page you need. It
fetches one same-origin docs page from a configured source, strips docs chrome,
and returns bounded cleaned Markdown (`max_chars`, default `12000`). Pass
`query` with `max_chars` to get a focused excerpt around the relevant section
instead of the leading page slice. This keeps search cheap while still letting
clients pull full page context on demand.

By default responses contain compact chunks with only `score`, `source`, `url`
or `key`, and cleaned query-aware `text` excerpts. This removes AI Search
internals, common docs chrome, and off-topic page regions before the result
enters an MCP client's context window. Compact output also returns at most one
chunk per page, preserving result diversity and avoiding repeated snippets from
the same URL. Search text is bounded by `max_total_chars` after page
deduplication, so broad searches cannot accidentally fill the client context
with five large excerpts. Advanced `ai_search_options` are still accepted and
normalized into the current AI Search binding shape.

Pass `response_format: "structured"` on `search`, `find_pages`, or `read_page`
when the client can read MCP `structuredContent`; this keeps the text content to
a short status line while preserving the same machine-readable result object.

AI Search response caching is enabled by default with the `close_enough`
threshold. Clients can override this with `ai_search_options.cache`.
The Worker also keeps a small 60-second in-memory cache of successful search
results per isolate to skip repeated AI Search round trips for identical
normalized searches.

If an AI Search metadata filter returns no chunks for a known source, the
server retries with a wider unfiltered search, filters chunks by source
metadata/key prefix, and remembers that source briefly so repeated filtered
queries skip the stale metadata-filter attempt.

The server also exposes MCP resources:

| Resource URI                 | Purpose                                      |
| ---------------------------- | -------------------------------------------- |
| `tempo-docs://sources`       | Summary of configured docs sources           |
| `tempo-docs://source/<id>`   | Per-source filter and indexing information   |
| `tempo-docs://source/<id>/index` | Compact cached `llms.txt` page index for a source |
| `tempo-docs://source/<id>/page/<path>` | Exact cleaned page read as Markdown |

The server also advertises matching MCP resource templates, so clients can
discover page indexes first and then read exact pages without spending search
tokens.

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

`docs.tempo.xyz` is listed as the `tempo` source so MCP clients can explicitly
pull core protocol and integration docs with `source: "tempo"` or `read_page`.

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

## Benchmark

Run the MCP fixture benchmark against production:

```bash
pnpm --filter mcp-docs-indexer benchmark
```

Run it against a local Wrangler dev server:

```bash
pnpm --filter mcp-docs-indexer exec wrangler dev --port 8790
pnpm --filter mcp-docs-indexer benchmark -- --endpoint http://localhost:8790/
```

The benchmark records latency, response bytes, returned text chars, chunk
count, expected source/URL/text hits, common docs chrome noise, and per-tool
summaries for `search` and `read_page`. Use `--strict` to fail on missing
expected hits, duplicate pages, docs chrome noise, empty search results, or
byte/text budget regressions. Use `--json` for machine-readable output.

## Evals

Run deterministic MCP evals against one endpoint:

```bash
pnpm --filter mcp-docs-indexer eval
```

Compare production with a local candidate:

```bash
pnpm --filter mcp-docs-indexer exec wrangler dev --port 8790
pnpm --filter mcp-docs-indexer eval -- \
  --baseline https://mcp.tempo.xyz/ \
  --endpoint http://localhost:8790/
```

The eval suite checks tool schema quality, configured source/index resources,
filtered search source/URL hits, exact `read_page` pulls, duplicate returned
pages, docs chrome noise, bytes, returned text chars, and latency. Add
`--strict` to exit non-zero unless every candidate eval passes.

Run the same eval cases through Promptfoo:

```bash
pnpm --filter mcp-docs-indexer eval:promptfoo
```

Point Promptfoo at a local candidate with `MCP_EVAL_ENDPOINT`:

```bash
pnpm --filter mcp-docs-indexer exec wrangler dev --port 8790
MCP_EVAL_ENDPOINT=http://localhost:8790/ pnpm --filter mcp-docs-indexer eval:promptfoo
```

Promptfoo uses `promptfooconfig.ts` as a thin config shim. The eval cases,
direct runner, and Promptfoo file provider all live in `scripts/eval-mcp.ts`,
so direct and Promptfoo evals share the same deterministic byte/text/source/URL
assertions. One eval case exercises MCP `structuredContent` directly so
regressions in structured output fail in both runners.

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

The Worker also emits `cloudflare-worker-metrics` lines for the existing
Cloudflare Logpush → metrics exporter → Datadog path. Metric names use the
`tempo_docs_mcp_` prefix and global tags `repository:tempo-apps`,
`component:docs_mcp`, and `service:tempo-docs-mcp`.

Important metrics:

- `tempo_docs_mcp_health_ok`
- `tempo_docs_mcp_health_check_ok`
- `tempo_docs_mcp_http_request_count`
- `tempo_docs_mcp_http_response_duration_ms`
- `tempo_docs_mcp_http_error_count`
- `tempo_docs_mcp_jsonrpc_error_count`
- `tempo_docs_mcp_tool_call_count`
- `tempo_docs_mcp_tool_duration_ms`
- `tempo_docs_mcp_ai_search_request_count`
- `tempo_docs_mcp_ai_search_duration_ms`
- `tempo_docs_mcp_ai_search_empty_result_count`
- `tempo_docs_mcp_proxy_fallback_count`
- `tempo_docs_mcp_ingest_ok`
- `tempo_docs_mcp_ingest_duration_ms`
- `tempo_docs_mcp_source_sync_count`
- `tempo_docs_mcp_source_pages_failed`

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
You should see entries keyed by configured source id, such as `tempo/...`,
`viem/...`, `wagmi/...`, `vocs/...`, `mpp/...`, and `regen/...`.

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
