# Contract Verification Test Follow-Ups

This document captures the **remaining high-value test gaps** in `apps/contract-verification` after the recent additions.

## Recently covered

These are already in place and generally should **not** be re-done unless behavior changes:

- `POST /v2/verify/:chainId/:address`
  - valid request returns `202`
  - inserts `verification_jobs` row
  - invalid `contractIdentifier`
  - duplicate pending request
  - stale pending request replacement
  - already verified
  - enqueue failure cleanup
  - lowercase non-checksummed address acceptance
  - unsupported numeric chain rejection
- `GET /v2/verify/:verificationId`
  - pending
  - success
  - timeout / stale unfinished job auto-expiry
  - failure
  - not found
  - numeric verified-contract fallback
- `runVerificationJob()`
  - unsupported chain
  - compile non-200 failure
  - container fetch throw
  - invalid / empty compile output behavior
  - compilation errors array
  - contract missing from output
  - bytecode mismatch
  - internal error DB persistence
  - creation transaction metadata success/failure branches
  - `getCode()` empty / `0x` / throws
- Signature reconstruction
  - tuple
  - tuple[]
  - nested tuple[]
  - function / event / error reconstruction
- `VerificationJobRunner` DO
  - missing job
  - success path
  - failure + cleanup behavior

## Remaining test work

## 1. `/v2/verify` request-path edge cases still worth adding

These are optional but useful hardening tests if time permits:

- successful request with optional `creationTransactionHash` also persists expected job input assumptions
- same address across **different chains** creates independent pending jobs
- edge-case payload validation semantics:
  - empty `stdJsonInput.sources`
  - empty `compilerVersion`
  - malformed but parseable `creationTransactionHash`
- stronger assertions around response/error payloads for existing `400/409/429/500` cases

## 2. `GET /v2/verify/:verificationId` remaining blind spots

The major state machine is covered, but these are still missing:

- malformed UUID that is also numeric-looking corner cases, if any matter to consumers
- completed job row where `verifiedContractId` is set but referenced verified contract row is missing
- completed job row with neither `errorCode` nor `verifiedContractId` set
- stale job timeout response consistency:
  - stable message contract
  - DB update idempotency across repeated polls

## 3. `runVerificationJob()` branches still missing

These are the most useful remaining worker tests.

### Missing branches
- `contract_not_found`
  - explicit test for no bytecode at address is present, but add one for realistic RPC empty-code behavior if needed
- invalid **schema-valid JSON** compile output that breaks later persistence assumptions
- creation-bytecode / constructor-argument-specific mismatch behaviors
- signature persistence / ABI-derived persistence edge cases
- source path normalization persistence across odd input paths
- concurrency/idempotency around repeated calls for same `jobId`

### Worth adding specifically
- test fallback contract lookup by suffix match in compiler output path:
  - when `compileOutput.contracts[contractPath][contractName]` is absent
  - but an output path ending in `/${contractPath}` exists
- test successful persistence of `compiled_contracts_signatures` for function/event/error mix after `runVerificationJob`
- test behavior when ABI contains unsupported / malformed items but compile output otherwise succeeds

## 4. Lookup-route verified-contract response coverage

The native/precompile path is in better shape than the verified-contract response path.

### Missing tests
- `GET /v2/contract/:chainId/:address` with verified contract + `fields=...`
- verified contract + `omit=...`
- nested field selection behavior on verified responses
- invalid `fields` / `omit` combinations beyond the currently covered basics
- transformation payload exposure correctness:
  - runtime values
  - creation values
  - runtime transformations
  - creation transformations
- signatures returned from DB-backed verified contracts for more complex ABIs

## 5. Job-runner / DO behavior still lightly covered

Current tests mainly validate cleanup semantics. Remaining useful cases:

- assert logger-side or DB-side observable behavior for success vs failure more precisely
- repeated alarm invocation idempotency when storage was already cleared
- `enqueue()` overwrite semantics if called twice with same DO name before alarm fires

## 6. Vyper-specific modern route coverage

This is still one of the largest gaps.

### Missing tests
- `POST /v2/verify/:chainId/:address` with Vyper standard-json payload
- `runVerificationJob()` Vyper path using `/compile/vyper`
- Vyper immutable reference handling
- Vyper auxdata style/version branch coverage
- Vyper mismatch / failure-path behavior
- end-to-end Vyper happy path in automated tests

## Recommended next agent plan

If another agent picks this up, the best next chunk is:

1. **Verified-contract lookup tests**
   - add focused integration tests for `GET /v2/contract/:chainId/:address`
   - emphasize `fields`, `omit`, signatures, and transformation payloads

2. **Vyper modern-path tests**
   - add targeted unit/integration coverage for `/compile/vyper` and Vyper-specific matching branches

3. **Remaining `runVerificationJob()` success-path persistence tests**
   - suffix-path contract lookup
   - signature persistence
   - ABI/path normalization edge cases

## Suggested files to add next

- `test/integration/route.lookup-verified.test.ts`
- `test/unit/run-verification-job-vyper.test.ts`
- `test/unit/run-verification-job-persistence.test.ts`

## Commands

From `apps/contract-verification`:

```bash
pnpm test -- test/integration/route.lookup.test.ts
pnpm test -- test/unit/run-verification-job*.test.ts
pnpm check
```
