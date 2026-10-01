---
sut_path: /Users/daniel/tempo/tempo-apps-factory
commit: 9609e28fb458c32510053458e4609a090fa9c729
updated: 2026-10-01
external_references:
  - path: /Users/daniel/tempo/factory/skills/antithesis-research/SKILL.md
    why: User requested architecture and risk grounded property research.
  - path: /Users/daniel/tempo/factory/skills/antithesis-documentation/SKILL.md
    why: Ground Antithesis terminology; research is not a campaign.
  - path: https://antithesis.com/docs/reference/sdk/define_test_properties/
    why: Fetched markdown confirms proposed assertions report outcomes rather than terminating execution.
  - path: conversation
    why: User requested timestamp preference persistence and gates through merge-ready, without merging.
---

# Property catalog

Eight targeted properties cover the frozen criteria. P1 means required behavior; P2 means lifecycle regression coverage. These are intended guarantees, not verified outcomes. The assertion types below describe a possible future Antithesis encoding, not installed SDK assertions. Primary execution for this change is local unit/integration/browser testing.

## cycle-remains-four-state

- Priority: P1; acceptance: AC1, AC7.
- Property: Every user cycle advances exactly one state in relative → local → utc → unix → relative, preserving labels and timestamp rendering.
- Type/assertion: Always; Each observed completed transition must match an independent four-state model.
- Antithesis angle: Repeated/alternating updates; compare all four modes, including wraparound and updater semantics. The bounded state space is primarily deterministic-test territory; no campaign required.
- Why it matters: user preference must remain accurate across browser lifecycle and partial storage failure.
- Evidence: [properties/cycle-remains-four-state.md](properties/cycle-remains-four-state.md).
- Open Questions: None under the stated scope.

## same-tab-consumers-agree

- Priority: P1; acceptance: AC2.
- Property: After a committed user change, every mounted participating hook consumer and each later mount uses the latest same-tab preference.
- Type/assertion: Always; Compare each settled consumer with the reference preference after each operation.
- Antithesis angle: Two consumers, navigation unmount/remount, a late subscriber, change from either instance. The bounded state space is primarily deterministic-test territory; no campaign required.
- Why it matters: user preference must remain accurate across browser lifecycle and partial storage failure.
- Evidence: [properties/same-tab-consumers-agree.md](properties/same-tab-consumers-agree.md).
- Open Questions: None under the stated scope.

## durable-choice-survives-reload

- Priority: P1; acceptance: AC3.
- Property: With available storage, the last selected valid mode is restored after page reload or direct navigation in the same origin.
- Type/assertion: Always; At the restoration checkpoint, compare selected mode to the last successfully written user choice.
- Antithesis angle: Seed each mode; reload fresh memory; verify startup never writes default over a valid seed. The bounded state space is primarily deterministic-test territory; no campaign required.
- Why it matters: user preference must remain accurate across browser lifecycle and partial storage failure.
- Evidence: [properties/durable-choice-survives-reload.md](properties/durable-choice-survives-reload.md).
- Open Questions: None under the stated scope.

## invalid-storage-falls-back

- Priority: P1; acceptance: AC4.
- Property: Absent or nonmember stored text cannot create an invalid displayed mode and falls back to relative before another valid choice.
- Type/assertion: Always; Check membership and relative fallback for each bad input; do not infer validity from truthiness.
- Antithesis angle: Missing, empty, uppercase, JSON text, unknown future values; then choose a valid mode. The bounded state space is primarily deterministic-test territory; no campaign required.
- Why it matters: user preference must remain accurate across browser lifecycle and partial storage failure.
- Evidence: [properties/invalid-storage-falls-back.md](properties/invalid-storage-falls-back.md).
- Open Questions: None under the stated scope.

## storage-faults-preserve-usability

- Priority: P1; acceptance: AC5.
- Property: Denied storage access/read/write does not throw through render or event handlers and does not prevent subsequent in-memory cycles/navigation.
- Type/assertion: Always; After every injected failure and completed interaction, mode equals the reference in-memory choice.
- Antithesis angle: Throw property getter, getItem, setItem; make existing stored value stale; remount after failed write. The bounded state space is primarily deterministic-test territory; no campaign required.
- Why it matters: user preference must remain accurate across browser lifecycle and partial storage failure.
- Evidence: [properties/storage-faults-preserve-usability.md](properties/storage-faults-preserve-usability.md).
- Open Questions: None under the stated scope.

## hydration-is-request-isolated

- Priority: P1; acceptance: AC6.
- Property: Server rendering without browser globals uses deterministic fallback independent of prior client state; first hydration snapshot matches that fallback.
- Type/assertion: Always; Compare server and first hydration format, assert no preference-originated hydration recoverable error, render another request.
- Antithesis angle: Server render after simulated client selection, saved nondefault on hydration; avoid global server mutation. The bounded state space is primarily deterministic-test territory; no campaign required.
- Why it matters: user preference must remain accurate across browser lifecycle and partial storage failure.
- Evidence: [properties/hydration-is-request-isolated.md](properties/hydration-is-request-isolated.md).
- Open Questions: None under the stated scope.

## saved-choice-eventually-visible

- Priority: P1; acceptance: AC3, AC6.
- Property: For an available valid saved preference, hydration settles with that preference visible rather than remaining at fallback.
- Type/assertion: Sometimes; This is meaningful progress to a saved nondefault mode, not mere code reachability; deterministic local test awaits settled render.
- Antithesis angle: Seed unix or utc, hydrate, observe stable selected mode and matching visible timestamps. The bounded state space is primarily deterministic-test territory; no campaign required.
- Why it matters: user preference must remain accurate across browser lifecycle and partial storage failure.
- Evidence: [properties/saved-choice-eventually-visible.md](properties/saved-choice-eventually-visible.md).
- Open Questions: None under the stated scope.

## subscription-lifecycle-safe

- Priority: P2; acceptance: AC7.
- Property: Mount/replay/unsubscribe does not change preference, duplicate a cycle, retain an inactive listener, or lose another active consumer update.
- Type/assertion: Always; Compare listener observations and reference mode across mount/cleanup sequences.
- Antithesis angle: Strict Mode mount/cleanup/remount, unsubscribe during notification, rapid updates; no production instrumentation required. The bounded state space is primarily deterministic-test territory; no campaign required.
- Why it matters: user preference must remain accurate across browser lifecycle and partial storage failure.
- Evidence: [properties/subscription-lifecycle-safe.md](properties/subscription-lifecycle-safe.md).
- Open Questions: None under the stated scope.

## Assumptions

Single origin, current tab, existing controls; no mandatory cross-tab event behavior. Storage failure need not preserve state through full reload.

## Open Questions

No product blockers. Real-browser availability must be evidenced during verification.

## Fresh-review refinement

For `durable-choice-survives-reload`, also assert AC3 storage-key isolation using an unrelated sentinel throughout initialization, cycling, invalid-value recovery, and reload. See ../../verification-addendum.md.
