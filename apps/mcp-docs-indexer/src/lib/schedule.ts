/**
 * Returns the sources whose forced deep sync runs at this cron tick. A forced
 * sync bypasses every ETag cache, a backstop for sources whose `llms.txt` ETag
 * does not roll over when individual pages change.
 *
 * Each source gets its own UTC hour (source index modulo 24), so one cron
 * invocation never fetches every page of every source and stays within the
 * Worker subrequest budget.
 */
export function forcedSourceIds(
	scheduledTimeMs: number,
	sourceIds: readonly string[],
): Set<string> {
	const hour = new Date(scheduledTimeMs).getUTCHours()
	return new Set(sourceIds.filter((_, index) => index % 24 === hour))
}
