# Timestamp preference factory run

Candidate: `7471c7ad91f5a45440b26580b90cc646caa54ee1`  
Base: `9609e28fb458c32510053458e4609a090fa9c729`  
Factory: `85b4291ae006fec0493ddd917a3191981a17eaf2`

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

Feature branch is pushed. PR publication and remote checks are being reconciled. Cyclops has not run: its service requires Tailscale and the local daemon reports `NeedsLogin`. Zero Cyclops submissions have been consumed. The run cannot be marked ready until the required external review and checks pass. No merge or live deployment is authorized.

`events.tsv` records append-only task transitions. This evidence branch is separate from the feature diff.
