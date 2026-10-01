# invalid-storage-falls-back

Absent or nonmember stored text cannot create an invalid displayed mode and falls back to relative before another valid choice.

Evidence at plan baseline: `TimeFormat.tsx:4 and :18–22 presume typed modes; raw storage will be untyped.`. Relevant acceptance: AC4. Current behavior is described in sut-analysis; this property is the intended post-change contract.

Test sequence: Missing, empty, uppercase, JSON text, unknown future values; then choose a valid mode.

Assertion choice: Always. Check membership and relative fallback for each bad input; do not infer validity from truthiness.

Instrumentation status: missing; no existing Antithesis instrumentation was found. A future workload can observe rendered mode and storage operations. For storage fault and hydration branches, optional test-only read/write/subscribe checkpoints can clarify ordering; no production SDK change is proposed.

Open Questions: None under scope.

### Investigation log

Examined hook, all five consumers, root SSR shell, theme persistence, and Vitest configuration. Found no consumer-specific initial mode or external setter use; fixed relative components are explicit and stay fixed. Scope resolved to existing hook consumers and same-tab coherence, with persistence conditional on functioning storage.
