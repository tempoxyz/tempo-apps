# saved-choice-eventually-visible

For an available valid saved preference, hydration settles with that preference visible rather than remaining at fallback.

Evidence at plan baseline: `TimeFormat.tsx hook; RootDocument hydration boundary.`. Relevant acceptance: AC3, AC6. Current behavior is described in sut-analysis; this property is the intended post-change contract.

Test sequence: Seed unix or utc, hydrate, observe stable selected mode and matching visible timestamps.

Assertion choice: Sometimes. This is meaningful progress to a saved nondefault mode, not mere code reachability; deterministic local test awaits settled render.

Instrumentation status: missing; no existing Antithesis instrumentation was found. A future workload can observe rendered mode and storage operations. For storage fault and hydration branches, optional test-only read/write/subscribe checkpoints can clarify ordering; no production SDK change is proposed.

Open Questions: None under scope.

### Investigation log

Examined hook, all five consumers, root SSR shell, theme persistence, and Vitest configuration. Found no consumer-specific initial mode or external setter use; fixed relative components are explicit and stay fixed. Scope resolved to existing hook consumers and same-tab coherence, with persistence conditional on functioning storage.
