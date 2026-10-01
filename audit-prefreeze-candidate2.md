# Candidate 2 pre-freeze audit

The independent verifier reproduced an AC2 BFCache failure on candidate 1, `6816fa2a4f0bd1bd56ddd6b77e22bed5cc607cf4`. That finding supersedes the preliminary code-only conclusion preserved in `audit-candidate1.md`. See `verify/report-candidate1.md` and its real-Chrome reproduction. Candidate 1 must not pass the acceptance gate.

The proposed repair listens for `pageshow.persisted` while controls are subscribed, reconciles on the first subscription after a gap, and remembers the last observed stored value so an unchanged disk value cannot undo a failed write. The audit reviewed its complete diff and added regression tests before the candidate was frozen.

## Confirmed regression in the initial repair

At the initial repair's `apps/explorer/src/lib/time-format.ts:44`, reconciliation compared the recovered storage value with an undefined persisted baseline, then replaced the current in-memory selection. This violated AC5 when reads and writes had both failed before the initial selection.

Reproduction against that working tree, using the actual store module:

1. Disk contains `utc`, but `getItem` throws during initialization.
2. The control falls back to relative. The user cycles to local while `setItem` throws.
3. Unsubscribe, restore working reads, and subscribe again.
4. Expected local; actual UTC. No newer choice was made on disk.

`pnpm node --input-type=module` executed this sequence and exited 1 with `AssertionError: failed-write in-memory choice must survive remount`, actual `utc`, expected `local`. This was a pre-freeze finding, not a separate frozen candidate attempt.

The implementation agent then added `hasUnpersistedSelection`. When reads first recover without a known baseline, the repair records the baseline without replacing the failed-write choice. The exact reproduction is archived as `audit-recovery.mjs`. Running `pnpm node .factory/time-format/audit-recovery.mjs` against that further repair exited 0 and printed `{ expected: 'local', actual: 'local', disk: 'utc' }`.

The finding is provisionally fixed in the working tree. The final SHA, full checks, BFCache/browser regression and independent-verifier evidence still need reconciliation before the final audit verdict.
