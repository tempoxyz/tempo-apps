export function formatGas(gas: number, rate = true): string {
	const suffix = rate ? '/s' : ''
	if (gas >= 1_000_000_000) {
		return `${(gas / 1_000_000_000).toFixed(2)} Ggas${suffix}`
	}
	if (gas >= 1_000_000) {
		return `${(gas / 1_000_000).toFixed(1)} Mgas${suffix}`
	}
	return `${gas.toLocaleString()} gas${suffix}`
}

export function formatTps(tps: number): string {
	return Math.round(tps).toLocaleString()
}

export function formatMs(ms: number): string {
	return `${Math.round(ms).toLocaleString()}ms`
}

export function formatAccounts(count: number): string {
	if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`
	if (count >= 1_000) return `${(count / 1_000).toFixed(0)}K`
	return count.toLocaleString()
}

export function formatDate(iso: string): string {
	return new Date(iso).toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
	})
}
