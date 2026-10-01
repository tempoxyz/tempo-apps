# cycle-remains-four-state

Every user cycle advances exactly one state in relative → local → utc → unix → relative, preserving labels and timestamp rendering.

Evidence at plan baseline: `TimeFormat.tsx:9–25, 28–82`. Relevant acceptance: AC1, AC7. Current behavior is described in sut-analysis; this property is the intended post-change contract.

Test sequence: Repeated/alternating updates; compare all four modes, including wraparound and updater semantics.

Assertion choice: Always. Each observed completed transition must match an independent four-state model.

Instrumentation status: missing; no existing Antithesis instrumentation was found. A future workload can observe rendered mode and storage operations. For storage fault and hydration branches, optional test-only read/write/subscribe checkpoints can clarify ordering; no production SDK change is proposed.

Open Questions: None under scope.

### Investigation log

Examined hook, all five consumers, root SSR shell, theme persistence, and Vitest configuration. Found no consumer-specific initial mode or external setter use; fixed relative components are explicit and stay fixed. Scope resolved to existing hook consumers and same-tab coherence, with persistence conditional on functioning storage.
