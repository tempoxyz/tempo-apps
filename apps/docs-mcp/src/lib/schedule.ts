/**
 * Returns true for the one cron run per day at which we want to bypass all
 * ETag caches. Belt-and-suspenders for sources whose `llms.txt` ETag fails
 * to roll over when individual pages change.
 *
 * Bound to 00:00 UTC so the forced deep sync happens at a predictable,
 * load-neutral time.
 */
export function isForcedHour(scheduledTimeMs: number): boolean {
	return new Date(scheduledTimeMs).getUTCHours() === 0
}
