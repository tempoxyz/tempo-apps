# failure-tolerance
Malformed reads or throwing storage do not crash; write failure leaves in-memory action effective.
Evidence baseline: ExploreInput.tsx loadRecentSearches/persistRecentSearches/getSearchResultKey, rememberSearch, focusout, onKeyDown and SuggestionItem mousedown. New requirement, not a claim baseline already guarantees removal. Assertion Always is a proposed test classification; no production SDK instrumentation exists. Browser action traces are replay anchors. Open Questions: none.
