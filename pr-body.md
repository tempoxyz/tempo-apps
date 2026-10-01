This PR lets people paste Tempo explorer resource URLs into search and open them on the URL's network. A Mainnet URL entered on Testnet offers **Open on Mainnet** instead of interpreting its identifier on Testnet.

This PR depends on [#1301](https://github.com/tempoxyz/tempo-apps/pull/1301) and targets `factory/explorer-remove-recent`. Individual history removal is inherited from that PR; this diff adds URL search. Merge and deployment remain deferred.

The input and `/search?q=` use the same parser. It accepts exact official HTTPS hosts and supported address, token, transaction, receipt, and block paths. Host aliases canonicalize; credentials, custom ports, unrelated hosts, and malformed identifiers are rejected. Query strings and fragments are dropped to open the resource's default view.

```ts
const explorerUrl = parseExplorerSearchUrl(rawQuery)
if (explorerUrl) throw redirect({ href: explorerUrl.href })
```

Recognized URLs bypass current-chain lookup and stale suggestions. Existing raw search behavior and recent-search storage remain unchanged; URL navigation does not add a network-ambiguous entry to history. No dependencies or deployment configuration change.

## Testing

565 tests passed across the explorer worker and Node suites, including 59 URL parser cases. Monorepo lint/types, explorer test types/build, Tempo lint, and precommit passed. Chrome verified keyboard/click/submit, source-network routing, stale-response suppression, history preservation, raw search, mobile layout, SSR redirect, and composition with individual history removal. [Factory evidence](https://github.com/tempoxyz/tempo-apps/tree/factory/evidence-url-search) records the frozen criteria, exact candidate, checks and browser cases.

Independent verification and code review passed for `a6a8f55`, including 172 parser cases and real browser composition with #1301. Current-head CI passed. Cyclops reported no findings, but its final archived report marks review completeness blocked because three conclusions lack current-revision exact-read support. This PR is not yet certified ready to merge; [the gate report](https://github.com/tempoxyz/tempo-apps/blob/factory/evidence-url-search/ready.md) records the remaining evidence gap. No merge or deployment.

## Screenshots

| Before | After |
|--------|-------|
| ![Before](https://raw.githubusercontent.com/tempoxyz/tempo-apps/factory/evidence-url-search/before.png) | ![After](https://raw.githubusercontent.com/tempoxyz/tempo-apps/factory/evidence-url-search/candidate2/after.png) |
