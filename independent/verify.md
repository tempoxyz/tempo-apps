# Independent verification

Candidate `feb1fe8dff95e2bd5690b1d6383eb43099169e7c`, base `9609e28fb458c32510053458e4609a090fa9c729`. Detached worktree `/tmp/recent-independent-verify`, installed with `pnpm install --frozen-lockfile`. Node24.14.0, pnpm10.33.0, system Chrome via Playwright. All tracked files remain clean; no production edits. Frozen acceptance and verification-plan hashes equal freeze.sha256.

Verdict: PASS for AC1–AC6 and the local portions of AC7. Final complete browser.cjs exited0 with zero page errors; browser-extra.cjs separately exited0. No actionable production finding remains. This report covers local gates only; it never grants merge/deploy permission or substitutes for Cyclops and current-head remote checks.

## Independently executed repository checks

All ten commands in checks.sh exited0; UTC times and results are in check-results.tsv, detailed output in check-1.log through check-10.log:

- gen:types, root check (including postcheck), root check:types;
- explorer Worker tests:21 files,205 passed;
- explorer check:env (Node suite):38 passed files,1 skipped;301 tests passed,1 skipped, including14 new history tests;
- explorer check:types:test, root Biome check (12 warnings, no errors), lint:tempo;
- explorer build and all precommit hooks.

`git diff --exit-code` and `git diff --check 9609e28 HEAD` passed after the run. See environment.json and install.log.

## Behavioral checks and evidence

`browser.cjs` uses actual ExploreInput in the running candidate, real localStorage and actual navigation. Only the suggestions case fulfills `/api/search` with a deterministic single block result. Fixtures contain all four record kinds, address/token sharing the same address, and six records. Assertions compare literal record order/metadata and URL/query/focus/selection, not just absence of exceptions.

- AC1: mouse, mobile tap, real Tab→Space and focused Enter remove without URL/query change. Each retains input focus.
- AC2: remove address while token at the same address survives; exact records/order/metadata and sentinel key asserted; full reload shows deletion. Unit tests cover address/hash case folding, duplicates, missing identity and immutable input.
- AC3: select last row with ArrowUp, remove a different row, assert no active descendant, then ArrowDown/Enter activates the intended surviving first row. Remove the final focused control, assert grid closes and input retains focus; typing/manual Enter subsequently routes to the new block.
- AC4: browser-extra.cjs separately proves pointer activation/deduplication, actual remount persistence and re-adding a removed block to front. Main suite checks Clear,6-record cap, and query listbox suggestions with no remove controls.
- AC5: actual accessibility tree archived in aria-snapshot.txt shows grid/row/gridcell/named-button structure. DOM assertions find no nested buttons or button under listbox option. Real Tab reaches removal with nonzero focus outline; keyboard-focus.png was visually inspected. mobile.png at390×844 was inspected; every settled removal box is nominally32×32 (0.1px floating-point tolerance) and within viewport. Before baseline screenshot was visually compared.
- AC6: browser setItem/removeItem faults leave effective in-memory deletion and responsive input while disk retains old data. Malformed history is safe. Global inaccessible-storage getter is tested by production-helper Node suite; scoped history getItem denial is exercised in the actual browser. No durability promise is inferred after failed persistence.
- AC7: full local checks above; external completed Cyclops and current-head CI remain required.

## Failed observations retained

The initially supplied localhost3003 server was absent; connection-refused log is retained. Started the exact candidate from the verifier worktree. An initial run alongside build acted on an unhydrated SSR form and triggered native `?explore-query=412` navigation; added explicit React hydration readiness and restarted dev after checks. Subsequent broad getter-denial experiment exposed unrelated TanStack development-tools storage reads; denied-debug.log records that failure, and separately observed that the app could hydrate with the same denial. It is not presented as a clean whole-app storage-denial run. The final browser fault targets the history key; the broader production-helper boundary is covered directly by Node tests. Using localhost aligns with configured API origin and removes127.0.0.1/localhost CORS noise.

One measurement sampled the popup's mount-scale animation before its32px targets settled. Preserved browser-animation-race.log, then added350ms solely before geometry/screenshot measurement and0.1px bounding-box tolerance for fractional transforms. A separate immediate aria-expanded assertion sampled before React's closure effect; the final driver waits for aria-expanded=false rather than treating disappearance of the grid (which immediately becomes a different popup type) as proof that the effect has run. This is a verifier timing correction, not a feature patch. Other earlier logs remain separate from final successful evidence.

Browser execution may encounter unrelated live RPC429/preview data failures. The test's feature assertions use local history and navigation; they do not claim live chain data availability. No Antithesis campaign is required or claimed by the frozen targeted research.
