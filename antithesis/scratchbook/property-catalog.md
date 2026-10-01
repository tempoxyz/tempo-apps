---
sut_path: /Users/daniel/tempo/tempo-apps-factory-clipboard/apps/explorer
commit: 9609e28fb458c32510053458e4609a090fa9c729
updated: 2026-10-01
external_references:
  - path: /Users/daniel/tempo/factory/config/tempo-apps.yaml
    why: User-provided factory workflow and existing task scope; no additional scope question required.
---
# Properties

## failure-visible
P0, Always: Every rejected/unavailable clipboard attempt produces an accessible visible error without content leakage.
Rationale: forbidden state must never occur.
Open questions: none.

## retry-recovers
P0, Sometimes: After denial then successful write, stale error clears and normal success state appears.
Rationale: successful recovery must be reachable after transient failure.
Open questions: none.

## latest-attempt-wins
P0, Always: An older asynchronous completion cannot replace the latest attempt state.
Rationale: forbidden state must never occur.
Open questions: none.

## lifecycle-cleanup
P1, Always: Unmount/cancel invalidates pending completions and success expiry timers.
Rationale: forbidden state must never occur.
Open questions: none.

## unchanged-copy-payload
P0, Always: Successful clipboard writes receive exactly the user-selected string, including empty and Unicode values.
Rationale: forbidden state must never occur.
Open questions: none.
