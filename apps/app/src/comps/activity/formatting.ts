import { Hash, Hex } from 'ox'

export namespace HexFormatter {
	export function shortenHex(hex: Hex.Hex, chars: number = 4) {
		return hex.length < chars * 2 + 2
			? hex
			: `${hex.slice(0, chars + 2)}…${hex.slice(-chars)}`
	}
}

export namespace RoleFormatter {
	const KNOWN_ROLES = [
		'DEFAULT_ADMIN_ROLE',
		'ISSUER_ROLE',
		'PAUSE_ROLE',
		'UNPAUSE_ROLE',
		'BURN_BLOCKED_ROLE',
	] as const

	const roleHashMap = new Map<Hex.Hex, string>(
		KNOWN_ROLES.map((role) => [Hash.keccak256(Hex.fromString(role)), role]),
	)

	export function getRoleName(roleHash: Hex.Hex): string | undefined {
		return roleHashMap.get(roleHash)
	}
}

export namespace DateFormatter {
	export function formatDuration(seconds: number): string {
		const days = Math.floor(seconds / 86400)
		const hrs = Math.floor((seconds % 86400) / 3600)
		const mins = Math.floor((seconds % 3600) / 60)
		const secs = seconds % 60

		const parts = []
		if (days > 0) parts.push(`${days} day${days > 1 ? 's' : ''}`)
		if (hrs > 0) parts.push(`${hrs}h`)
		if (mins > 0) parts.push(`${mins}m`)
		if (secs > 0 || parts.length === 0) parts.push(`${secs}s`)

		return parts.join(' ')
	}
}

export namespace PriceFormatter {
	const amountFormatter = new Intl.NumberFormat('en-US', {
		minimumFractionDigits: 0,
		maximumFractionDigits: 18,
	})

	export function formatAmount(value: string): string {
		const number = Number(value)
		if (number > 0 && number < 0.01) return '<0.01'
		return amountFormatter.format(number)
	}
}
