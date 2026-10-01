# fresh-activation
Replacing raw input with URL prevents pending prior suggestions from activating local-chain resource.
ExploreInput useQuery uses keepPreviousData and keydown selects first suggestion. Suppress stale suggestions for URL path.
Source: src/comps/ExploreInput.tsx, routes/search.tsx, lib/explorer-indexing.ts. Verify with literal parser assertions and browser destinations. No existing SDK assertion. Open Questions: none.
