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
No Antithesis deployment/campaign required for bounded local UI state. Minimal useful test topology: one local Vite app and one Chrome browser using real localStorage; deterministic API response only when testing suggestions. A future campaign would package app and browser driver, but adds low value for these bounded transitions.
