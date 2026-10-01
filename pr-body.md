This PR adds a remove button to each recent explorer search so users can discard one entry without clearing their history.

## Mental model

Removal uses the existing canonical identity, preserves the remaining order, and reuses best-effort localStorage persistence:

```ts
const key = getSearchResultKey(target)
return results.filter((item) => getSearchResultKey(item) !== key)
```

The input regains focus before the removed button unmounts. Recent history uses an accessible grid with separate activate/remove buttons; normal search suggestions retain their listbox. Search routing, Clear, the six-entry limit, validation, and storage format remain unchanged. Storage write failures leave the current UI usable; cross-tab synchronization is unchanged.

## Testing

- 205 explorer worker tests and 301 Node tests passed (14 new); one existing test skipped.
- Root format/type checks, test types, Tempo lint, explorer build, and precommit passed.
- Real desktop/mobile Chrome: individual removal, reload persistence, keyboard Tab/Space/Enter, focus after last deletion, re-add, Clear, and injected storage-write failure.

## Screenshots

| Before | After |
|--------|-------|
| ![Before](https://github.com/tempoxyz/tempo-apps/blob/factory/evidence-remove-recent/before.png?raw=true) | ![After](https://github.com/tempoxyz/tempo-apps/blob/factory/evidence-remove-recent/after.png?raw=true) |

[Independent verification and run log](https://github.com/tempoxyz/tempo-apps/tree/factory/evidence-remove-recent/independent) pass for this candidate. Current-head required CI and Bundle Size pass for `feb1fe8d`; preview jobs are skipped by the existing organization-membership guard. Cyclops completed and published no actionable findings, but its archived review completeness is **blocked**: 1 ruled-out conclusion lacks current-revision exact-read support. [Diagnosis and evidence](https://github.com/tempoxyz/tempo-apps/blob/factory/evidence-remove-recent/cyclops/review-completeness-diagnosis.md). One of three Cyclops submissions has been used. Local verification and four-feature composition pass, but this PR is **not factory-ready**. Nothing has been merged or deployed.

