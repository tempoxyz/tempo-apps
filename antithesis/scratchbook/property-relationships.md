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

# Property relationships

- State cluster: `cycle-remains-four-state`, `same-tab-consumers-agree`, `subscription-lifecycle-safe`. A correct transition table alone does not prove shared updates or cleanup.
- Persistence cluster: `durable-choice-survives-reload`, `invalid-storage-falls-back`, `storage-faults-preserve-usability`. Reload durability assumes storage works; fault fallback must not reread stale data over a newer in-memory choice.
- Hydration cluster: `hydration-is-request-isolated`, `saved-choice-eventually-visible`. Safe fallback without eventual restoration is incomplete; restoration without matching initial markup is also incomplete.
- Cross-cluster risk: initialization write ordering connects durability, lifecycle, and hydration. No property wholly dominates another.

## Assumptions

All slugs refer to property-catalog.md; no cross-tab requirement inferred.

## Open Questions

None.
