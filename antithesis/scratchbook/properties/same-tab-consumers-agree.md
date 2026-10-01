# same-tab-consumers-agree

After a committed user change, every mounted participating hook consumer and each later mount uses the latest same-tab preference.

Evidence at plan baseline: `Five hook consumers listed in sut-analysis.md; TimeFormat.tsx:7`. Relevant acceptance: AC2. Current behavior is described in sut-analysis; this property is the intended post-change contract.

Test sequence: Two consumers, navigation unmount/remount, a late subscriber, change from either instance.

Assertion choice: Always. Compare each settled consumer with the reference preference after each operation.

Instrumentation status: missing; no existing Antithesis instrumentation was found. A future workload can observe rendered mode and storage operations. For storage fault and hydration branches, optional test-only read/write/subscribe checkpoints can clarify ordering; no production SDK change is proposed.

Open Questions: None under scope.

### Investigation log

Examined hook, all five consumers, root SSR shell, theme persistence, and Vitest configuration. Found no consumer-specific initial mode or external setter use; fixed relative components are explicit and stay fixed. Scope resolved to existing hook consumers and same-tab coherence, with persistence conditional on functioning storage.
