# Audit report: tempoxyz/tempo-apps

**Completed (degraded)** · 0 candidates · pr-review

- Target: tempoxyz/tempo-apps#1300
- Commit: `4655e8b3ddb12611d3f2e85945525873a3aa712b`
- Started: 2026-10-01T05:34:51Z
- Finished: 2026-10-01T05:38:16Z

## Outcome

- Workflow: completed
- Scan quality: Complete
- Review policy: standard effort: 12 attempts, 10800s admission window, 3600s per investigation; standard execution
- Useful work: 12/12 completed of 12 planned
- Provider usage: 12 calls observed; 0 schema correction attempts
- Losses: 0 goal; 0 audit/runtime; 0 workers failed; by kind none; by stage none; 0 recovered
- Route evidence: none; 0 affected attempts have no recorded resolved route; 0 causes remain unproven
- Scheduling: 12 scoped; 0 unscoped fallback
- Findings: 0 candidates; 0 reviewed; 0 inconclusive; 0 rejected; 0 deduplicated; 0 out of scope; 0 still provisional
- Relationship scope: Not applicable or not recorded by this runner
- Coverage: Measured (436 tracked files initialized)
- Linear: No candidates

## Review completeness

- Quality: Blocked; the completed workflow is not a clean review result
- Invocation accounting: 12 attempted; 12 completed; 0 blocked after dispatch; 0 blocked before dispatch; 0 failed
- Resume condition: Provide the pinned factory workflow and executor behavior for the library revision named in factory.yaml, including how publication and preview-deployment settings are enforced. (missing: runtime_evidence: The pinned external factory library and its shared workflow are not available in the assigned repository; the configuration alone does not establish which actions an executor performs.)
- Resume condition: Read every cited interval at the prepared repository revision and resubmit the conclusion. (missing: validation_method: Ruled-out conclusion lacks current-revision exact-read support: Explorer timestamp preference persisted in localStorage)
- Resume condition: Provide the pinned library and workflow source, plus the executor that consumes this configuration, within an authorized review scope. (missing: runtime_evidence: The pinned factory library and its workflow implementation are outside the assigned repository; the behavior of stages selected by factory.yaml was not verified.)
- Resume condition: Read every cited interval at the prepared repository revision and resubmit the conclusion. (missing: validation_method: Ruled-out conclusion lacks current-revision exact-read support: Explorer timestamp selection and persistence)
- Resume condition: Provide the pinned library revision and workflow contents, plus the authorized pipeline entrypoint, for review. (missing: runtime_evidence: The pipeline's pinned external factory library and workflow were not supplied; their behavior and deployment effects cannot be verified from factory.yaml alone.)
- Resume condition: Read every cited interval at the prepared repository revision and resubmit the conclusion. (missing: validation_method: Ruled-out conclusion lacks current-revision exact-read support: Explorer timestamp preference in the traced transaction-card flow)
- Resume condition: Read every cited interval at the prepared repository revision and resubmit the conclusion. (missing: validation_method: Ruled-out conclusion lacks current-revision exact-read support: Explorer time-format persistence and factory.yaml config)
- Resume condition: Obtain the pinned runner entrypoint and its configuration-loading path for factory.yaml. (missing: entrypoint: No factory runner or CI invocation establishing that the new factory.yaml is executed was identified in the examined repository paths.)
- Resume condition: Obtain the pinned factory library's fallback implementation and an authorized execution trace showing the submitted request and resulting visibility. (missing: runtime_evidence: The reviewed source does not establish whether the configured REST fallback runs or what disclosure, if any, private:false causes.)
- Resume condition: Provide the pinned factory library and executor implementation or an authorized execution trace showing how this configuration is consumed. (missing: runtime_evidence: The assigned repository does not establish how the external factory executor interprets the pinned library, authorizes publication, or handles preview side effects.)

<details>
<summary>Run diagnostics</summary>

- Run: `pr-1300-20261001t053450-290efea93387`
- Scan ID: `scan_mup3nxlu_3hs8hb`
- Workflow: [cyclops-scan-pr-review-sbwnb](https://dev-eu-argo-workflows.tail388b2e.ts.net/workflows/argo-workflows/cyclops-scan-pr-review-sbwnb)
- Phase: Succeeded
- Attempts: 1

### Workflow attempts

- Attempt 0: [cyclops-scan-pr-review-sbwnb](https://dev-eu-argo-workflows.tail388b2e.ts.net/workflows/argo-workflows/cyclops-scan-pr-review-sbwnb); status succeeded; phase Succeeded; started 2026-10-01T05:34:51Z; finished 2026-10-01T05:38:16Z

</details>

## Findings and candidates

_No confirmed findings._

<details>
<summary>Event summary</summary>

- `artifact.synced` happened 1 time; latest at 2026-10-01T05:39:07.308Z
- `workflow.exit` happened 1 time; latest at 2026-10-01T05:38:08.749Z
- `review.published` happened 1 time; latest at 2026-10-01T05:37:57.390Z
- `review.ready` happened 1 time; latest at 2026-10-01T05:37:55.000Z
- `run.completed` happened 1 time; latest at 2026-10-01T05:37:55.000Z
- `worker.completed` happened 12 times; latest at 2026-10-01T05:37:54.000Z
- `worker.iteration.skipped` happened 2 times; latest at 2026-10-01T05:37:54.000Z
- `prompt.provenance.persisted` happened 12 times; latest at 2026-10-01T05:37:52.000Z
- `trajectory.completed` happened 12 times; latest at 2026-10-01T05:37:52.000Z
- `invocation.bundle.resolved` happened 12 times; latest at 2026-10-01T05:37:30.000Z
- `worker.started` happened 12 times; latest at 2026-10-01T05:37:29.000Z
- `workflow.reconciled` happened 1 time; latest at 2026-10-01T05:36:04.821Z

</details>
