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

# Minimal test topology

No Antithesis deployment or campaign is required for this feature. Use the existing local explorer server plus an isolated browser profile, with focused Node tests for fault injection. Backend data availability is a browser fixture concern; no chain nodes or database need to be changed.

If a future campaign is justified, the smallest proposed topology is one explorer service container and one browser/workload container. Both would require new images; none is claimed present or compatible. One replica each. Browser connects to explorer HTTP, keeps localStorage within its profile, and drives route/mode/reload sequences. Deterministic RPC/indexer fixtures must replace external live dependencies before a campaign is viable. A pure hook fixture simplifies state testing but cannot replace actual explorer integration evidence. No consensus replicas, database, or queue are justified.

## Assumptions

Campaign suitability is low: four modes, a handful of lifecycle events, and explicitly injectable storage failures can be tested locally. Faults are browser storage exceptions and ordering, not chain consensus faults.

## Open Questions

Future campaign only: browser/runtime packaging compatibility, service fixture boundaries, and readiness instrumentation are unimplemented. This document is a suitability assessment, not a runnable deployment plan.
