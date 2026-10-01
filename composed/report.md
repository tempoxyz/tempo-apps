# Independent four-feature composition verification

Disposition: PASS. Timestamp persistence, removable recent searches, trusted explorer URL search and clipboard failure/retry feedback compose without a reproduced integration defect. This is a disposable staged composition, not a commit, PR merge or deployment.

Base: `9609e28fb458c32510053458e4609a090fa9c729`.

Applied app-only base-to-head patches, in order:

1. Timestamp `e742c42d5ac002330bed538098b32b9edd960a01`.
2. Clipboard `d650da17d46b17c1f410ee08631d60010a18062a`.
3. URL search `a6a8f55b6ff83110f715c9bab56fd2a487872799`, which includes recent-removal parent `feb1fe8dff95e2bd5690b1d6383eb43099169e7c`. Recent-removal was not applied twice.

Exact composed index tree: `0ef70a898baee60598207487825a9757122e6d28`. No unstaged tracked modifications after validation. All 14 composed app files independently byte-compared equal to their respective source SHA versions (`source-files.json`). Patch SHA-256 values and full source SHAs are in `inputs.json`; actual patches are preserved beside it. Factory policy files are intentionally excluded from this application composition.

The disposable worktree previously contained old staged patches. Those were saved to `old-staged.patch.txt`, then replaced only within apps/explorer. Earlier failure evidence `/tmp/factory-combined-types.log` is preserved unchanged and copied to `old-types-failure.log`. No source candidate worktree was modified.

## Executed checks

All commands exited 0:

- `pnpm gen:types` → `gen-types.log`.
- `pnpm check:types` → `types.log`.
- `pnpm --filter explorer check:env` → `node.log`: 407 passed, 1 skipped, 42 files.
- `VITE_TEMPO_ENV=testnet RPC_AUTH_TOKEN=local-factory-placeholder pnpm --filter explorer build` → `build.log`: client/server production build passed; ordinary chunk-size warnings retained.
- `pnpm --filter explorer test --run` → `worker.log`: 205 passed, 21 files.
- `git diff --cached --check` and `git diff --exit-code` passed.

Combined suites: 612 passing tests and one skipped test.

## Actual composed browser flow

System Chrome with Playwright, live app on 127.0.0.1:3006. Final reproducible script `browser.cjs.txt`, run via `node --input-type=commonjs < .factory/composed/browser.cjs.txt`; result `browser-hydrated.log`.

1. Real /tokens table: cycle relative → local → UTC; reload; assert persisted storage `utc`, UTC control, and all rendered token timestamps ending in UTC. Screenshot `persisted-time.png` independently inspected.
2. Seed two valid recent blocks, load /demo/address, remove block7 by its real accessible remove control. Assert no navigation and block8 alone persisted and visible.
3. Paste a trusted alias URL; assert canonical Testnet destination. Clear the input; assert only block8 remains. No search API request is made for the trusted URL.
4. Activate the URL with keyboard; assert canonical external destination. External destination response alone is intercepted to avoid leaving the test; production navigation/parser executes. Return to local app and assert both UTC preference and remaining recent survive.
5. Use actual address copy control: rejected copy shows alert without success; missing-API retry produces a fresh alert DOM node; successful retry clears error and writes exactly the address. No clipboard contents/raw errors enter the message.
6. Return to real /tokens and verify UTC remains selected and block8 remains persisted.

The only clipboard mock controls success/failure at the browser API boundary. Token table and demo page components, timestamp store, recent store, URL parser/navigation and React feedback implementation are the composed production sources.

## Preserved observation failures and limits

Initial local .env dummy RPC_AUTH lacked the existing required `client:secret` shape, so SSR rejected configuration. The disposable local environment was corrected to a nonsecret colon-separated placeholder. A browser retry raced Vite restart and got connection refused. Another first-click attempt hit server-rendered controls before hydration and timed out; the final script explicitly waits for attached React props. These failures remain in browser.log, browser-retry.log, browser-second-retry.log and dev.log.

Final browser pass captured one relative-time hydration mismatch (53s server vs54s client) on the unchanged demo data; `browser-errors.json` retains it. The same defect was independently reproduced on base9609e28 in the prior clipboard baseline evidence. dev.log also retains an earlier block-watcher undefined-number rejection while using dummy RPC credentials. None of these occur in the four changed state paths; all final cross-feature behavior assertions pass. No claim is made that the whole application is free of pre-existing runtime warnings.

No sources were silently repaired. No commit, push, PR comment, merge or deployment was performed. Per-PR current-head CI/Cyclops and final delivery remain parent-owned.
