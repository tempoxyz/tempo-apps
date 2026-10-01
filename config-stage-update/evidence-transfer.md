# Timestamp binding revision and evidence transfer

User-requested policy/configuration revision from `e742c42d5ac002330bed538098b32b9edd960a01`, adopting factory `ad2edcde57d7b524886318d450a60d1a5e34daae`. This is not a code-defect repair. Preserve the existing candidate-attempt count3, Cyclops submission history/count, accepted contract revisionv1, numerical budgets and prior evidence. The append-only task log records the revision; prior rows are not rewritten.

`factory.yaml` is exactly the pinned factory's `config/tempo-apps.yaml` plus its `library_revision` field. YAML validation checks eight matching ordered stages, all13 skill references in that exact factory commit, unchanged numeric limits/Cyclops budget/delivery permissions, and exact binding equality. This revision renames the workflow list and limit terminology to stages and adopts the diagnosed exact-head REST fallback; merge/deploy remain disabled.

Only `factory.yaml` differs from the prior timestamp candidate. `git diff --exit-code 7471c7ad -- apps packages pnpm-lock.yaml package.json` passes. Both verified `7471c7ad` and the previous head have the same `apps` tree object `54c025e5e416235e9f32cad2ee4ebea3c042796b`. No app, test, package or lockfile changes are permitted by this update.

The accepted task and verification plan SHA256 values still equal `plan-freeze.sha256`:

- acceptance: `309d5de20777bca867f04ec4fd5d377b7e48c73f4b6ce9a2880d9a0a0ed6be3f`
- verification plan: `7a0d2f9aa2d7b2cd63de0b67a43747859a51122c6f396d34e1335c06a08fd32b`

Consequently the existing independently verified application behavior at7471c7ad (including BFCache, storage-failure, browser navigation and formatting evidence in `audit.md` and `verify/`) applies unchanged. This is an explicit source-equality transfer, not a claim that the browser suite was rerun for a configuration-only revision. Full required preparation/check commands are rerun for this binding in the separate `config-stage-update/` logs; prior logs remain intact.

A new remote PR head still requires matching CI and completed Cyclops evidence. No prior service result is promoted to a passing audit. This updater does not submit Cyclops, close/reopen the PR, merge, or deploy; the parent owns external review reconciliation.

## Completed update

Final candidate and remote PR1300 head: `4655e8b3ddb12611d3f2e85945525873a3aa712b`. Push succeeded; PR remains OPEN. Only factory.yaml differs from e742c42d and7471c7ad. All ten commands in check-results.tsv exited0: gen:types, check, check:types, explorer tests, check:env, check:types:test, Biome, lint:tempo, build, precommit. Results:205 Worker tests and318 Node tests passed, with1 existing skip. YAML validation and diff whitespace checks passed; tracked working tree is clean.
