# Timestamp preference factory run

Candidate: `4655e8b3ddb12611d3f2e85945525873a3aa712b`  
Base: `9609e28fb458c32510053458e4609a090fa9c729`  
Factory: `ad2edcde57d7b524886318d450a60d1a5e34daae`

The task retains a selected timestamp format across explorer navigation, reloads, and browser-history restoration. The accepted contract and verification plan are published beside this report; their criteria were not weakened during repair.

## Local evidence

All ten commands in the configured local check set exited 0 on the final tree: type generation, root checks/types, both explorer test suites, test types, Biome, Tempo lints, explorer build, and precommit. The suites passed 205 worker tests and 318 Node tests with one existing skip. There are 31 focused preference tests.

Independent verification imports the exact candidate's real hook, controls, timestamp renderer, and store. Seventeen React scenarios cover SSR/hydration, Strict Mode, multiple consumers, functional updates, lifecycle/remounts, invalid stored values, and storage faults. Native Chrome BFCache tests cover all four modes across actual persisted Back/Forward restorations. Reproduction sources and results are under `verify/`.

The real explorer flow selects UTC on Blocks, reloads, navigates through home to Tokens, reloads, selects Unix, then goes Back through home to Blocks. Final format assertions pass. Actual Tokens `<time>` contents were asserted to have UTC suffixes and then numeric Unix timestamps. Before/after screenshots show selecting UTC and reloading Tokens on unchanged base versus candidate.

The local app uses a dummy credential solely to satisfy startup validation. RPC rate limits and router preload errors occurred during some live-data experiments. Those failed/inconclusive attempts remain recorded locally; successful final preference assertions and deterministic isolated browser checks are separately identified. Authenticated RPC behavior is not claimed tested by this feature.

## Failures found and repaired

Candidate 1 failed when Chrome restored an older document from BFCache. Independent review also reproduced a combined initial-read/write failure that replaced an unsaved in-memory choice when storage recovered. Candidate 2 handles restoration and storage recovery, with regression tests. Both findings and the final evidence assessment are recorded in `audit.md`.

Antithesis was used for architecture/property research. No Antithesis campaign was run or claimed.

## Delivery status

[PR #1300](https://github.com/tempoxyz/tempo-apps/pull/1300) is open at the verified candidate. All three ruleset-required checks passed: dependency scan, GitHub Actions scan, and Verify / Checks. Bundle Size, CodeQL and Socket also passed. The PR reports MERGEABLE/CLEAN, but that does not substitute for the missing Cyclops audit.

Preview deployment and its comment job were skipped by the existing membership guard: the workflow event carried AUTHOR_ASSOCIATION=NONE, although a later API read reports MEMBER. No preview was created or validated, and no live deployment occurred. The workflow was not changed to bypass that guard.

The automated bundle comment used an April 27 baseline, so its large percentage increase is not a comparison with this PR's actual base. Fresh local builds of base 9609e28 and candidate 7471c7a each contain 368 client JS/CSS files. The candidate adds 765 raw bytes / 345 gzip bytes in aggregate under the same build command; see bundle-comparison.json. This is a local same-base comparison, not a claim to have repaired the CI cache. Cyclops submission 1 failed: the RPC adapter omitted workflow commit identity, so event ingestion failed. Evidence and diagnosis remain under `cyclops/`. After reconciling the failed run and comment trigger, submission 2 used verified exact-head REST as `scan_mup3nxlu_3hs8hb` and completed with blocked review completeness. This operational correction preserves the three-submission budget and does not change acceptance. The run cannot be marked ready until the required external review and checks pass. No merge or live deployment is authorized.

`events.tsv` records append-only task transitions. This evidence branch is separate from the feature diff.

## Final configuration and composition

The final configuration-only commits do not change the verified application source. `config-stage-update/evidence-transfer.md` records matching app trees, unchanged contract hashes, all ten current checks, and the pinned `stages:` configuration. The procedure and reusable skills remain under factory `config/` and `skills/`; there is no custom runtime.

Independent composition with recent removal, URL search, and clipboard feedback passed 612 tests, types, production build, and real browser flows. `composed/report.md` records exact source SHA mappings, patch hashes, prior infrastructure failures and the verified final result.

Current final status: **blocked, not merge-ready**. See `ready.md` and the final archived Cyclops report. No third submission was spent without a supported remedy.
