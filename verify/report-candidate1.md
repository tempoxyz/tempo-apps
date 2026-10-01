# Independent verification — candidate 1: FAIL

Candidate: `6816fa2a4f0bd1bd56ddd6b77e22bed5cc607cf4`.
Base: `9609e28fb458c32510053458e4609a090fa9c729`.
Independent detached worktree: `/tmp/time-format-independent-6816fa2` (clean after checks).
Read the full five-file diff, repository AGENTS.md, frozen acceptance/verification plan/addendum, the requested Prove It Works and Test Behavior, Not Implementation skills, all `useTimeFormat()` call sites, timestamp/relative rendering, and test configuration. No production code, contract, or tracked test changes; no commits, pushes, merges, or deployments by this verifier.

## Blocking finding: AC2 fails on browser back/forward cache restoration

At `apps/explorer/src/lib/time-format.ts:13`, the cached in-memory format is returned forever. Nothing reconciles it with a newer same-origin preference when Chrome restores a previous document from its back/forward cache.

Reproduction with production-bundled **unchanged candidate modules**, real Chrome, and BFCache enabled:

1. Open first document; choose `local` using its real TimeColumnHeader.
2. Navigate to another document on the same origin; it restores `local`.
3. Choose `utc` there; both consumers display `utc`, storage contains `utc`.
4. Back restores the first document with `pageshow.persisted === true`.
5. Both controls still display `local` while storage contains `utc`.

Expected both consumers: `['utc', 'utc']`. Actual: `['local', 'local']`. The literal assertion exits 1. This violates AC2: “Back/forward and unmount/remount retain the preference.” Reconcile restored documents without breaking SSR, unavailable storage, or listener cleanup, then rerun the regression.

Evidence: [bfcache.log](bfcache.log), [reproduction](harness-candidate1/bfcache.mjs). This is a disposable integration harness, not an explorer route. It imports the exact candidate `useTimeFormat`, `TimeColumnHeader`, and `FormattedTimestamp`; production source was not replaced or mocked. Playwright's default `--disable-back-forward-cache` flag is explicitly removed, and the recorded `pageshow` sequence `[false,true]` proves the old document was restored. The failure is separate from the actual-route loading instability below.

## Passing focused evidence

`pnpm --filter explorer exec vitest run --config vitest.node.config.ts test/time-format.node.test.ts` — exit 0, 23/23 tests. [Log](focused-node.log).

`pnpm node /tmp/time-format-independent-harness/browser.mjs` — exit 0. [Results](react-browser.json). Independent real React `hydrateRoot` + `StrictMode` harness, two actual hook consumers, real browser localStorage:

- All four saved modes restore without an initialization write; missing, empty, uppercase, padded, object/array text, unknown, `null`, and `0` strings fall back to relative and recover on selection.
- Getter/getItem/setItem exceptions preserve working controls and latest shared in-memory mode through removing/remounting consumers and replacing the harness route subtree.
- Four alternating clicks, thirteen same-task alternating cycles, two functional updates, and another click after removing one consumer produce literal expected shared modes. Exactly twenty writes are attempted (zero with the throwing storage-property getter), excluding duplicated StrictMode changes/default overwrites.
- UTC label, UTC/local-in-UTC text `Nov 14, 22:13:20 UTC`, unix text `1700000000`, and `datetime="2023-11-14T22:13:20.000Z"` are asserted from actual DOM.
- Two unrelated storage sentinels remain unchanged.
- Server HTML has two relative outputs; a server-side setter attempt does not leak into markup. Later requests to the same SSR module still produce relative. Each saved/fault case records zero page errors, console errors, and recoverable hydration errors.
- A separate browser context verifies all four selections survive actual reload without reseeding storage on reload.

This supports AC1, AC3–AC7 and the ordinary mount/remount part of AC2. It does not erase the confirmed AC2 BFCache failure. Listener-mutation/cleanup also passes the existing focused Node tests; no direct private listener-counter instrumentation was used.

## Actual explorer routes: partial success, Back inconclusive

Actual candidate app on port 3000 with public testnet data: blocks selection to UTC, hard reload, navigation through home to tokens, tokens reload, then selection to unix all rendered correctly. [localhost run](back-localhost.log). This exercises real existing controls/routes and is distinct from the harness.

Back to home, then Back to the blocks URL left the home DOM rendered after four seconds, with HTTP 429 errors and no timestamp control to assert. The initial 127.0.0.1 run also had RPC CORS failures (`127.0.0.1` page to `localhost:3000/api/rpc`) and one TanStack `loadRouteMatch` `_nonReactive` exception. [Initial run](back-independent.log).

The matching baseline sequence on localhost:3001 rendered a relative blocks header after Back, but block rows were empty/loading and it also logged HTTP 429 responses. [Baseline run](back-baseline.log). Therefore the missing candidate route cannot honestly be called a proven baseline issue. Under unstable live data/router loading, this real-route Back experiment is INCONCLUSIVE; a repeat with stable loading is required. No preference-related hydration message appeared in these captured errors.

## Reproduction and environment

Node `v24.14.0` via `pnpm node`, pnpm `10.33.0`, repo-pinned React/Vite dependencies, system Chrome through `/tmp/factory-browser/node_modules/playwright`.

Frozen offline install exited 1 because the GitHub lints tarball was missing; frozen online install with `--ignore-scripts` exited 0. The ignored build scripts are not represented as repository-check evidence. Install logs are preserved alongside this report. Parent owns repository-wide checks/build, actual route screenshots, remote checks, independent audit, and Cyclops; none is represented here as passed.

Harness source is archived in `harness-candidate1/`. In the existing prepared environment:

```sh
cd /tmp/time-format-independent-6816fa2
TZ=UTC pnpm node /tmp/time-format-independent-harness/server.mjs
# In another terminal:
pnpm node /tmp/time-format-independent-harness/browser.mjs
pnpm node /tmp/time-format-independent-harness/build.mjs
python3 -m http.server 3013 --bind 127.0.0.1 --directory /tmp/time-format-independent-harness/dist
# In another terminal; expected exit 1 on candidate 1:
pnpm node /tmp/time-format-independent-harness/bfcache.mjs
```

Overall candidate outcome: **FAIL**, due to AC2. AC8 cannot be complete while that defect, actual-route Back uncertainty, or external gates remain unresolved. No Cyclops pass is claimed.
