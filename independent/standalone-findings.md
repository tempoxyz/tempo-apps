# Independent URL review, candidate b822e30cc6b8e6083cf72521b4cf04d313662c30

Blocked by a reproduced acceptance defect. Base 9609e28fb458c32510053458e4609a090fa9c729. Original frozen contract, verification-plan and v2 addendum SHA256 values match their recorded files. Factory policy HEAD is 02bd8907509c2bb9d61683373a3b4c532b6e70e6.

## Blocking finding

`apps/explorer/src/lib/explorer-search-url.ts:59,66`: `Hex.size(id) === 32` also accepts 63 hexadecimal digits because Ox computes a rounded byte count. `parseExplorerSearchUrl('https://explore.tempo.xyz/tx/0x' + 'ab'.repeat(31) + 'a')` returns an accepted Mainnet destination. AC1 requires exactly 32-byte hashes; the planner addendum explicitly requires 64 hexadecimal digits for block hashes. Enforce the exact length and include 63-digit transaction, receipt, and block URLs in regression tests.

Reproduction uses actual candidate parser in a detached `/tmp/factory-url-independent` worktree after `pnpm install --frozen-lockfile`. Command: `pnpm exec vitest run --config vitest.node.config.ts test/explorer-search-url.node.test.ts test/independent-url.node.test.ts` from `apps/explorer`. Exit 1. Candidate's 56 cases passed; independently derived 111 cases have 110 pass / 1 fail. `parser.test.ts.txt` preserves the additional test input; `parser-standalone.log` preserves the failure.

## Review completed so far

Read full four-file diff, ExploreInput state/effects/activation/history paths, all Header/home callers, shared address normalizer, `/search` route, block route, exact host indexing definitions, tests/configuration and targeted research. The literal allowlist and generated canonical href keep accepted destinations on official origins; query/fragment and decoded ID validation cannot introduce arbitrary outgoing URLs. Distinct network aliases and all supported resource classes passed independent parser checks. Explicit default HTTPS port 443 normalizes away; custom ports are rejected, consistent with research's prohibition of custom ports.

No source or criteria changes were made. Additional tests exist only in the detached verifier worktree. Browser/full-check verification deferred on parent's request pending composition with the recent-search feature; this is a failed candidate, not a completed verification gate. No PR/comment/push/merge/deploy occurred.

Follow-up expanded the same odd-length negative to receipt and block. All three fail: 169 total cases, 166 pass / 3 fail. See `parser-all-hashes.test.ts.txt` and `parser-all-hashes-standalone.log`. No changes to production code or acceptance. Independent browser driver prepared as `browser.cjs.txt` but NOT RUN; it is a pending verification artifact, not evidence. Parent requested ending this attempt to let the original implementer repair and compose a new candidate.
