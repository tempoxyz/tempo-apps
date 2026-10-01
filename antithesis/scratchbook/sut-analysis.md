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
# System
ExploreInput owns React recentSearches state, loaded once on mount from localStorage key tempo-explorer-recent-searches. SearchResult is a discriminated union imported from API types. Validation filters corrupt records, history capped at six; canonical identity includes type and lower-case address/hash. Remember mutation uses functional state update and synchronous best-effort persistence. No server storage or distributed consistency. Query text controls recent vs API suggestions; keyboard selectedIndex addresses flattened list, reset on identity changes. Mouse activation currently happens on mousedown; removal must never bubble through that button. Focusout closes menu when focus leaves root. Mount animation delays DOM removal.

Risks: nested buttons/listbox interactive descendants; focus lost when focused remove button unmounts; stale selected index after removal; filtering wrong case/type; write failure causing blank/crashing UI; empty list animation; accidental activation/form submission; mobile tiny target. Concurrency is React queued updates and browser event order, not service consensus. Existing multi-tab/multi-instance history coherence is outside this feature.

Scope answer supplied by orchestrator: existing user factory references and explorer feature only; no re-ask needed. No claim of an Antithesis campaign. This targeted research uses single-agent discovery with fresh parent review planned due parallel slot limit.
