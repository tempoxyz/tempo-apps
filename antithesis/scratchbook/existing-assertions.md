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

# Existing assertions

Scanned tracked repository text with `rg -n 'antithesis|assert_always|assert_sometimes|assert_reachable|assert_unreachable'`, excluding lockfile, factory YAML, and .factory artifacts. No matches in application/test source. Additional targeted explorer scan also found none. No Antithesis SDK assertion instrumentation was found. Ordinary Vitest tests exist, but no timestamp-format test existed at the plan baseline.

## Assumptions

This text scan recognizes expected SDK names; no compiled binaries or third-party node_modules were inspected.

## Open Questions

None for this scoped feature.
