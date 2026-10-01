# durable-choice-survives-reload

With available storage, the last selected valid mode is restored after page reload or direct navigation in the same origin.

Evidence at plan baseline: `TimeFormat.tsx:6–25 currently has no storage; lib/theme.ts:31–59 is guarded precedent.`. Relevant acceptance: AC3. Current behavior is described in sut-analysis; this property is the intended post-change contract.

Test sequence: Seed each mode; reload fresh memory; verify startup never writes default over a valid seed.

Assertion choice: Always. At the restoration checkpoint, compare selected mode to the last successfully written user choice.

Instrumentation status: missing; no existing Antithesis instrumentation was found. A future workload can observe rendered mode and storage operations. For storage fault and hydration branches, optional test-only read/write/subscribe checkpoints can clarify ordering; no production SDK change is proposed.

Open Questions: None under scope.

### Investigation log

Examined hook, all five consumers, root SSR shell, theme persistence, and Vitest configuration. Found no consumer-specific initial mode or external setter use; fixed relative components are explicit and stay fixed. Scope resolved to existing hook consumers and same-tab coherence, with persistence conditional on functioning storage.

### Fresh review refinement

AC3 also requires storage-key isolation. Seed an unrelated sentinel/theme key; assert unchanged after initialization, every cycle, invalid timestamp-preference recovery, and reload. This is an additional oracle for the existing contract, not an acceptance change.
