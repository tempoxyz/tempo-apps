# Independent verification — candidate 2: PASS for feature behavior

Exact candidate: `7471c7ad91f5a45440b26580b90cc646caa54ee1`.
Base: `9609e28fb458c32510053458e4609a090fa9c729`.
Independent worktree: `/tmp/time-format-independent-6816fa2`, switched cleanly from candidate 1 to detached candidate 2; its historical directory name is not its revision. [Recorded environment](candidate2/environment.txt). `git status --short` was empty after verification. No production source, criteria, or tracked tests were edited by the verifier.

Read the complete initial diff and surrounding consumers/rendering/configuration, then the entire repair diff. Candidate 1's independent failure remains preserved in [report-candidate1.md](report-candidate1.md). No remaining actionable timestamp defect was found in candidate 2.

## Previously blocking defect is fixed

The real Chrome BFCache reproduction now passes. Two original candidate hook consumers display the latest same-tab mode after full-document Back/Forward: UTC → unix → relative → local. Every restoration explicitly asserts `pageshow.persisted === true`; this is actual browser cache restoration, not a synthetic pageshow event. Both unrelated storage sentinels remain unchanged; no page errors occurred. [BFCache evidence](candidate2/bfcache.log).

The same portable test runner was first validated on candidate 1: the React suite passed and the actual cached Back restoration failed with local/local instead of utc/utc. [Candidate 1 comparison](portable-candidate1-validated/bfcache.log). This confirms the regression test distinguishes the broken and repaired behavior.

## Focused independent checks

| Command | Result |
| --- | --- |
| `pnpm --filter explorer exec vitest run --config vitest.node.config.ts test/time-format.node.test.ts` in independent worktree | Exit 0; 31/31 tests. [Log](candidate2-focused-node.log) |
| `verify/harness-candidate1/run.sh /tmp/time-format-independent-6816fa2 .../verify/candidate2` | Exit 0; 17 React browser scenarios plus production-bundled native BFCache regression. [React results](candidate2/react-browser.json), [BFCache results](candidate2/bfcache.log) |
| `verify/harness-lifecycle/run.sh /tmp/time-format-independent-6816fa2 .../verify/candidate2-lifecycle` | Exit 0; mounted/unmounted listener lifecycle, persisted reconciliation and failed writes. [Log](candidate2-lifecycle/lifecycle.log) |
| `node /tmp/factory-browser/verify-routes-candidate2.cjs` | Exit 0; actual explorer controls/navigation/reloads/Back and storage sentinels. [Log](candidate2/actual-routes.log), [source](candidate2/verify-routes-candidate2.cjs) |

The independent React harness imports actual `useTimeFormat`, `TimeColumnHeader`, and `FormattedTimestamp` from the exact candidate and runs real React `hydrateRoot` under `StrictMode`. It covers valid/invalid saved values, getter/read/write exceptions, two consumers, alternating rapid cycles and functional updates, removal/remount, mode-specific text/dateTime, no initialization writes, unchanged unrelated keys, all four modes across real reload, SSR fallback and later server requests. All 16 seeded/fault scenarios report zero console errors, page errors and recoverable hydration errors. Full details and literal assertions are in the [portable harness](harness-candidate1/README.md).

The supplemental lifecycle check instruments the browser's event registration boundary without modifying the candidate. It observes one active pageshow handler with two StrictMode consumers, zero after full React root unmount, and one after remount. A saved UTC update is visibly applied after complete unmount/remount; a later failed unix write leaves both remounted consumers visibly unix while storage still holds UTC. Final unmount leaves zero handlers. This proves the new listener is cleaned up and the repair preserves AC5/AC7; [reproduction](harness-lifecycle/README.md).

## Actual explorer evidence and limits

On the restarted actual candidate app at `http://localhost:3000`, the independent run completed:

1. Blocks (`?from=100000&live=false`) relative → local → UTC.
2. Full reload restores UTC.
3. Home → Tokens uses UTC; another full reload restores UTC.
4. Choose unix on Tokens.
5. Browser Back → Home → Back → Blocks eventually displays the unix header and populated unix timestamp rows (for example block #99997 shows `1767945713`).
6. Storage still holds unix; unrelated/theme sentinels remain unchanged.

The final condition waits for the rendered unix control instead of assuming asynchronous route loading has completed after four seconds. The previous candidate1 route observation therefore remains a historical inconclusive experiment, not a claimed timestamp regression. The repaired candidate passes the actual route requirement in this run.

No captured format-related hydration error occurred. This live-data run **did** capture HTTP 429 messages and errors from TanStack preloading (`_nonReactive`) and the unchanged block-number `onBlock` callback (`number` on undefined). These are recorded in full; this report does not claim the entire explorer session was error-free. The feature assertions succeeded despite those operational errors. The standalone candidate-module React/BFCache/lifecycle runs had no such errors.

## Acceptance disposition

AC1–AC7: PASS within the frozen feature contract, based on the combined exact-candidate focused tests, independent real React/Chrome experiments, actual explorer interaction, and code inspection. The confirmed candidate1 AC2 BFCache defect is repaired and its regression now passes.

AC8: this independent feature-verification portion passes. Repository-wide required checks, explorer build, before/after screenshots, independent audit, remote required checks and Cyclops remain parent-owned gates. Their status is not inferred from implementation reports or claimed passed here. Missing Cyclops infrastructure remains INCONCLUSIVE, never a pass; this report alone does not declare merge-ready.

No Antithesis campaign was run or required. No commit, push, merge, deployment, or external review comment was performed by this verifier.
