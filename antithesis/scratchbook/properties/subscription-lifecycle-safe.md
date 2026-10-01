# subscription-lifecycle-safe

Mount/replay/unsubscribe does not change preference, duplicate a cycle, retain an inactive listener, or lose another active consumer update.

Evidence at plan baseline: `Existing state hook has no listeners; proposed sharing adds this lifecycle boundary.`. Relevant acceptance: AC7. Current behavior is described in sut-analysis; this property is the intended post-change contract.

Test sequence: Strict Mode mount/cleanup/remount, unsubscribe during notification, rapid updates; no production instrumentation required.

Assertion choice: Always. Compare listener observations and reference mode across mount/cleanup sequences.

Instrumentation status: missing; no existing Antithesis instrumentation was found. A future workload can observe rendered mode and storage operations. For storage fault and hydration branches, optional test-only read/write/subscribe checkpoints can clarify ordering; no production SDK change is proposed.

Open Questions: None under scope.

### Investigation log

Examined hook, all five consumers, root SSR shell, theme persistence, and Vitest configuration. Found no consumer-specific initial mode or external setter use; fixed relative components are explicit and stay fixed. Scope resolved to existing hook consumers and same-tab coherence, with persistence conditional on functioning storage.
