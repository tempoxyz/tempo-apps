# Local Cyclops repair proposal

Base: cyclops-core `8b6706d5142074f00ebfd13fed4db75494d2acb1`.
Local checkout: `/tmp/factory-cyclops-core`. Nothing committed, pushed, opened as a PR, or deployed. No model calls or audit submissions were made.

## Problem and change

The clipboard audit `scan_mup3kf2k_e0p3ab` recorded `unsupported_source_intent` for `nl -ba apps/explorer/src/comps/CopyButton.tsx | head -65`. This is a source-read telemetry gap; a successful worker can still leave negative conclusions blocked when their evidence intervals lack recorded reads.

The patch recognizes only `nl -ba PATH | head` with a positive safe-integer literal line bound in these forms: `-65`, `-n 65`, `-n65`, or `--lines=65`. It reuses existing returned-output matching against the prepared workspace source, then caps the accepted contiguous prefix at the literal bound:

```ts
const returnedEnd = item.end ?? returnedReadEnd(absolute, start, output, segment?.anchored === false);
const end = returnedEnd !== null && item.maxReturnedEnd !== undefined
  ? Math.min(returnedEnd, item.maxReturnedEnd) : returnedEnd;
```

A request for 65 lines that returns only matching lines 1–2 receives credit for 1–2. Missing or differing initial bytes receive no credit; a later gap or mismatch stops credit at the matching prefix. Source paths outside the workspace are still rejected. Authentication, immutable revision attribution, all existing shell classifications, exact-read evidence matching, and closure acceptance remain unchanged. No prompt or tool schema changes are made.

Arbitrary transformations, extra pipe stages, dynamic bounds, byte bounds, extra file arguments, zero/negative bounds, and unsafe integers remain unsupported. Broader complex shell forms present in the audit are not repaired here.

## Verification actually run

- Initial new regression tests against original source: 18 passed / 18 failed, reproducing the missing classification (`before-tests.log`). Eight further source-boundary tests were then added.
- Final focused tests: 44 passed / 0 failed (`after-tests.log`). Both Codex and Claude event transports are covered, with valid literal forms, shortened and empty output, middle truncation, differing source bytes, EOF, bound caps, outside-workspace paths, and rejected transforms/metacharacters.
- `bun install --frozen-lockfile`: succeeded using ordinary package installation; lockfile unchanged (`install.log`).
- `bun test src/runner/tool-coverage-head.test.ts src/runner/tool-coverage.test.ts src/__tests__/native-session.test.ts src/runner/code-coverage.test.ts src/__tests__/code-coverage.test.ts src/runner/audit-submission.test.ts`: 158 passed / 0 failed, 482 assertions (`regression-tests.log`). Includes existing pinned Git revision, exact-read citation/closure, replay, harness, and source attribution checks.
- `bun run typecheck`: passed (`typecheck.log`).
- `git diff --check`: passed.

## Operational limit

This patch is a reviewable local repair, not a completed rollout or audit pass. It does not repair every unsupported source command or guarantee that all four PR reviews will clear. Stored blocked results remain blocked. After an authorized service rollout and fresh immutable-head review, wait for artifact synchronization and require complete graph effectiveness with no blocked review completeness before treating a zero-findings run as clean.
