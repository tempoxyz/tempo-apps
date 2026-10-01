# Frozen acceptance: remove individual recent searches
1. Empty-query recent history exposes a named remove button for each record, separate from activation; click, touch, Enter or Space removal never navigates or submits a search.
2. Removal targets the existing canonical key (kind plus case-insensitive address/hash or block number), preserves remaining order/metadata, and persists across reload. Unrelated localStorage keys stay unchanged.
3. Removing last record closes empty history, returns focus to input, and allows typing/searching immediately. Removing any row resets stale keyboard selection and focuses input; remaining rows still activate correctly via arrows/Enter.
4. Existing recent activation, limit 6, deduplication, Clear, query suggestions, and manual input routing remain unchanged. Remove controls appear only in recent history.
5. Keyboard-reachable controls have meaningful per-record names and visible focus. No nested buttons or interactive controls hidden in listbox options. Mobile controls remain visible and usable.
6. Missing, malformed, or inaccessible storage remains safe; write/remove failures preserve usable current UI. Durability when storage rejects writes and live multi-tab synchronization are not promised.
7. Required checks, real desktop/mobile browser evidence, independent verification/audit, Cyclops and current-head CI must pass before merge-ready. Do not merge or deploy.
