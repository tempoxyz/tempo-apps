# Local Cyclops execution feasibility

## Verdict

The checked-out Cyclops runner can perform a real local PR audit with native Codex/Claude authentication, immutable base/head, and the standard 12-investigation budget. This is **not a supported complete replacement** for the required external review: authenticated GitHub publication requires Kubernetes/Argo workflow identity, and the direct PR source scope does not include the separately pinned factory repository. A local dry-run could test the capture repair with real model computations, but would not resolve either limitation and would consume an audit attempt.

This assessment is source inspection and read-only prerequisite checking, not a successful model-run claim. No model invocation, scan submission, local service start, review publication, merge, or deployment was performed. The only write in this task is this requested evidence report.

## Inspected version and prerequisites

- Cyclops checkout: `/tmp/factory-cyclops-core`, HEAD `8b6706d5142074f00ebfd13fed4db75494d2acb1`. The parent's local capture repair changes `src/runner/tool-coverage.ts` and adds `src/runner/tool-coverage-head.test.ts`; this task did not change them. Line anchors below refer to the inspected checkout, including those current working-tree line numbers where applicable.
- Docker daemon responds, server version `28.3.2`; no containers were running when checked. Native `psql`, `postgres`, `initdb`, and `pg_ctl` were not found on PATH. The repository's `compose.yaml:1` defines PostgreSQL 17.
- Bun is `1.2.19`; documentation calls for `1.3.10`. An initial CLI import failed on missing `typebox`. After the parent installed dependencies, `bun run src/index.ts --help` succeeded. No inference of model-runtime success follows from help loading.
- `codex login status` reports a ChatGPT login. `claude auth status --json` reports `loggedIn: true`, `authMethod: claude.ai`, `apiProvider: firstParty`. GitHub CLI authentication is present with repository/workflow access. No secret values are included or were intentionally retrieved.
- Native route credential rules explicitly allow existing CLI login: `src/runner/model-overrides.ts:74` and `:78`. The default fast PR profile uses Pi backends, so a native run requires explicit supported backend/model overrides; merely having native clients installed does not select them (`config/pr-review-super-fast.yaml:11`). All configured stages, not just audit workers, need viable routes. Model access and Codex sandbox preflight remain untested. The sandbox must not be weakened to make a run succeed; see `docs/native-scan-execution.md`.

## Real local audit path and immutable identity

The supported worker entry point is `bun run src/index.ts runner scan execute /absolute/request.json` (`src/runner/cli.ts:293`). It loads a typed request and constructs the production `ScanCoordinator` and `GitRepositoryPreparer`. Explicit `CYCLOPS_DIR`, isolated `CYCLOPS_FINDINGS_DIR`, and isolated `CYCLOPS_CHECKOUT_ROOT` select the patched runner and disposable runtime storage. A schema-version-5 `kind: pr` request accepts full `base` and `head` repository/SHA pairs (`src/runner/scan-request.ts:51`). The prepared review bundle must match both immutable SHAs or execution fails (`src/runner/coordinator.ts:1160`). This path fetches/prepares source rather than implicitly auditing the user's mutable application worktree.

The standard policy is 12 **investigation attempts**, not 12 distinct worker processes: `src/runner/review-policy.ts:22` sets 12 attempts, a three-hour admission window, and a one-hour investigation timeout. The selected fast profile has two worker definitions. Preserve the existing policy, exact models, accepted budgets, and independently checked source identities; a one-worker smoke profile is not equivalent.

The local control plane supports detached source workers (`control-plane/server.ts:1609`; `src/runner/launcher.ts:137`). However, its PR submission path calls `localLauncher.pr(repo, number, ...)` without forwarding a requested base/head (`control-plane/server.ts:1642`, `:1675`). That launcher resolves live GitHub PR refs again (`src/runner/launcher.ts:62`). Thus submitting a `target_commit` to the local API does not itself guarantee the same immutable worker target. The direct request-file entry point preserves both pins; the environment entry point permits a head override but still resolves base live (`src/runner/cli.ts:255`).

For an authorized diagnostic run, source-native execution would preserve the installed clients' normal login environment. The stock Docker control-plane service does not mount those host login directories (`compose.yaml:17`). A disposable native control plane with Docker PostgreSQL is technically practical, but was not started because it cannot satisfy the full objective below.

## Evidence and completeness

The production coordinator creates immutable invocation bundles, request/config provenance, exact source observations, candidate and closure records, coverage, and terminal events (`src/runner/coordinator.ts:862`, `:898`, `:1195`, `:1298`, `:2314`). A `dry_run` is a real audit computation with publication suppressed, not synthetic fixture evidence.

The control plane can read local artifacts through `candidateRunDirs` (`control-plane/server.ts:6094`), computes coverage at `:6503`, and renders the final report at `:7974`. That report uses graph effectiveness and blocked occurrences to show **Review completeness** and can mark a completed run degraded (`:7991`). This is the same important distinction that prevented accepting the earlier archived reviews. The simple CLI report renderer (`src/rpc/report.ts:25`) only renders summary/findings; its absence of findings is not a completeness verdict.

No actual local audit artifacts exist from this feasibility task. A prospective run would still require terminal artifacts, complete current-revision closure evidence, exact-head confirmation, and the full final completeness report before any acceptance claim.

## Authenticated publication is unsupported locally

The standalone production coordinator requires both a scan ID and a control-plane event endpoint before public PR delivery (`src/runner/coordinator.ts:1681`). Its optional `reviewReadyPublisher` is explicitly a test seam (`:110`), not a supported local publication alternative.

More decisively, event ingestion rejects `review.ready`/`review.published` unless `CYCLOPS_REQUIRE_PR_WORKFLOW_IDENTITY=1` (`control-plane/server.ts:5722`). Enabling that flag requires real workflow identity validation (`:5733`), including the scan's image, workflow name/UID, commit, repository, PR, privacy, and parameters (`:5744`). `control-plane/lib/workflow-event-identity.ts:35` uses the control plane's Kubernetes identity; `:67` requires pod-bound bearer-token authentication, a Kubernetes TokenReview, the authorized service account, pod ownership, and an Argo Workflow with the expected template/image/parameters. The trusted internal event destination is also checked. A local event receiver, ordinary GitHub login, or UI ingest token does not provide this identity.

The stock compose configuration omits this identity setup. Documented local smoke examples deliberately use `--dry-run` (`docs/getting-started.md:200`). Disabling checks, substituting a test publisher, fabricating workflow identity, or manually posting a clean review would not demonstrate the required authenticated Cyclops completion. No such workaround was attempted or recommended.

## External factory source-scope limitation

Direct PR reviews explicitly receive no repository facts (`src/runner/coordinator.ts:1153`) and omit their context (`:898`); this is also documented in `docs/repository-facts-and-invocation-bundles.md`, Supported execution paths. `CYCLOPS_REPOS_DIR` therefore cannot add the pinned factory library to a direct application PR's credited source scope.

Coverage initialization registers the prepared application repository/revision (`src/runner/coordinator.ts:1195`). The native tool coverage adapter rejects reads outside its workspace as `path_outside_workspace` (`src/runner/tool-coverage.ts:548`, `:696` in the repaired working tree). A separately accessible `/Users/daniel/tempo/factory` checkout is not automatically a registered, immutable evidence source. Current direct-PR dependency preparation concerns Cargo manifests/lockfiles (`src/runner/direct-pr-dependency-preparation.ts:43`), not `factory.yaml.library_revision` or arbitrary supplemental repositories.

`audit_note` is retained in the serialized request input (`src/runner/coordinator.ts:1298`), but is absent from the runtime prompt construction. It can neither force exact reads nor register factory source provenance. Multi-repository relationship scans have a different typed contract; they are not the same pinned PR-review/publication path and cannot silently replace its acceptance criteria.

## Recommended disposition

Retain the blocked external-review status. Publish the narrow capture-repair patch, its independent tests, and this diagnosis for review. Do not spend another audit attempt expecting the existing local path to clear authenticated publication or the external factory source deficit. A future real local diagnostic audit must be labeled as such and cannot be reported as full factory completion without a supported, verified solution to both missing capabilities.
