# latest-attempt-wins
An older asynchronous completion cannot replace the latest attempt state.
Evidence: current useCopy awaits navigator.clipboard.writeText and only catches to console.error. Relevant consumer paths: CopyButton, ContractReader/Writer useCopyPermalink, BlockCard direct hook. No existing assertion. Proposed deterministic fake writes, deferred promises and fake timers at hook/controller boundary; browser asserts role=alert and original control. Open questions: none.
