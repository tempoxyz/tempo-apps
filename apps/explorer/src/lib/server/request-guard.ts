export function checkRequestGuard(
	request: Request,
	blockedAsns: string | undefined,
): Response | undefined {
	const asn = request.cf?.asn
	if (
		asn === undefined ||
		!blockedAsns ||
		!blockedAsns.split(',').some((value) => Number(value.trim()) === asn)
	)
		return undefined

	return new Response('Forbidden', {
		status: 403,
		headers: { 'cache-control': 'no-store' },
	})
}
