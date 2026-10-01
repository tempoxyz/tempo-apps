# Independent audit of candidate 2

Candidate: `7471c7ad91f5a45440b26580b90cc646caa54ee1`
Base: `9609e28fb458c32510053458e4609a090fa9c729`
Audit date: 2026-10-01

No unresolved production-code findings remain in the reviewed candidate. The BFCache finding against candidate 1 and the combined storage-fault regression found during repair have both been addressed. Local audit verdict: PASS for AC1–AC7 and the local verification/audit portions of AC8. Candidate-specific browser evidence is sufficient. Cyclops and remote required CI remain unfulfilled, so the full delivery contract is not complete and the candidate is not yet merge-ready.

The audit read the complete diff, repository instructions, frozen acceptance and verification plan, all hook callers and downstream renderers, test/configuration files, the pinned React implementation and the shared factory workflow. It applied blast-radius and boundary-discipline. The acceptance and verification-plan hashes still match the frozen contract. HEAD matches the candidate above, and the tracked working tree is clean.

## Behavior and safety fact

The hook now shares one browser preference. Valid saved values initialize it, user changes persist it, and subscriptions make all consumers observe it. On BFCache restoration and the first subscription after a gap, the store reconciles a changed saved choice from a newer document. Failed persistence keeps the user's in-memory choice. An unchanged saved baseline, or the first recovered read after an unsaved choice with no known baseline, cannot undo that choice. Server reads always return relative.

That reconciliation rule is the critical safety fact for this repair. `apps/explorer/src/lib/time-format.ts:46` separates an unavailable read, an unchanged value, a first recovered baseline and a newly observed stored choice. `:67` installs one pageshow listener while subscribers exist and removes it after the last unsubscribe. Each subscription has a distinct callback identity, even when callers supply the same function. `:86` advances functional updates from the current preference and records whether saving succeeded.

Validation and exceptions remain at the storage boundary. Exact accepted strings are relative, local, utc and unix. No raw storage representation escapes through the hook. Timestamp formatting, UTC labels, button semantics, the fixed-format fee-pool display and all timestamp values remain unchanged. The removed initial-format argument has no existing caller. No backend, consensus, authorization or network behavior changes. Live cross-tab synchronization is outside the frozen scope.

Pinned React DOM 19.2.5 uses `getServerSnapshot()` during hydration in `react-dom-client.development.js:8109`, then checks the client snapshot after commit at line 8238. This explains why the constant fallback hydrates consistently and the restored preference subsequently appears. It also ensures first-subscriber reconciliation does not need a notification before the listener is registered. No React patch changes this implementation.

`factory.yaml` is a repository binding for ordered agent gates, not an executable runner. Its shared workflow and all 18 configured skill bindings exist at pinned factory revision `85b4291ae006fec0493ddd917a3191981a17eaf2`. It keeps merge and deploy disabled and explicitly requires actual Cyclops integration and candidate-specific evidence.

## Findings and disposition

1. Candidate 1 retained obsolete state when Chrome restored a previous document from BFCache. The verifier reproduced local on the old document after UTC was selected in a newer document. See `verify/report-candidate1.md`. The repair now reconciles on persisted pageshow and on remount after a period with no subscribers. Candidate 1's preliminary audit is preserved in `audit-candidate1.md` and must not be read as acceptance.
2. The initial repair lost an unsaved choice if initial reads and writes both failed, reads recovered, and the control remounted. The auditor reproduced expected local versus actual UTC with the real module. The repair now establishes the recovered baseline without replacing that choice. The exact reproducer passes against the frozen candidate. The pre-freeze evidence and history are in `audit-prefreeze-candidate2.md` and `audit-recovery.mjs`.

No additional useful review comment was identified. These are lifecycle/display issues, with no consensus or security implication. The first issue is an ordinary browser-history path; the second requires combined storage failures and recovery but is directly covered by AC5.

## Independent execution

The auditor reran all commands below after candidate 2 was committed. Every command exited 0.

```sh
pnpm --filter explorer exec vitest run --config vitest.node.config.ts test/time-format.node.test.ts
pnpm node .factory/time-format/audit-model.mjs
pnpm node .factory/time-format/audit-recovery.mjs
pnpm node .factory/time-format/audit-restore.mjs
git diff 9609e28fb458c32510053458e4609a090fa9c729 7471c7ad91f5a45440b26580b90cc646caa54ee1 --check
```

Results:

- 31 focused tests passed. The tests use real store and rendering code, assert exact values/notifications/writes, and include seven BFCache/remount cases plus the combined read/write fault regression.
- The separate deterministic model passed 10,000 operations across 100 seeds. It interleaves cycles, functional updates, failed writes, subscriptions and new module sessions, and checks unrelated storage and server fallback.
- The combined-fault reproducer reported expected local, actual local while disk still held UTC.
- The separate restoration script passed all 16 initial/restored mode pairs. It checks normal pageshow is ignored, persisted pageshow reconciles without writes, duplicate callback subscriptions remain independent, cleanup is idempotent, no active browser listener remains after the last unsubscribe, remount reconciles and SSR subscription is harmless.
- Diff whitespace checks passed. The frozen contract hashes remained unchanged.

The first candidate's passing pure-state model did not cover BFCache and therefore missed the original defect. The new browser regression is essential evidence, not redundant with module-session reload tests.

## Evidence sufficiency and remaining gates

`candidate2-final-check-results.tsv` records exit 0 for all ten repository checks. Reviewed output confirms 205 worker tests and 318 Node tests passed, with one existing skip; explorer build and precommit passed. Biome reports 12 warnings and no errors. The parent owns these full-check runs; the auditor independently ran the focused checks above.

The auditor reviewed `verify/report-candidate2.md`, the exact-candidate environment records, browser JSON, BFCache log, lifecycle log and the corresponding literal assertions. The independent browser runs establish the integration evidence that the Node suite alone cannot provide:

- Seventeen real React/Chrome scenarios use the candidate hook and controls with `hydrateRoot` and StrictMode. They cover all saved modes, invalid values, storage faults, shared consumers, rapid updates, functional setters, unmount/remount, timestamp text and semantic dateTime, later SSR requests and all four modes across real reload. The 16 seeded/fault scenarios report zero console, page and recoverable hydration errors.
- The native BFCache regression fails on candidate 1 and passes on candidate 2. Every restored document asserts `pageshow.persisted === true`; both controls follow UTC, unix, relative and local through actual Back/Forward. This proves the repaired behavior in the running browser, not just a synthetic event.
- The supplemental lifecycle run observes one active pageshow handler with two StrictMode consumers, zero after full root unmount, and one after remount. A stored change is rendered on remount; a failed subsequent write preserves the current in-memory choice through another remount. Final unmount leaves no active listener.
- Actual explorer route experiments pass blocks selection, full reload, Home-to-Tokens navigation, another reload, selection to unix and Back to populated blocks with unix timestamps. The parent's archived `verify/routes-candidate2.cjs` also asserts nonempty UTC-suffixed and numeric-unix token `<time>` text. See `browser-candidate2-rendered.log` and `verify/candidate2/actual-routes.log`. The verifier additionally checks unrelated/theme storage sentinels.

The earlier real-route Back uncertainty is resolved by waiting for the asynchronous route to finish rendering. The independent real-route run records HTTP 429 responses and errors in TanStack preloading and the unchanged block-number callback. The actual feature assertions still pass and no captured error is format-related. The parent's separate completed run reports zero page errors. This audit does not claim the entire live-data application is error-free.

The before/after screenshots now show loaded token rows and are available as `before.png` and `after.png`; the parent reports visual inspection. Screenshot comparison supplements the explicit DOM assertions and is not their correctness oracle. All reviewed feature evidence refers to the final candidate; historical candidate 1 evidence remains separately identified.

Cyclops has not reviewed this candidate because its preflight is blocked by authentication. Remote required CI has not yet supplied candidate-specific evidence. Missing infrastructure is inconclusive, never a pass. No merge or deployment is authorized by this report. No production or contract edits were made by this auditor.
