# no-activation
Removal does not change URL/query or call navigation; keyboard and pointer both reachable.
Evidence baseline: ExploreInput.tsx loadRecentSearches/persistRecentSearches/getSearchResultKey, rememberSearch, focusout, onKeyDown and SuggestionItem mousedown. New requirement, not a claim baseline already guarantees removal. Assertion Always is a proposed test classification; no production SDK instrumentation exists. Browser action traces are replay anchors. Open Questions: none.
