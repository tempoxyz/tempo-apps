# Independent audit

Candidate: `6816fa2a4f0bd1bd56ddd6b77e22bed5cc607cf4`
Base: `9609e28fb458c32510053458e4609a090fa9c729`
Audit date: 2026-10-01

No meaningful production-code findings were identified. This is a code-review conclusion, not an assertion that the complete acceptance or delivery gates have passed. Browser and independent-verifier evidence is still being assembled, and the external gates below remain open.

The audit read the complete five-file diff, the frozen acceptance and verification plan, repository instructions, all five `useTimeFormat()` call sites and their timestamp renderers, the fixed-format fee-pool renderer, test configurations, package versions, precommit and Verify workflows, and shared factory gate definitions. It applied the blast-radius and boundary-discipline skills. Contract SHA-256 hashes still match `plan-freeze.sha256`.

## What changes

`apps/explorer/src/comps/TimeFormat.tsx:14` changes the hook from component-local state to a shared external store. Existing controls and formatting functions remain intact. The new store validates the saved string once, keeps the current choice in browser memory, and persists each selection under one new key. Server reads always return relative. `factory.yaml` separately binds the repository to ordered human/agent gates, pins the factory library, and disables merging and deployment.

## Critical safety fact and proof

Once initialized in a browser, the in-memory preference is authoritative for every caller. Failed persistence, subscription cleanup, and component remounts cannot replace it with the fallback. Initial reads and subscriptions do not write storage. Server reads cannot expose that browser state.

This fact is proven by execution at the module boundary. The focused test suite passed, and an independent deterministic model calls the actual candidate module through 10,000 operations across 100 seeds. The model alternates cycles, functional updates, observer cleanup/remount, failed writes, and simulated full reloads. It compares every snapshot with an independent four-value model, checks that the unrelated key stays intact, and checks server fallback after browser state has existed. The script lives at `audit-model.mjs` beside this report.

Commands run by this auditor from the repository root:

```sh
pnpm --filter explorer exec vitest run --config vitest.node.config.ts test/time-format.node.test.ts
pnpm node .factory/time-format/audit-model.mjs
git diff 9609e28fb458c32510053458e4609a090fa9c729 6816fa2a4f0bd1bd56ddd6b77e22bed5cc607cf4 --check
```

All exited 0. The focused suite reported 23 passing tests. The model reported `PASS: 10000 deterministic model operations across 100 seeds`. Diff whitespace checks emitted no errors. A separate `git cat-file -e` check confirmed all 18 configured skill bindings and `config/pipeline.yaml` exist at pinned factory revision `85b4291ae006fec0493ddd917a3191981a17eaf2`.

## Risks checked and cleared

- Restoring invalid or inaccessible storage cannot contaminate typed state. Exact string validation and exception handling are together at `apps/explorer/src/lib/time-format.ts:16`. Tests exercise missing, malformed, differently cased and unknown values, a throwing storage getter, failed reads and failed writes.
- Initialization cannot overwrite an existing choice. `getTimeFormat()` only reads storage; only `setTimeFormat()` writes it at `apps/explorer/src/lib/time-format.ts:46`. All four valid initial values have a no-write assertion.
- Functional updates use the latest state at `apps/explorer/src/lib/time-format.ts:43`. The rapid-cycle test checks every notification and write, and the independent model checks functional updater inputs.
- Cleanup is idempotent, and notification iteration tolerates removed/added subscribers at `apps/explorer/src/lib/time-format.ts:32` and `:51`. Existing tests verify a removed listener is not notified and newly added listeners do not extend the active notification loop. Actual React lifecycle coverage still needs the verifier's integration evidence.
- Server isolation follows from the explicit browser guard and constant snapshot at `apps/explorer/src/lib/time-format.ts:7`, `:12` and `:42`. The server-rendering test renders the real control both before and after browser state changes.
- Hydration chooses `getServerTimeFormat`, not the cached browser preference. The pinned React DOM 19.2.5 implementation in `apps/explorer/node_modules/react-dom/cjs/react-dom-client.development.js:8109` uses `getServerSnapshot()` during hydration and schedules `updateStoreInstance()`, which checks the client snapshot after commit at line 8238. No local React patch changes this behavior. This source trace supports the design but does not substitute for a browser hydration test.
- Removing the optional initial-format parameter does not break an existing caller. All five current call sites invoke `useTimeFormat()` without arguments. Shared behavior on blocks, tokens, policy, address and transaction pages is intentional under AC2. The fixed `format="relative"` fee-pool display remains explicit.
- The preference is a bounded display value, never an authorization decision or executable input. No backend, chain, transaction, network request or consensus code changes. The new key has no preexisting reader/writer in the repository.
- Cross-tab live synchronization is intentionally outside the frozen contract. Storage access is synchronous, so ordinary sequential user input cannot race writes. No `storage` event listener is required for this scope.
- `factory.yaml` is an agent instruction binding, not a new executable runner. Its ordered gates, inheritance rule, pinned skill paths, repair loop and merge/deploy limits agree with the shared workflow. Its missing Cyclops integration is explicitly an unfulfilled external prerequisite.

## Evidence sufficiency at this checkpoint

The implementer's recorded local checks in `check-results.tsv` all have exit status 0. Reviewed logs show 205 Cloudflare tests passed, 310 Node tests passed with one existing skip, passing type checks and precommit hooks, and a completed explorer build. Biome reports 12 warnings with no errors. These logs support the local-check claim; the independent verifier is repeating checks against the frozen candidate.

The committed suite proves storage and transition behavior and server rendering. It does not mount a client React root, exercise Strict Mode, or call `hydrateRoot`. Therefore those 23 tests alone do not fulfill the real-hook portions of AC2, AC6 and AC7. The in-progress verifier and browser experiments must supply that evidence before accepting the audit gate.

The current browser logs show baseline relative behavior after reload and candidate UTC restoration after reload. One initial navigation/back experiment timed out, and the retry log alone does not include enough assertions to certify the full real-route flow or absence of new hydration errors. This is incomplete evidence, not a reproduced feature bug. The parent is completing the browser experiment and recording its exact assertions and errors.

## External gates not yet fulfilled

Cyclops has not reviewed this candidate. The run log records the preflight blocked by Tailscale authentication. Remote required CI has not yet produced candidate-specific evidence. Neither missing gate is treated as passed, and this audit does not authorize a merge or deployment.

Before marking the audit accepted, reconcile the final independent-verifier report and real-route browser results with this exact candidate. Any candidate repair requires review and re-running affected checks. No production or contract edits were made by this auditor.
