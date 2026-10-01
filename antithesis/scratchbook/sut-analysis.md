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

# Targeted SUT analysis

The explorer is a React/TanStack Start application with Cloudflare server rendering. The feature boundary is client timestamp presentation; no chain state or RPC transaction is changed.

## Architecture and state

`apps/explorer/src/comps/TimeFormat.tsx:6–25` owns an independent React state value for each hook call. No persistence or subscription exists. The transition order is encoded at lines 11–14. `FormattedTimestamp` (lines 28–82) renders relative/local/UTC/unix and always derives its date from seconds. `RelativeTime.tsx` updates visible relative text every second via an effect. Timestamp content and clock behavior should not be redesigned.

Five default-only consumers were found: blocks.tsx:83, tokens.tsx:59, address/$address.tsx:1065, policy/$id.tsx:300, and TxTransactionCard.tsx:14. None passes initialFormat or calls the exposed setter elsewhere. Multiple controls in a page use the same hook result. A shared browser preference should cover all five. FeeAmmPools.tsx:142 explicitly supplies relative, and TimestampCell defaults to relative when callers omit format: neither is a request for a new global formatter behavior.

RootDocument in routes/__root.tsx renders providers and shell on the server. A browser-only preference cannot be read on the server; server fallback must remain deterministic. Existing lib/block-number.tsx:60–78 demonstrates useSyncExternalStore with a server snapshot; it is a pattern, not proof that module state is safe for user preferences. Never mutate global preference state while rendering server requests.

## Persistence and failure boundaries

lib/theme.ts:31–59 already guards get/set localStorage and tolerates denial. Footer.tsx implements cross-tab storage events for theme only. ExploreInput similarly uses localStorage for recent searches. None establishes a requirement for live synchronization of timestamp changes between tabs. Scope is same-origin persistence, same-tab consistency; cross-tab handling is optional and must not expand the UI/API unnecessarily.

New reads can fail at the window.localStorage property getter, not just getItem. Failed writes should leave the selected in-memory value usable, including after route remount; rereading stale storage on every mount can violate this. Initial effects that write defaults before reading stored state can erase the preference. Storage is untrusted text, so membership validation is required.

## Concurrency and lifecycle

Single browser JS event loop, React scheduling, multiple subscriptions, Strict Mode replay, hydration, navigation, and effect cleanup are the relevant interleavings. Functional updates should consume the latest shared mode; duplicate mount or notification must not advance it. A module-level store requires explicit server isolation and tests that reset modules/profile state. Browser reload creates a new memory state and must restore durable preference. Other origins and private profiles do not share localStorage.

## Tests and risks

Node tests use vitest.node.config.ts with `test/**/*.node.test.ts`. Default worker suite excludes those files. theme.node.test.ts uses global stubs; no existing timestamp hook or Antithesis instrumentation tests were found. Need both deterministic transition/storage tests and browser evidence proving wiring/hydration. Rendering helper tests alone miss inconsistent mounted consumers. Existing relative-time clock drift and local timezone SSR differences are separate baseline risks; preserve rendering code and distinguish introduced warnings.

No incident reports were used as fact. Baseline reset follows directly from useState(initialFormat) and absence of persistence, not an external defect allegation. There is no distributed coordination, backend migration, authentication change, or new resource-heavy service in this feature. Listener cleanup is the resource boundary. User-perceived correctness is choosing a format once and finding it still selected on another page/reload.

## Assumptions

One preference per origin is the intended meaning of remembering timestamp format. Brief fallback display during hydration is acceptable. Storage unavailable means no promised durability across a new document. No live cross-tab guarantee. Targeted research uses eight distinct properties rather than inflating to the full-system suggested 15.

## Open Questions

None blocking implementation. Choice of provider vs external store is left to implementation; acceptance applies to either. Browser/RPC access and Cyclops authorization are execution infrastructure to preflight independently.
