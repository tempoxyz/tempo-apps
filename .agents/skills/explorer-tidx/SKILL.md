---
name: explorer-tidx
description: Explorer-only TIDX migration skill (PG-first, CH fallback for count-heavy paths)
---

# explorer-tidx

Use this skill when migrating or optimizing **Explorer API endpoints** in `apps/explorer` to use TIDX efficiently.

## Scope

- Applies only to `apps/explorer/src/routes/api/**` and supporting server query helpers.
- Do not use this as a generic monorepo data-access guide.

## Core Rules

1. **PG first**: use `tempoQueryBuilder(chainId)` for almost all reads and hydration.
2. **CH fallback for counts**: use `tempoFastLookupQueryBuilder(chainId)` only for count-heavy scans when PG is too slow.
3. **Exact totals**: preserve exact deduped totals for API responses unless product requirements explicitly allow approximation.
4. **No RPC fan-out when indexed data exists**: replace per-hash `getTransactionReceipt`/`getBlock` loops with bulk TIDX queries (`receipts`, `logs`, `txs`).
5. **Preserve API contract**: keep response shape, sort semantics, paging behavior, and cap flags stable.
6. **Never leak secrets**: never print `.env` values (especially `TIDX_BASIC_AUTH`) in logs or responses.

## Preferred Data Sources

- `txs`: transaction core fields and block timestamps.
- `receipts`: status, gas usage, effective gas price, contract creation, fee payer.
- `logs`: raw topics/data for event decoding and balance/event derivations.
- decoded event tables (for example `transfer`) via `withSignatures(...)` when useful.

## Query Strategy

### A) Count paths

- Avoid returning large hash lists only to count in JavaScript.
- Prefer DB-side `count(distinct ...)`.
- For multi-source totals, dedupe in SQL (union source hashes, then `count(distinct hash)`) to keep exactness.
- Apply capping intentionally and return cap metadata expected by the route (`countCapped`, `totalCapped`, etc.).
- If PG count is slow, move only that count query to CH via `tempoFastLookupQueryBuilder`.

### B) Transaction hydration paths

- For a known set of tx hashes:
  - query `receipts` in bulk by `tx_hash in (...)`,
  - query `logs` in bulk by `tx_hash in (...)` ordered by `tx_hash, log_idx`,
  - query `txs` in bulk by `hash in (...)` for tx fields.
- Build maps by hash and reconstruct in requested sort order.
- Prefer `block_timestamp` from indexed tables over extra RPC block calls.

### C) Contract creation paths

- Prefer indexed lookup in `receipts` by `contract_address` before using RPC binary search.
- Keep existing fallback behavior only where strictly needed.

## Endpoint Migration Workflow

For each endpoint:

1. Identify bottlenecks:
   - RPC call fan-out,
   - row fan-out (large intermediate result sets),
   - JS-side dedupe/count work.
2. Add/extend helpers in `apps/explorer/src/lib/server/tempo-queries.ts`.
3. Migrate route logic to helper-based TIDX reads.
4. Preserve output parity (fields, ordering, pagination, cap flags, nullability).
5. Keep engine split explicit:
   - PG helper by default,
   - CH helper only for heavy counts.
6. Validate with:
   - `pnpm check`
   - `pnpm check:types`
   - `pnpm test` (affected app/workspace)
   - `pnpm precommit` (before commit)

## Explorer-Specific Guardrails

- Reuse existing parsing/domain logic (`parseKnownEvents`, receipt/tx formatters) rather than reimplementing business logic.
- Keep route-level try/catch and error response behavior consistent.
- Keep current limit constants and pagination semantics unless explicitly changing product behavior.
- Prefer minimal, composable helper additions over route-local SQL duplication.

## Definition of Done (Per Endpoint)

- Endpoint no longer performs avoidable RPC fan-out for indexed data.
- Count paths do not ship large dedupe sets over the wire.
- PG-first + CH-count-fallback policy is enforced in code.
- Response contract is unchanged (or intentionally versioned).
- Checks and tests pass for affected code.
