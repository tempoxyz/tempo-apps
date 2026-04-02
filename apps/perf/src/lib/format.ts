export function formatGas(gasPerSecond: number): string {
	if (gasPerSecond >= 1_000_000_000) {
		return `${(gasPerSecond / 1_000_000_000).toFixed(2)} Ggas/s`
	}
	if (gasPerSecond >= 1_000_000) {
		return `${(gasPerSecond / 1_000_000).toFixed(1)} Mgas/s`
	}
	return `${gasPerSecond.toLocaleString()} gas/s`
}

export function formatTps(tps: number): string {
	return tps.toLocaleString()
}

export function formatMs(ms: number): string {
	return `${ms.toLocaleString()}ms`
}

export function formatDate(iso: string): string {
	return new Date(iso).toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
	})
}
