# storage-faults-preserve-usability

Denied storage access/read/write does not throw through render or event handlers and does not prevent subsequent in-memory cycles/navigation.

Evidence at plan baseline: `lib/theme.ts:31–59 catches storage failures; timestamp has no persistence baseline.`. Relevant acceptance: AC5. Current behavior is described in sut-analysis; this property is the intended post-change contract.

Test sequence: Throw property getter, getItem, setItem; make existing stored value stale; remount after failed write.

Assertion choice: Always. After every injected failure and completed interaction, mode equals the reference in-memory choice.

Instrumentation status: missing; no existing Antithesis instrumentation was found. A future workload can observe rendered mode and storage operations. For storage fault and hydration branches, optional test-only read/write/subscribe checkpoints can clarify ordering; no production SDK change is proposed.

Open Questions: None under scope.

### Investigation log

Examined hook, all five consumers, root SSR shell, theme persistence, and Vitest configuration. Found no consumer-specific initial mode or external setter use; fixed relative components are explicit and stay fixed. Scope resolved to existing hook consumers and same-tab coherence, with persistence conditional on functioning storage.
