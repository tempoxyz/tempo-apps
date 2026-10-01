---
sut_path: /Users/daniel/tempo/tempo-apps-factory-url
commit: 9609e28fb458c32510053458e4609a090fa9c729
updated: 2026-10-01
external_references:
  - path: /Users/daniel/tempo/factory/config/pipeline.yaml
    why: User-specified reusable factory methodology
  - path: https://github.com/cursor/plugins/blob/main/pstack/skills/poteto-mode/SKILL.md
    why: User supplied; selected vendored leaf skills constrain implementation
  - path: https://newsletter.pragmaticengineer.com/p/openai-software-factory
    why: User supplied factory context; source for methodology, not product behavior
---
# System
ExploreInput owns query, selection, browser recents and React Query suggestions. Parents activate typed raw targets. /search beforeLoad independently interprets queries; /api/search queries configured chain. No shared mutable parser state. Existing keepPreviousData creates stale-selection risk when query changes; URL must bypass local results. API/RPC availability should not affect valid URL activation. Network trust and malformed input are main failure areas.
