export function liveFeedSecondsLeft(
	session: { scope: string; deadline: number } | null,
	scope: string,
	eligible: boolean,
	now: number,
): number {
	if (!eligible || !session || session.scope !== scope) return 0
	return Math.max(0, Math.ceil((session.deadline - now) / 1_000))
}
