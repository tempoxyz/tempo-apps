# Docs MCP operations

Worker: `mcp-docs-indexer`. Public endpoint: `https://mcp.tempo.xyz`.
AI Search instance: `default/tempo-global`. Metrics: `service:tempo-docs-mcp`.

## Signals and dashboard

[Service dashboard](https://us5.datadoghq.com/dashboard/ds9-dur-5ta) uses existing metrics. `monitors.json` contains proposed monitors, not active alerts. Review thresholds and the notification destination before importing each object through Datadog's monitor API. Public health follows the existing MPP Discovery MCP five-minute availability pattern; ingestion uses a three-hour window for hourly samples.

- Public health is protocol/tool availability; it can pass while AI Search is degraded.
- `health_check_ok{check:search_tempo_indexed}` tests indexed retrieval independently.
- `retrieval_count{mode:ai_search|source_index|empty,traffic:user|synthetic}` counts each completed search, including cache hits. Source-index fallback is useful but does not provide full indexed search quality.
- AI Search request/error counts and latency include failed calls. HTTP 200 is not sufficient: tool/JSON-RPC errors are separate metrics.
- `source_ready_age_seconds` is time since a clean sync with no known pending items. It starts only after the first confirmed clean result; missing data is not zero. This tracks the Worker's uploaded items, not crawler completeness or every upstream page's modification time.
- `source_pending_age_seconds` measures continuous backlog since first observation, not the age of its oldest item. Errors preserve the previous state. Sampling is hourly.
- `source_items` census rotates through one source per hour. Avoid short no-data thresholds on each source.
- `x-tempo-mcp-probe: health` separates built-in probes from user traffic. It is a diagnostic label, not an authenticated identity; clients can supply it.
- Request/run/version IDs are log fields, never metric tags. Error text, query text, URLs, and MCP arguments are not new metric dimensions.

## Confirmed crawler configuration failure

On October 18, 2026 UTC, `tempo-global` was enabled but configured with `source: docs.tempo.xyz`. Its crawler jobs repeatedly failed to fetch robots.txt because the redirect to `https://tempo.xyz/developers/robots.txt` was outside the configured direct-fetch scope. Indexing also had queued items, while public search could use source-index fallback. Correcting the crawler scope is necessary; queue recovery still needs verification after the change.

`configure:source` reads the existing instance and previews a change to `tempo.xyz`, restricted to `/developers` and its canonical sitemap. It preserves the other source parameters. It does not read Wrangler's credential store. Supply normal Cloudflare API credentials through the environment, never in shell arguments or committed files.

```sh
# From apps/mcp-docs-indexer with CLOUDFLARE_ACCOUNT_ID and
# CLOUDFLARE_API_TOKEN supplied by the normal secret-management workflow:
pnpm configure:source          # GET and preview only
pnpm configure:source --apply  # explicit production update after review
```

Before applying, retain the current `source` and `source_params` in an access-controlled location for rollback. After applying, read the instance back, inspect the next crawler job, and verify indexed health, pending counts, and a source-filtered search. Do not declare recovery from HTTP availability alone. Roll back by restoring those two original fields if the change is harmful. Avoid repeated forced re-indexing while a job is progressing.

API references: [website parsing](https://developers.cloudflare.com/ai-search/configuration/data-source/website/parse-types/) and [instance update](https://developers.cloudflare.com/api/typescript/resources/ai_search/subresources/namespaces/subresources/instances/methods/update/).

## Logs and debugging

Workers Logs has structured application events. Filter to `script_name=mcp-docs-indexer`, then event and `request_id` or `run_id`. `version` identifies the deployed Worker. `http.complete`, `http.failed`, `mcp.tool_complete`, `mcp.tool_failed`, `ai_search.failed`, `cron.failed`, and existing source/page events provide the execution trail. The logger retains the existing event-plus-object console format; it redacts URL credentials/query strings and common credential patterns from error messages. No request bodies or search arguments are added to logs. Redaction is defense in depth, not permission to log secrets.

Triage order:

1. Check public health and its per-check breakdown. Distinguish missing telemetry from a measured failure.
2. Compare indexed health, retrieval mode, dependency errors, and proxy fallback. Inspect AI Search job logs for scope errors or a stalled queue.
3. For ingestion, group `source.failed` by source. `page.fetch_failed` means an upstream HTTP failure; `page.html_response` means a supposed Markdown route returned HTML; `page.index_failed` means AI Search rejected an item.
4. Reproduce one failed public URL. Regen's `/tooltip.md` had no route; tips.sh returned HTTP 500 or HTML for multiple advertised Markdown pages. These are upstream content failures, independent of the crawler scope.
5. Trace request/run IDs within Workers Logs. Use metrics in Datadog to narrow the time and source before fetching logs.

## Remaining rollout and pipeline work

No production source update or monitor creation is performed by this PR. Merge/deploy the Worker and Regen route fix, review/apply the crawler change, then import the monitors and verify recovery over multiple hourly syncs.

The existing R2 exporter forwards `cwm-` metric lines; it is not an application-log drain. Application logs were available in Workers Logs, but not observed in Datadog. Adding structured fields does not make them appear in Datadog. Configure a separately reviewed Workers application-log destination to Datadog with service/source tags, parsing for the existing two-argument console format, redaction, retention, and a single-event delivery test. Keep metric lines out of the application-log index to avoid duplicate ingestion.

The shared `cloudflare-worker-metrics-exporter` also treats Datadog submission as best effort relative to OTEL delivery. Separate follow-up: persist/retry Datadog failures before acknowledging R2 batches, define duplicate handling, and alert on exporter delivery failures. Do not make the MCP Worker submit directly to Datadog with a new secret.

Resolve the remaining tips.sh Markdown failures in its owning repository. Failed sources currently retry the whole sync and do not persist partial successful indexes; improving partial retry semantics requires preserving deletion/migration guarantees and belongs in a separate change. Until these upstream failures recover, the ingestion monitor is expected to fire. These gaps should not be described as fixed by this instrumentation change.
