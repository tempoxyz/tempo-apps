export type PolicyLogIdentity = {
	tx_hash?: string | null
	log_idx?: unknown
}

function policyLogKey(log: PolicyLogIdentity): string | undefined {
	if (!log.tx_hash || log.log_idx == null) return undefined
	return `${log.tx_hash.toLowerCase()}:${String(log.log_idx)}`
}

export function dedupePolicyLogs<log extends PolicyLogIdentity>(
	logs: readonly log[],
): log[] {
	const seen = new Set<string>()
	return logs.filter((log) => {
		const key = policyLogKey(log)
		if (!key) return true
		if (seen.has(key)) return false
		seen.add(key)
		return true
	})
}

export async function fetchAllPolicyLogPages<log extends PolicyLogIdentity>(
	fetchPage: (limit: number, offset: number) => Promise<log[]>,
	pageSize: number,
): Promise<log[]> {
	const logs: log[] = []
	let offset = 0
	while (true) {
		const page = await fetchPage(pageSize, offset)
		logs.push(...page)
		if (page.length < pageSize) return dedupePolicyLogs(logs)
		offset += page.length
	}
}

export async function fetchRecentUniquePolicyLogs<
	log extends PolicyLogIdentity,
>(
	fetchPage: (limit: number, offset: number) => Promise<log[]>,
	uniqueLimit: number,
): Promise<log[]> {
	const logs: log[] = []
	let offset = 0
	const pageSize = uniqueLimit + 1
	while (true) {
		const page = await fetchPage(pageSize, offset)
		logs.push(...page)
		const unique = dedupePolicyLogs(logs)
		if (unique.length >= uniqueLimit || page.length < pageSize)
			return unique.slice(0, uniqueLimit)
		offset += page.length
	}
}
