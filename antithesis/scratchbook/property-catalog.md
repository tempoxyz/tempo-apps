---
sut_path: /Users/daniel/tempo/tempo-apps-factory-recent/apps/explorer
commit: 9609e28fb458c32510053458e4609a090fa9c729
updated: 2026-10-01
external_references:
  - path: /Users/daniel/tempo/factory/config/tempo-apps.yaml
    why: User-provided reusable verification methodology and delivery limits.
  - path: https://antithesis.com/docs/llms.txt
    why: Current authoritative documentation index; old assertions path is unavailable.
---
# Properties

## targeted-removal
P0; Always: Deleting an identity preserves every different identity in order and removes the target regardless of address/hash casing.
Rationale: invariant checked after each operation.
Observation: real browser DOM, URL, focus, storage and domain tests. No SUT SDK instrumentation required.
Open Questions: none.

## no-activation
P0; Always: Removal does not change URL/query or call navigation; keyboard and pointer both reachable.
Rationale: invariant checked after each operation.
Observation: real browser DOM, URL, focus, storage and domain tests. No SUT SDK instrumentation required.
Open Questions: none.

## durable-history
P1; Always: Successful write survives remount/reload; other storage keys preserved.
Rationale: invariant checked after each operation.
Observation: real browser DOM, URL, focus, storage and domain tests. No SUT SDK instrumentation required.
Open Questions: none.

## focus-and-selection
P1; Always: After removal input owns focus and selection is reset; last removal closes popup.
Rationale: invariant checked after each operation.
Observation: real browser DOM, URL, focus, storage and domain tests. No SUT SDK instrumentation required.
Open Questions: none.

## failure-tolerance
P1; Always: Malformed reads or throwing storage do not crash; write failure leaves in-memory action effective.
Rationale: invariant checked after each operation.
Observation: real browser DOM, URL, focus, storage and domain tests. No SUT SDK instrumentation required.
Open Questions: none.

## usable-controls
P1; Reachable: Keyboard and touch can remove each kind; suggestions retain activation without remove controls.
Rationale: exercise meaningful interaction path, not universal invariant.
Observation: real browser DOM, URL, focus, storage and domain tests. No SUT SDK instrumentation required.
Open Questions: none.
