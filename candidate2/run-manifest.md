# Candidate 2 repair/composition
Previous failed URL candidate: b822e30cc6b8e6083cf72521b4cf04d313662c30.
Original main base:9609e28fb458c32510053458e4609a090fa9c729.
New stack base: factory/explorer-remove-recent at feb1fe8d. Parent requested this dependency; PR will target that branch, not main. Original feature acceptance and parent addendumv2 unchanged.
Independent blocker: Hex.size rounds odd digits, accepting63digit hashes. Parser now validates exact0x+64hex characters for tx/receipt/block. Regression tests cover all3resource types and paired valid values. No criteria changes.
Rebase conflicts resolved by retaining both showingRecent and explorerUrl state, and preserving recent table before URL link before normal suggestions. Other recent-search behavior inherited unchanged. Verification must include composed URL/recent-removal browser behavior and final exact commit.

Committed candidate2: `a6a8f55b6ff83110f715c9bab56fd2a487872799`. Working tree clean after checks; no push/PR. `check-results.tsv` records10 exit0 commands.205worker+360Node tests passed,1existing skip. URL focused59 cases pass. Source diff relative to dependency4files272additions5deletions.

Actual Chrome evidence: browser-final.log confirms Enter/click/submit, network alias/latest, invalid host/raw block, and delayed prior API response. Its seventh fresh-page hydration wait timed out before feature interaction. Browser-remainder.log reruns remaining history-preservation, raw-address, mobile, SSR307 and composed removal/URL/recent activation, all passed. composition.log independently passed same combined behavior. browser-errors.json is empty. Failed hydration log preserved, no production fix or criterion weakening. Browser scripts .txt are reproducibility artifacts, not shipped code.
