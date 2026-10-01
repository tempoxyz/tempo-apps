This PR shows a dismissible error when explorer clipboard writes fail, so users can retry the original copy control instead of silently losing the action.

## Mental model

Every existing copy control uses `useCopy`; one root alert covers shared buttons, custom controls, and permalink copying. The hook keeps its existing API:

```ts
const { copy, notifying } = useCopy({ timeout: 2_000 })
```

A controller cancels prior timers and ignores late outcomes from superseded attempts or unmounted controls. Global feedback also ignores older failures from another control. Clipboard text and raw exceptions never enter feedback events or messages.

## Compatibility

Copied values, existing success indicators, and configured success durations remain unchanged. Retry requires another user click; no automatic clipboard writes, dependencies, storage, or backend changes.

## Testing

508 tests passed (205 worker + 303 Node; one existing skip), including 16 new denial/retry, payload, race, and cleanup cases. Passed repository types, Biome, Tempo lint, precommit, explorer test types and build. Browser proof covers actual direct/shared/permalink controls, StrictMode, exact retry payload, missing API, keyboard dismissal, mobile layout, timers, and unmount during a pending write.

Independent verification and audit passed for `d650da17`, including repeated synchronous failure announcements and real browser clipboard denial/recovery. [Reproducible evidence](https://github.com/tempoxyz/tempo-apps/tree/factory/evidence-clipboard/independent/candidate2). Current-head required CI and Bundle Size pass for `d650da17`; preview jobs are skipped by the existing organization-membership guard. Cyclops completed and published no actionable findings, but its archived review completeness is **blocked**: 3 ruled-out conclusions lack current-revision exact-read support. [Diagnosis and evidence](https://github.com/tempoxyz/tempo-apps/blob/factory/evidence-clipboard/cyclops/review-completeness-diagnosis.md). One of three Cyclops submissions has been used. Local verification and four-feature composition pass, but this PR is **not factory-ready**. Nothing has been merged or deployed.

## Screenshots

| Before: denied copy is silent | After: dismissible failure feedback |
|---|---|
| ![Before](https://raw.githubusercontent.com/tempoxyz/tempo-apps/factory/evidence-clipboard/independent/before.png) | ![After](https://raw.githubusercontent.com/tempoxyz/tempo-apps/factory/evidence-clipboard/independent/candidate2/after.png) |

