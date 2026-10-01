# Verification plan

Acceptance source: `acceptance.md` (frozen before implementation). Record exact commands, exit status, candidate SHA, and relevant artifact links in the run log. A changed candidate invalidates affected evidence.

| Coverage | Required experiment | Oracle |
|---|---|---|
| AC1 | Table/exhaustive test all four modes and 0–12 cycles; compare existing timestamp rendering | Exact cycle, UTC label, original dateTime and text semantics |
| AC2, AC7 | At least two hook consumers; change one, observe both; unmount/remount; rapid alternating changes | Current mode agrees, no lost steps or resets |
| AC3 | Seed each valid value; initialize, navigate, reset module/page session with same storage; reload | Exact last selected value restored; initialization did not write default |
| AC4 | Table invalid values including empty, uppercase, JSON object text, random string | Relative fallback, no throw; next change saves valid mode |
| AC5 | Fault-inject throwing storage property getter, getItem, setItem | Controls remain usable; latest in-memory preference survives navigation |
| AC6 | Render without window; hydrate a saved non-default mode; render later server request | Fallback SSR, restored client preference, no newly introduced hydration errors or SSR leakage |
| AC7 | Strict Mode/double subscribe/cleanup and listener change during notification | No reset, lost change, or lingering notification after unsubscribe |
| AC8 | Actual explorer browser: blocks choose UTC/unix → another existing route → hard reload → return/back; screenshot baseline and candidate | Visible format/title matches each choice, actual DOM timestamps use selected mode; record console/errors |

Use Node suite for storage/state and server rendering tests; use real browser/hook integration evidence for React subscription and hydration. Pure helper tests alone do not prove consumer wiring. Existing Node test glob is `test/**/*.node.test.ts`, not `.tsx`; account for this when adding tests.

Required repository commands, in order before final candidate freeze:

- `pnpm check` (mutates via Biome; inspect resulting diff).
- `pnpm check:types`.
- `pnpm --filter explorer test --run` (Cloudflare pool, excludes Node tests).
- `pnpm --filter explorer check:env` (separate Node test suite, not deployment health).
- `pnpm precommit`.
- `pnpm --filter explorer build`.
- `git diff --check`.

Also run focused new tests while iterating. After local verification, independent audit can return reproducible findings to implementation; repeat impacted checks after repairs. PR evidence includes before/after screenshots per AGENTS.md. Parent owns Cyclops and remote CI monitoring. Capture denied/missing auth separately from a failing feature.

Recommended browser evidence uses a disposable profile and local server. If RPC/indexer dependencies prevent a route from loading, record the infrastructure limitation; a fixture harness can supplement but cannot silently substitute for all real-route evidence. Baseline relative-time hydration issues, if observed, must be distinguished from newly introduced preference issues.
