# Transaction Simulator — implementation spec

Status: ready to implement. Scope is Phase 1 only.

## Goal

Let someone paste a call (or load an existing transaction), run it against chain state without
signing, and see exactly which nested frame reverted and why. Everything renders through
components the explorer already has.

Ship it as **"Simulate"**, not "Debugger". No source-line stepping in this phase; the name should
not promise it.

## Non-goals for this phase

State/code/block overrides, block picker, Tempo batch simulation, frame-level trace diffing,
source-line mapping, `structLogs`, forks, saved simulations, expression evaluation. Several are
already proven feasible (see Appendix B) but none are in scope here.

---

## Verified facts

Probed live on 2026-08-06 through `proxy.tempo.xyz` (the browser-facing RPC path).

| Method | Moderato (42431) | Mainnet (4217) |
| --- | --- | --- |
| `debug_traceCall` + `callTracer` (`tracerConfig.withLog`) | works | works |
| `debug_traceCall` + `prestateTracer` (`tracerConfig.diffMode`) | works | works |
| `eth_simulateV1` (`traceTransfers`) | works | works |
| `tempo_simulateV1` | rejected at proxy | rejected at proxy |

Response shapes observed:

- `callTracer` logs: `{address, topics, data, position, index}` — **not** receipt-shaped.
- `eth_simulateV1` per-call results: `{status, gasUsed, maxUsedGas, returnData, logs[]}` where each
  log **is** receipt-shaped (`blockHash`, `blockNumber`, `transactionHash`, `logIndex`, `removed`).
- `prestateTracer` captures TIP-20 balances as storage slots on the token account
  (`0x20c0…`, `code: "0xef"`), so `decodeStorageChange` already handles simulated diffs.

### Pre-work task (blocking, ~2 min)

Everything above was verified against `proxy.tempo.xyz`. The explorer's **server-side** transport
does not use that proxy: `src/wagmi.config.ts:83-91` routes mainnet/testnet through
`${tempoApiUrl}/rpc/${chainId}` with a `tempo-api-key` header. That is a different gateway and may
permit a different method set.

**Before writing Task 2**, confirm the three methods above work through the Tempo API passthrough
with a real key. If any are missing there, the server route must fall back to the proxy URL for
those methods.

---

## Architecture

Three RPC calls, issued in parallel, each feeding a different panel:

| Call | Feeds |
| --- | --- |
| `debug_traceCall` + `callTracer` (`withLog: true`) | the call tree — the only source of nested frames |
| `debug_traceCall` + `prestateTracer` (`diffMode: true`) | `TxStateDiff` |
| `eth_simulateV1` (`traceTransfers: true`) | status, gas, return data, and receipt-shaped logs for events + balance changes |

`eth_simulateV1` earns its place because `parseKnownEvents()`
(`src/lib/domain/known-events.ts:1428`) takes a `TransactionReceipt`, not a log array. Its logs
drop into a synthesized receipt almost unchanged, so the entire existing event-interpretation and
memo pipeline works without modification. Reconstructing the same thing from `callTracer` logs
would mean flattening depth-first and fabricating log indices.

### Result type

Normalize into the existing shapes so the render components need no changes:

```ts
// src/lib/queries/simulate.ts
export interface SimulationResult {
  trace: CallTrace | null          // from callTracer — same type as #lib/queries/trace
  prestate: PrestateDiff | null    // from prestateTracer
  status: 'success' | 'reverted'
  gasUsed: bigint
  returnData: Hex.Hex
  logs: Log[]                      // from eth_simulateV1, receipt-shaped
  receipt: TransactionReceipt      // synthesized; see Gotcha 3
  errors: { callTracer?: string; prestate?: string; simulate?: string }
}
```

Each of the three calls fails independently. A failure in one populates `errors` and leaves its
panel empty; it must never blank the others.

---

## Tasks

Ordered by dependency. Tasks 1 and 4 are independently shippable and improve `/tx/$hash` on their
own — land them first, separately.

### Task 1 — Decode revert reasons from per-frame ABIs

Ships standalone. Improves the existing transaction page immediately.

Today `buildFailureSummary` decodes revert bytes against the bundled `allAbis` plus a one-error
fallback (`src/lib/domain/tx-summary.ts:203-224`), so custom errors from arbitrary verified
contracts don't decode. But `useTraceTree` already has a per-address `abiMap` built from
`batchAbiQueryOptions` (`src/comps/TxTraceTree.tsx:104-128`). Decode where the ABI already is.

1. Add to `TxTraceTree.Node`:
   ```ts
   decodedError?: { name: string; args: readonly unknown[]; signature?: string }
   ```
2. Populate it inside `buildNode` (`TxTraceTree.tsx:130`) for frames where `hasError` is true.
   Resolution order:
   1. `Error(string)`
   2. `Panic(uint256)` — map the code to text via a new table (`0x01` assertion failed,
      `0x11` arithmetic overflow/underflow, `0x12` division by zero, `0x21` invalid enum,
      `0x32` array out of bounds, `0x41` out of memory, `0x51` uninitialized function pointer)
   3. custom error from that frame's `abiMap` entry
   4. `sigMap` signature lookup (already fetched in the same batch)
   5. raw bytes
   Reuse the existing `getRevertData` extraction logic at `tx-summary.ts:278`.
3. Change `buildFailureSummary` to take the built `TxTraceTree.Node` tree instead of a raw
   `CallTrace`, and delete the `allAbis` / `fallbackErrorAbi` decode path.
4. Render the decoded error in the trace tree in place of the current raw
   `[{trace.revertReason || trace.error}]` at `TxTraceTree.tsx:342-346`.

**Acceptance:** a mined transaction that reverts with a custom error from a verified,
non-bundled contract shows the decoded error name and arguments on both the summary line and the
failing trace frame.

### Task 2 — Simulation query layer + server route

`src/lib/queries/simulate.ts`:

- `simulateQueryOptions(input)` → the three parallel calls, normalized to `SimulationResult`.
- Query key must include chain id, block, and every call field, so React Query caches per-input.

`src/routes/api/simulate.ts` — follow the `createFileRoute('/api/…')({ server: { handlers } })`
pattern in `src/routes/api/code.ts:115`, with a `POST` handler:

- Validate the body with `zod/mini` (`zAddress`, `zHash` from `#lib/zod`); return
  `{ error: z.prettifyError(...) }` with status 400 on failure, matching `code.ts:141-146`.
- Cap calldata length and reject oversized bodies.
- Per-request timeout; return 504 rather than hanging.
- Rate limit (see below).
- Cache header: `no-store` when block is `latest`; `public, max-age=…` when pinned to a block hash.

**Rate limiting.** The global limiter runs at the worker entry
(`src/index.server.ts:121-126`, 100 req/10s per IP via `REQUESTS_RATE_LIMITER`). Tracing is far
more expensive than a normal read and needs its own budget: add a `SIMULATE_RATE_LIMITER` binding
to `wrangler.json` (next namespace id, suggest `simple: { limit: 10, period: 10 }`) and call
`checkRateLimit` with it inside the route handler.

**Acceptance:** `POST /api/simulate` with a valid body returns a normalized `SimulationResult`;
malformed input returns 400 with a readable message; exceeding the simulate limit returns 429.

### Task 3 — `/simulate` route and input rail

One screen. No wizard, no mode switcher. Three ways to populate the same form:

1. **Paste calldata** — `to` + `data`. Everything else collapsed by default.
2. **Pick a function** — when `to` resolves to a known ABI, show a function picker with typed
   inputs. Reuse `getWriteFunctions` (`contracts.ts:606`), `getInputType` (`:721`),
   `getPlaceholder` (`:695`), `parseInputValue` (`:734`), `isArrayType` (`:688`) — the same
   helpers driving `ContractWriter.tsx`. Encoding to calldata is the only new logic.
   Switching between paste and picker must be lossless both directions: encode on picker edit,
   attempt decode on paste.
3. **Load a transaction** — paste a hash or arrive from the tx page. Prefills `from`, `to`,
   `data`, `value`, gas; pins block context to the parent block.

Defaults: `from` prefills from the connected wallet if one is connected (a `tempoWallet` connector
is configured in `wagmi.config.ts:110`), else zero address. `gas` defaults to the block limit but
is **always visible** — a hidden gas field is how you get an unrealistic success.

**URL is the state.** Encode `from`, `to`, `data`, `value`, `gas`, `block` in zod-validated search
params following `src/routes/_layout/tx/$hash.tsx:92-102`, with `stripSearchParams` for defaults.
Every simulation is a shareable link, no server persistence. Long calldata will exceed practical
URL limits — cap it and fall back to a "copy as JSON" affordance rather than truncating silently.

**Acceptance:** a simulation can be fully reconstructed from its URL alone in a fresh tab.

### Task 4 — Failure-first collapsible trace tree

Ships standalone; improves `/tx/$hash` too.

`TxTraceTree` currently renders every frame expanded with no collapse control
(`TxTraceTree.tsx:351-359`). Fine for browsing a mined tx, wrong for debugging, where a 40-frame
trace has one interesting node.

- Add per-node collapse. Collapsed subtrees show `+N frames`.
- On revert, auto-expand only the path to the deepest failing frame; collapse siblings.
- Mark the failing path with a `text-negative` left rule all the way to the root, so the eye lands
  on it before reading anything.
- Preserve the existing `toAscii` copy output (it must still emit the full tree regardless of
  collapse state).

### Task 5 — Verdict banner

The single most important design element. The top of the results answers the question in one line
— it is not a field table.

```
✗  Reverted in AlphaUSD.transfer()
   InsufficientBalance(available: 69,008.87 aUSD, required: 100,000.00 aUSD)
   → jump to frame 3                          287,106 gas · block 29,738,867
```

```
✓  Succeeded · 287,106 gas · 3 events · 2 balance changes
   Transferred 100.00 aUSD from 0x1234…5678 to 0xabcd…ef01
```

- Success headline reuses `buildTxSummary`'s known-event formatting so a simulated transfer reads
  identically to a mined one.
- Failure headline uses Task 1's decoded error.
- "Jump to frame" scrolls to and highlights the failing node. `usePermalinkHighlight`
  (`src/lib/hooks.ts:155`) already implements this affordance elsewhere — reuse it.

### Task 6 — "Re-simulate" on the transaction page

Add the action to `/tx/$hash`, linking to `/simulate` with search params prefilled from the
transaction, block pinned to the parent.

For Tempo **batch** transactions (`tx/$hash.tsx:201-209` renders a `calls` array), `debug_traceCall`
cannot express a batch — it takes one flat call object. For this phase: let the user pick which
call in the batch to simulate, and label it plainly. Do not silently simulate only call 0.

### Task 7 — Diff against the original

High value, nearly free: when re-simulating a mined transaction both results are in hand. Show
change chips beside the verdict.

```
vs. on-chain:   gas −12,340    status  reverted → success    events  +1
```

Summary level only this phase — gas, status, event count, top-level balance deltas. Frame-by-frame
diffing is out of scope.

---

## UX requirements

**Progressive rendering.** Unlike the tx page (which awaits everything in its loader,
`tx/$hash.tsx:111-121`), the simulator must render each panel the moment its call resolves. The
call tree usually lands first and is what people are waiting for. Skeletons sized to the eventual
content; never a full-page spinner.

**Editing must not destroy context.** When an input changes after a run, **dim** the existing
results and surface a Run affordance. Do not clear them. Comparing what you just saw to what you
are about to try is the core loop; blanking the screen on every keystroke breaks it.
Cmd/Ctrl+Enter runs from anywhere on the page (`useKeyboardShortcut`, `src/lib/hooks.ts:128`).

**Honesty labels.** Two places where a simulator quietly lies:

- *Block context.* `debug_traceCall` executes at the end of a block. Replaying a transaction at its
  parent block does not apply earlier transactions from its own block, so a transaction depending
  on an in-block predecessor will diverge. Show it:
  "Simulated after block 29,738,866. Earlier transactions in block 29,738,867 are not applied."
- *Fees.* `getFeeBreakdown` needs a real receipt with fee logs; a simulation has none. Show gas
  only, labeled estimated. Do not synthesize a fee number.

**States to design deliberately:** empty (nothing run — offer two or three one-click example
calls, not blank space), running, RPC error vs. simulation revert (completely different things,
must not look alike), rate-limited, unverified contract (raw selectors, still fully usable — never
gate the whole view on ABI availability).

**Visual language.** Match the existing app: 13px section headers, `border-dashed border-distinct`
dividers, 12px mono for trace content, `text-accent` / `text-negative` tones, `Sections` for
layout, `cx()` for conditional classes, icons from `~icons/lucide/*`.

---

## Gotchas

1. **Do not reuse the zero-address unwrap.** `fetchTraceData` strips a system-level wrapper frame
   (`src/lib/queries/trace.ts:59-64`) because `debug_traceTransaction` wraps execution in a CALL to
   the zero address. Verified: **`debug_traceCall` does not wrap** — it returns the real frame
   directly. Applying that heuristic to simulation output will silently discard the root frame
   whenever a call has exactly one subcall to the zero address.

2. **`callTracer` logs are not receipt logs.** They carry `position`/`index`, no
   `blockHash`/`transactionHash`/`logIndex`. Use `eth_simulateV1` logs for anything feeding the
   event pipeline.

3. **`parseKnownEvents` needs a receipt object**, not logs (`known-events.ts:1428`). Synthesize one
   from the `eth_simulateV1` result: real `logs`, `status`, `gasUsed`, `from`, `to`, plus
   placeholder block fields. Do not pass it to `getFeeBreakdown` (see Honesty labels).

4. **Three independent failure paths.** One tracer erroring must not blank the other two panels.

5. **Precompile targets produce no opcodes.** Verified: a `debug_traceCall` against a TIP-20
   precompile returns zero `structLogs`. Irrelevant this phase, but do not build abstractions that
   assume opcode-level data always exists.

---

## Definition of done

Per `AGENTS.md`:

- `pnpm check` from repo root — zero errors
- `pnpm check:types` from repo root — zero errors
- `pnpm test` in `apps/explorer` — passing
- No stray `console.log`
- PR description includes a before/after screenshot table (UI change)

Manual verification, on both mainnet and Moderato:

1. Paste a TIP-20 `transfer` that will revert for insufficient balance → verdict banner names the
   contract, function, and decoded custom error with formatted amounts.
2. Same call with an amount that succeeds → success verdict, events and balance changes populated.
3. Load a mined transaction, re-simulate unchanged → result matches the on-chain outcome, diff
   chips show no deltas.
4. Change the amount and re-run → previous results dim rather than clear; diff chips update.
5. Copy the URL into a fresh tab → identical simulation reproduces.
6. Simulate against a contract with no verified ABI → raw selectors render, page stays usable.

---

## Appendix A — Rate and capacity, unresolved

Tracing costs the node a full re-execution, roughly one to two orders of magnitude more than a
normal read. Four parameters depend on limits we do not know: the `SIMULATE_RATE_LIMITER` numbers,
cache TTL (and whether to default the block to pinned rather than `latest`), the request timeout,
and whether opcode traces are affordable at all later.

Measured lightly (individual requests, no load test — deliberately not probing production limits):
`callTracer` 285 B–1.2 KB at 0.21–0.30 s; `prestateTracer` 1.9 KB at 0.41 s; `structLogs` with
stack/memory/storage disabled 14.7 KB / 206 steps at 0.37 s. **Treat these as floors.** The sampled
mainnet blocks held one or two transactions with 1–2 frame traces. The transferable number is the
ratio: ~70 bytes per opcode step even with stack and memory off, so a contract-heavy transaction at
50k steps approaches 3.5 MB.

The suggested limiter values above are a conservative starting point, not an informed one. Ask
whoever operates `proxy.tempo.xyz` and owns the Tempo API plan for real numbers.

## Appendix B — Proven-feasible, deferred

Verified working on both networks, available whenever they're scoped:

- **State overrides.** `stateOverrides` on `debug_traceCall` applies correctly — confirmed by
  overriding an account balance and seeing it reflected in the `prestateTracer` `pre` block.
- **Block overrides.** `blockOverrides` (e.g. `time`) is accepted.
- **Multi-call / batch simulation.** `eth_simulateV1` runs sequential calls in one block and
  returns per-call status, gas, return data, and receipt-shaped logs — the right primitive for
  Tempo batch transactions.
- **Source-line mapping.** The verification service stores source maps; the explorer just doesn't
  request them. Adding `runtimeBytecode.sourceMap` to `CONTRACT_SOURCE_FIELDS`
  (`src/lib/domain/contract-source.ts:7`) is the entry point. Only meaningful for real EVM
  bytecode, per Gotcha 5.
