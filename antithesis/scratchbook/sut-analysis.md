---
sut_path: /Users/daniel/tempo/tempo-apps-factory-clipboard/apps/explorer
commit: 9609e28fb458c32510053458e4609a090fa9c729
updated: 2026-10-01
external_references:
  - path: /Users/daniel/tempo/factory/config/tempo-apps.yaml
    why: User-provided factory workflow and existing task scope; no additional scope question required.
---
# System model
All clipboard writes route through src/lib/hooks.ts useCopy (~30 consumers). Shared CopyButton and direct callers render notifying as success; useCopyPermalink wraps it. State currently is a boolean and timer; exceptions only console.error. Clipboard API boundary is browser permission/secure-context dependent, asynchronous and can settle out of order. Root document spans route changes; a single alert there covers direct and wrapped callers. No RPC/storage/blockchain mutations needed. Sensitive copied contents must not enter alert/event/log text. Risks: stale success after failure, orphan timers, late response after navigation, alert focus theft, unavailable API, silent errors in indirect consumers.
Assumptions: retry means activating the existing copy control; no automatic clipboard retry (requires user activation). Open questions: none blocking; browser permission prompts vary by browser, so deterministic failure injection supplements actual browser control interactions.
