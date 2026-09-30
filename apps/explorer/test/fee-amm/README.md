# Fee AMM browser checks

This opt-in harness runs the explorer's real server functions, indexer query
builder, RPC decoding, and React UI against a local fixture service. It does not
need production credentials or modify production endpoints. OUSD is deliberately
the eleventh pool, outside the first global page.

From `apps/explorer`, start these in separate terminals:

```sh
pnpm exec tsx test/fee-amm/fixtures.ts
CLOUDFLARE_ENV=mainnet VITE_TEMPO_ENV=mainnet VITE_ENABLE_DEVTOOLS=false pnpm exec vite build --config test/fee-amm/vite.config.ts
CLOUDFLARE_ENV=mainnet VITE_TEMPO_ENV=mainnet VITE_ENABLE_DEVTOOLS=false pnpm exec vite preview --config test/fee-amm/vite.config.ts --port 3011
```

With `agent-browser` and its Chrome browser installed, run the automated browser
checks in another terminal: `pnpm exec tsx test/fee-amm/browser.ts`.
The preview uses the compiled production application, avoiding development module
request limits in headless Chrome. For interactive development, use `vite` instead
of `vite build`/`vite preview` with the same config.

The automated checks cover the following flows; additionally inspect the visual
appearance and clipboard actions manually:

1. Open `http://localhost:3011/fee-amm`. Page 1 contains 10 pools, without OUSD.
2. Follow Next. Page 2 contains OUSD. Previous returns to page 1. Reload page 2
   and verify the URL preserves pagination. Changing page size resets to page 1.
3. Open `/fee-amm?token=0x20c0000000000000000000006a37DA5C996874BE` directly.
   OUSD liquidity is immediately visible: 0.000024 OUSD and 49.999977 pathUSD.
   The token filter must use the indexer query, not scan global API pages.
   The heading remains Fee AMM; the active filter is labeled beneath it.
   Clear filter returns to all pools on the same route. Filtering pathUSD also
   verifies that pagination and page-size changes preserve the token parameter.
4. Follow the token address into the Token tab. Its Fee AMM section should link
   back to the token-specific liquidity URL. The legacy `/token/<address>?tab=token`
   route should also preserve the selected tab.
5. Test an invalid filter, a valid address without pools, and an invalid page URL.
6. At `/control?failed=true` on port 4018, enable an upstream outage. Reload the
   explorer: it must show a retry action, not an empty market. Reset using
   `/control`, then choose Try again without reloading the explorer.
7. At `/control?missingReserves=true`, fail the RPC reserve read. Reload the token
   URL and confirm reserves and estimates say Unavailable, not zero.
8. Check the token view at 390px and 1280px in light and dark mode. Copy link and
   pool-ID actions should work, and the page must not overflow horizontally.

`http://localhost:4018/requests` records requests for checking page/limit and
token-query forwarding. These fixtures establish application behavior, not
production API availability or current onchain amounts.
