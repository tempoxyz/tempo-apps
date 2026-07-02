/**
 * Maximum number of rows to count in expensive count queries.
 * This prevents performance issues when counting very large datasets.
 */
export const TOKEN_COUNT_MAX = 10_000

/** How many upcoming pages to warm when the user hovers a "next" control. */
export const PREFETCH_PAGE_COUNT = 3
