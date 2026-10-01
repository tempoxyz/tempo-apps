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
# Properties
## trusted-destination
Priority P0; Always: Accepted URL targets only exact allowlisted HTTPS official origin and validated resource; never credentials or custom port.
Why: Parser boundary before navigation. Host suffix/userinfo/protocol confusion is primary risk.
Instrumentation: parser result boundary / browser navigation events. Not currently Antithesis-instrumented.
Open Questions: none.
## network-preservation
Priority P0; Always: Mainnet/testnet resource identity never changes network through normalization.
Why: explorer-indexing aliases and explorer-network options are canonical evidence; permissive inferTempoEnvFromHostname is not suitable trust policy.
Instrumentation: parser result boundary / browser navigation events. Not currently Antithesis-instrumented.
Open Questions: none.
## fresh-activation
Priority P0; Always: Replacing raw input with URL prevents pending prior suggestions from activating local-chain resource.
Why: ExploreInput useQuery uses keepPreviousData and keydown selects first suggestion. Suppress stale suggestions for URL path.
Instrumentation: parser result boundary / browser navigation events. Not currently Antithesis-instrumented.
Open Questions: none.
## resource-reachability
Priority P1; Reachable: Each supported URL resource can be activated using keyboard/button/result and /search?q=.
Why: ExploreInput existing ManualActivation loses source network; explicit URL branch needed.
Instrumentation: parser result boundary / browser navigation events. Not currently Antithesis-instrumented.
Open Questions: none.
## raw-search-compatibility
Priority P1; Always: Raw search normalization and history are unaffected.
Why: tempo-address normalization also used for route address parsing; do not broaden that helper to URLs.
Instrumentation: parser result boundary / browser navigation events. Not currently Antithesis-instrumented.
Open Questions: none.
