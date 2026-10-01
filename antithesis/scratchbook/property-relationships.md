---
sut_path: /Users/daniel/tempo/tempo-apps-factory-clipboard/apps/explorer
commit: 9609e28fb458c32510053458e4609a090fa9c729
updated: 2026-10-01
external_references:
  - path: /Users/daniel/tempo/factory/config/tempo-apps.yaml
    why: User-provided factory workflow and existing task scope; no additional scope question required.
---
failure-visible and retry-recovers cover feedback; latest-attempt-wins and lifecycle-cleanup constrain concurrency; unchanged-copy-payload protects the clipboard boundary.
