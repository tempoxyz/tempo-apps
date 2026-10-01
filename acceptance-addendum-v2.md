# Planner addendum v2 — supported block URL identities

The parent planner inspected `apps/explorer/src/routes/_layout/block/$id.tsx` at the accepted base. Its loader explicitly supports `latest` and hexadecimal block hashes in addition to numeric heights. The user requested pasting explorer URLs, so valid existing block permalink forms belong in the feature.

Extend AC1 with `/block/latest` and `/block/0x<64 hexadecimal digits>`. Keep safe nonnegative integer heights and every existing host/protocol/path/credential boundary. Do not loosen hash validation or accept arbitrary hexadecimal lengths. Keep all existing acceptance items unchanged.

Add parser positives for latest and full hashes across a canonical/alias host, rejection tests for malformed/short/long hashes and latest-like suffixes, and at least one browser activation assertion for a block hash or latest URL. This additive planning revision must be included in independent verification and audit. The implementer did not rewrite the original frozen acceptance.
