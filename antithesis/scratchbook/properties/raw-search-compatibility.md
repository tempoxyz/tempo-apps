# raw-search-compatibility
Raw search normalization and history are unaffected.
tempo-address normalization also used for route address parsing; do not broaden that helper to URLs.
Source: src/comps/ExploreInput.tsx, routes/search.tsx, lib/explorer-indexing.ts. Verify with literal parser assertions and browser destinations. No existing SDK assertion. Open Questions: none.
