# trusted-destination
Accepted URL targets only exact allowlisted HTTPS official origin and validated resource; never credentials or custom port.
Parser boundary before navigation. Host suffix/userinfo/protocol confusion is primary risk.
Source: src/comps/ExploreInput.tsx, routes/search.tsx, lib/explorer-indexing.ts. Verify with literal parser assertions and browser destinations. No existing SDK assertion. Open Questions: none.
