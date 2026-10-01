# Independent clipboard verification and audit

Candidate: `a7aa1d73eb7ce64a82dcd0d0b1da43c178c005b7`. Base: `9609e28fb458c32510053458e4609a090fa9c729`. Factory: `02bd8907509c2bb9d61683373a3b4c532b6e70e6`. Verified October 1, 2026 against the candidate's clean worktree. No source edits, commits, publication, merge or deployment performed.

Disposition: FAIL / repair required. Repeated synchronous failures do not produce a fresh accessible result, violating AC1 accessible feedback and AC2 clearing stale feedback for retry (reproduced below). Merge-ready is NOT established here: parent must reconcile final types/lint/build evidence, Cyclops and current-head CI. Any repair invalidates this candidate's evidence.

## Independent evidence

- `node.log`: focused suite, 16 passed.
- `full-node.log`: actual `pnpm --filter explorer check:env`, 303 passed and 1 skipped across 39 files.
- `full-worker.log`: actual `pnpm --filter explorer test --run`, 205 passed across 21 files.
- `browser-pass.log`: actual system Chrome/Playwright, running fixture-backed `/demo/address` on base port 3001 and candidate port 3004. Denied and synchronous writes, missing Clipboard API, visible persistent alert, preserved focus, keyboard dismissal without navigation, exact retry payload, 800ms success expiry, mobile bounds. Actual React StrictMode harness imports production hook/CopyButton/permalink modules: configured timer, cross-control old rejection, same-hook old success after latest failure, pending unmount, exact permalink and boolean-only event payloads.
- `native-policy-final.log`: unmodified native Chrome `writeText` rejected by `Permissions-Policy: clipboard-write=()` produces alert. Removing policy via reload permits native write and success. Also records repeated synchronous error DOM behavior below.
- `accessibility.json`: Chrome accessibility tree exposes `alert` with assertive live region and atomic=true. No actual screen-reader software was exercised.
- `before.png`, `after.png`, `mobile.png`: independently captured; desktop and mobile candidate visually inspected. Dev-only TanStack widget overlaps part of mobile Dismiss control; keyboard dismissal works and production excludes that widget (`__root.tsx:463`).
- `git diff 9609e28..HEAD --check` passed; tracked worktree stayed clean at the exact candidate SHA. No dependency/config/consumer changes in diff.

Browser scripts are portable `.cjs.txt` files: execute with `node --input-type=commonjs < browser.cjs.txt` (paths/ports currently absolute). Harness module is the preserved `.factory/clipboard/clipboard-harness.tsx.txt` temporarily served as `apps/explorer/_verify/clipboard-harness.tsx`; it is excluded/untracked and absent from the candidate commit.

All failed observations remain: initial `.txt` execution mode error, stopped candidate server, innerText whitespace and omitted regen Button title assumptions, native permission override attempts that did not yield denial, and premature native success observation. Final browser/native logs supersede those observation failures. Native denial proof uses response-header policy because permission-setting overrides alone did not reliably deny a user-activated native write.

## Acceptance mapping

1. Shared hook controls get one safe alert through root listener; exercised direct, shared and permalink consumers. Clipboard and raw exception contents never enter event/alert. FAIL for repeated synchronous failure: there is no new accessible alert update.
2. Original controls retry; successful retry clears prior alert, exact payload and existing configured success timers retained, no error expiry, keyboard dismissal, focus preserved. FAIL for repeated synchronous failure: false/true batches without clearing or replacing the existing rendered feedback.
3. Per-hook generation invalidates prior completions; global generation suppresses older control failures; cancellation clears timer and invalidates pending callback. Node and actual React/browser cases pass. PASS.
4. Missing/getter/throw failures caught, `copy(value): Promise<void>` and notifying remain compatible; render creates closures but does not access browser globals. Actual SSR page loads plus Node tests pass. PASS.
5. Browser denial/retry/missing/direct/permalink/mobile/keyboard and independent suite execution pass. Full preparation evidence supplied by implementer is separate; final Cyclops/CI remain parent-owned. NOT YET MERGE-READY.

## Audit

The safety fact is that every UI success update checks the controller generation after await, and failures additionally obey a global latest-feedback generation (`clipboard.ts:3-15,32-60`). Tests execute the production controller, and the running React app confirms late completions cannot revive disposed or superseded state. Timers do not alter error state. UseSyncExternalStore observes a stable controller and effect cleanup calls cancel (`hooks.ts:17-25`). Each existing consumer reads only notifying and/or ignores/awaits copy's void promise; no payload formatting or handler propagation changed. Reviewed surrounding usages across CopyButton, Account/Block/transaction cards, decoded/raw/state/trace views, Contract/Reader/Writer/CodeView, AbiArgument, Receipt, error details, simulation and permalink hook. There are no consensus, authorization, storage migration or RPC changes.

Blocking accessibility finding, `apps/explorer/src/comps/CopyFeedback.tsx:6-10`: a repeated synchronous failure updates false then true during one React event and leaves the existing alert unchanged. In actual Chrome with navigator.clipboard unavailable, clicking Copy twice yields zero alert mutations and the same DOM node. A screen reader therefore has no new live-region update announcing that the retry failed. Consider an attempt identity that changes the rendered alert on each current failure and add a repeated synchronous-failure React test. Initial failure is correctly exposed as an assertive alert and visible feedback remains throughout, but a failed retry must produce a fresh accessible result under AC1/AC2. Actual spoken announcement behavior was not claimed. Parent requested repair before progressing.

Baseline hydration warning is pre-existing: `baseline-dev.log` records relative timestamp 32s server versus 33s client and timezone title mismatch at the same route on the base SHA. Final deterministic browser comparison had zero pageerrors on both sides. Do not attribute the earlier candidate relative-time warning to this diff.

## Minimal reproduction for repair

1. Open candidate `/demo/address` and wait for hydration.
2. Set `Object.defineProperty(navigator, 'clipboard', {configurable: true, value: undefined})`.
3. Click the address copy button; observe the role=alert.
4. Save that alert node and observe `document.body` using a subtree childList/characterData MutationObserver.
5. Click the same copy button again. The alert node is identical and has zero relevant DOM mutations.

Production cause: `copy()` invokes `feedback(false)` at `clipboard.ts:49`, then synchronous missing-API failure invokes `feedback(true)` at line 53 in the same click event. `CopyFeedback` batches setFailed(false) and setFailed(true), ending at the existing true value. Minimal requested change: represent a current failure with a fresh identity so the rendered live region changes for every failed retry, then independently rerun initial/repeated sync errors, denied promise retry, stale cross-control completion and success recovery.
