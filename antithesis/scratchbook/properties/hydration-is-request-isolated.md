# hydration-is-request-isolated

Server rendering without browser globals uses deterministic fallback independent of prior client state; first hydration snapshot matches that fallback.

Evidence at plan baseline: `routes/__root.tsx RootDocument; lib/block-number.tsx:60–78 server snapshot pattern.`. Relevant acceptance: AC6. Current behavior is described in sut-analysis; this property is the intended post-change contract.

Test sequence: Server render after simulated client selection, saved nondefault on hydration; avoid global server mutation.

Assertion choice: Always. Compare server and first hydration format, assert no preference-originated hydration recoverable error, render another request.

Instrumentation status: missing; no existing Antithesis instrumentation was found. A future workload can observe rendered mode and storage operations. For storage fault and hydration branches, optional test-only read/write/subscribe checkpoints can clarify ordering; no production SDK change is proposed.

Open Questions: None under scope.

### Investigation log

Examined hook, all five consumers, root SSR shell, theme persistence, and Vitest configuration. Found no consumer-specific initial mode or external setter use; fixed relative components are explicit and stay fixed. Scope resolved to existing hook consumers and same-tab coherence, with persistence conditional on functioning storage.
