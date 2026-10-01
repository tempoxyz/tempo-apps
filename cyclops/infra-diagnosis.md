# Cyclops audit infrastructure diagnosis

Run `scan_mup35iup_4gkzf1`, workflow `cyclops-scan-pr-review-pzx9w`, failed on 2026-10-01 at 05:23:59 UTC. This is not a passing audit.

## Confirmed evidence

- Worker event delivery failed throughout the run; controller logs show matching HTTP 401 responses from `/internal/ingest/events`, including the terminal failure at 05:23:28.319 UTC. See `controller-ingest-rejections.json`.
- Submitted workflow parameter `sha` is empty. Control-plane deployment explicitly enables `CYCLOPS_REQUIRE_PR_WORKFLOW_IDENTITY=1`.
- Current source (`cyclops-core` commit `8b6706d5142074f00ebfd13fed4db75494d2acb1`) requires the PR workflow `sha` to be a full 40-character commit in `control-plane/lib/workflow-event-identity.ts:161`; invalid identity produces HTTP 401 in `control-plane/server.ts:5743`.
- The RPC `scan.pr` adapter omits `target_commit` (`src/rpc/control-plane-service.ts:101`); createScan only resolves PR head automatically for private reviews (`control-plane/server.ts:4814`). Nonprivate submissions therefore receive an empty SHA unless supplied explicitly through REST.
- The empty SHA is a sufficient source-level cause of identity rejection. The deployed source revision was not independently resolved from its digest, and logs do not name the failed identity predicate, so additional identity failures cannot be ruled out.
- Archive sync succeeded, and the supported GET `/api/scans/scan_mup35iup_4gkzf1/prompt-provenance` returns archived prompt provenance (saved locally). This establishes that worker invocations existed, not that investigations succeeded. The report has unknown commit, zero recorded useful work, and no worker events.
- Argo artifact download through its normal API returned Unauthenticated/Unauthorized. No secret reads, privileged credential retries, pod exec, deployments, or additional submissions were performed in this diagnosis.

## Supported next attempt

Use the existing public REST create endpoint, retaining authentication and workflow identity checks:

`POST https://dev-eu-cyclops-scan-ui.tail388b2e.ts.net/api/scans`

```json
{
  "schema_version": 5,
  "scan_type": "pr-review",
  "repo": "tempoxyz/tempo-apps",
  "pr_number": 1300,
  "target_commit": "<freshly verified full 40-character PR head SHA>",
  "mode": "fast",
  "config": "pr-review-super-fast.yaml",
  "review_policy": {"version": 1, "effort": "standard"},
  "execution_speed": "standard",
  "dry_run": false,
  "private": false
}
```

This is the same scan lifecycle as RPC; route is at server.ts:9517, target_commit is accepted at :4748 and becomes the exact `sha` workflow parameter at :3494. Successful creation returns HTTP 201 with the ScanRecord itself (including `id`, `run_label`, `target_commit`, `workflow_name`, `workflow_uid`, `workflow_url`, `status`, and `pr_workflow_parameters`); submission failure returns HTTP 502 with a failed ScanRecord and `failure_reason` (:4845–4865).

Before considering this fixed, inspect the returned `target_commit` and `pr_workflow_parameters.sha`, then verify `run.started`, `repository.prepared`, worker/trajectory events and the actual head SHA appear in scan metadata. Require successful terminal quality and meaningful work/coverage before recording an audit pass. `fast` chooses the profile; it does not replace review_policy. Legacy max_hours/max_iterations inputs are explicitly rejected, so do not use them.

If exact-head REST still produces 401, stop retries and have the service owner inspect the pod-bound identity validation and workflow parameter binding. If events work but investigations fail, retrieve the resulting durable operational failure telemetry before another attempt. The original model/investigation failure remains unproven because its terminal event was rejected; this diagnosis fixes the demonstrated admission-to-ingestion mismatch only.
