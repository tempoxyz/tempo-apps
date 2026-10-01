This PR remembers the explorer's timestamp format across navigation and reloads, so users can keep UTC, local time, or Unix timestamps selected. It also adds the explorer's ordered factory configuration, pinned to the shared skills library.

## Mental model

All existing timestamp controls subscribe to one browser store:

```tsx
const timeFormat = React.useSyncExternalStore(
	subscribeTimeFormat,
	getTimeFormat,
	getServerTimeFormat,
)
```

The server and initial hydration render relative time. The client restores a validated preference from `tempo-explorer-time-format`; unavailable storage leaves the selection usable in memory. Restored browser-history documents reconcile their saved preference.

The relative → local → UTC → Unix cycle, formatting, controls, and explicitly fixed-format timestamps remain unchanged. Live synchronization between tabs is outside this change. There are no backend, dependency, or chain changes.

`factory.yaml` uses `stages:` to select reusable skills and checks in list order, pinned to factory `ad2edcd`. It is an agent procedure, not an executor. Merge and deployment are disabled for this pilot.

## Testing

- Explorer suites: 205 worker tests and 318 Node tests passed, including 31 new preference tests; one existing test skipped.
- Root type checks, Biome, Tempo lints, test types, explorer build, and precommit hooks passed. All required current-head GitHub checks passed.
- Independent real React hydration/Strict Mode checks and Chrome Back/Forward cache tests passed. Actual explorer navigation and reloads retained the selected format, including rendered UTC and Unix timestamps.

Independent verification caught a stale preference when Chrome restored a document from its back-forward cache. The repair includes regression coverage. [Evidence and run status](https://github.com/tempoxyz/tempo-apps/blob/factory/evidence-time-format/proof.md).

The bundle bot used an April baseline. Fresh builds against this PR's actual base add 765 bytes of client JS/CSS, or 345 gzip bytes. Preview deployment was skipped by the existing membership guard.

Cyclops completed 12/12 investigations and posted no actionable findings, but its archived report marks review completeness **Blocked**: some conclusions lack recorded exact source reads, and the external pinned factory workflow was outside the review context. [Final status and evidence](https://github.com/tempoxyz/tempo-apps/blob/factory/evidence-time-format/ready.md). This PR is **not yet cleared for merge**. The shared factory is an agent-operated procedure; it has no custom executor. Nothing has been merged or deployed.

## Screenshots

After selecting UTC and reloading the same Tokens view:

| Before | After |
|--------|-------|
| ![Before: selection resets to relative](https://github.com/tempoxyz/tempo-apps/blob/fabf57c36e7b301b14430cfbcf2af16579e6c786/before.png?raw=true) | ![After: UTC remains selected](https://github.com/tempoxyz/tempo-apps/blob/fabf57c36e7b301b14430cfbcf2af16579e6c786/after.png?raw=true) |

