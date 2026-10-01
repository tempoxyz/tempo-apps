# Independent candidate 2 verification and audit

Candidate: `d650da17d46b17c1f410ee08631d60010a18062a`; base `9609e28fb458c32510053458e4609a090fa9c729`; prior reviewed candidate `a7aa1d73eb7ce64a82dcd0d0b1da43c178c005b7`; factory `02bd8907509c2bb9d61683373a3b4c532b6e70e6`.

Disposition: PASS independent feature verification and audit. Prior repeated synchronous failure finding is resolved. No remaining actionable diff findings. Publication, Cyclops, current-head CI and final merge-ready reconciliation remain parent-owned; no merge/deployment performed.

Read the entire repair diff and prior complete feature review. The only repair is `CopyFeedback.tsx`: failures now have monotonically increasing local identities; the alert is keyed by identity. A boolean false still clears feedback. A false/true pair batched during synchronous failure now changes both state and rendered alert identity. Global/per-controller generations, timers, hook API, clipboard payload and privacy boundaries are unchanged. The number is never shown or dispatched externally. Dismiss sets null. Effect registration/cleanup is unchanged.

## Independently executed against this exact candidate

- `native-policy.log`: actual Chrome's native clipboard denied by browser Permissions-Policy produces alert; removal and reload permits native successful copy. The former failure reproduction now asserts a different alert node AND nonzero DOM mutation records after missing-API retry. Repeated synchronous throw and rejected promise also replace the alert while preserving focus on the copy control. This verifies fresh live-region updates; actual spoken screen-reader output is not claimed.
- `browser.log`: real `/demo/address`, visible denial feedback, generic contents, focus preservation, assertive atomic alert in Chrome AX tree, persistence, exact retry payload, default 800ms success expiry, synchronous failure, keyboard dismissal, missing API and 390px mobile bounds. React StrictMode harness imports the production shared CopyButton/useCopy/useCopyPermalink and verifies exact permalink, cross-control stale rejection, same-hook stale success after newer failure, configured timer expiry, pending unmount and boolean-only feedback events.
- `node.log`: production controller focused suite, 16 passed.
- `git diff 9609e28..HEAD --check`: passed. Final HEAD is candidate SHA above and tracked worktree is clean. Temporary `_verify/clipboard-harness.tsx` was removed after testing.
- Fresh `after.png`, `mobile.png`, `accessibility.json` captured. Mobile image inspected; unchanged development-only TanStack widget overlaps part of Dismiss visually, excluded from production as previously established.

The browser captured one existing relative-time hydration mismatch (server31s/client32s and timezone title), preserved in `candidate-errors.json`. The identical class of warning was independently reproduced on base SHA previously and is preserved in `../baseline-dev.log`; there is no CopyFeedback stack/state mismatch and all post-hydration feature assertions passed.

Implementer-owned candidate2 full checks were read rather than claimed as independent reruns: 303 Node + 205 worker passed (one skip); types/check/precommit contamination failures are preserved with successful `check-retry.log`, `types-retry.log`, `precommit-retry.log`. Prior independent full suites were on candidate1; this candidate's additional repair is limited to React alert identity and was exercised directly in the browser.

## Frozen acceptance disposition

AC1/AC2: PASS, including fresh accessible feedback on repeated synchronous failures, generic safe contents, preserved focus and usable retry/dismissal. AC3: PASS, production generation/lifecycle paths unchanged and browser stale completion/unmount regression passes. AC4: PASS, missing API caught, compatible Promise<void>/notifying semantics and browser globals remain outside render. AC5 local behavior: PASS; remote audit/CI remain pending outside this report.

No code, tests, accepted criteria or gate policy were edited by this verifier. All scripts and raw results are in this directory; run scripts with `node --input-type=commonjs < script.cjs.txt` after restoring the disposable harness from the original preserved `.factory/clipboard/clipboard-harness.tsx.txt`. Baseline before screenshot remains at `../before.png`.
