import { Value } from 'ox'
import * as React from 'react'
import type { KnownEvent, KnownEventPart } from '#lib/domain/known-events'
import { DateFormatter } from '#lib/formatting'
import type { TxData } from '#lib/queries'

// ============ Constants ============

export const OG_BASE_URL = import.meta.env?.VITE_OG_URL
	? import.meta.env.VITE_OG_URL
	: 'https://og.porto.workers.dev'

// ============ Shared Utilities ============

export function truncateAddress(address: string): string {
	if (address.length <= 10) return address
	return `${address.slice(0, 6)}…${address.slice(-4)}`
}

export function truncateOgText(text: string, maxLength: number): string {
	if (text.length <= maxLength) return text
	return `${text.slice(0, maxLength - 1)}…`
}

export function escapeHtml(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;')
}

// ============ Client-side OG (for $hash.tsx) ============

export function buildOgImageUrl(data: TxData, hash: string): string {
	const params = new URLSearchParams()

	params.set('block', String(data.block.number))
	params.set('sender', data.receipt.from)

	const timestamp = data.block.timestamp
	params.set('date', DateFormatter.formatTimestampDate(timestamp))
	const timeInfo = DateFormatter.formatTimestampTime(timestamp)
	params.set('time', `${timeInfo.time} ${timeInfo.timezone}${timeInfo.offset}`)

	if (data.feeBreakdown.length > 0) {
		const totalFee = data.feeBreakdown.reduce((sum, item) => {
			const amount = Number(Value.format(item.amount, item.decimals))
			return sum + amount
		}, 0)
		const feeDisplay =
			totalFee > 0 && totalFee < 0.01 ? '<$0.01' : `$${totalFee.toFixed(2)}`
		params.set('fee', feeDisplay)
		params.set('total', feeDisplay)
	}

	data.knownEvents.slice(0, 5).forEach((event, index) => {
		const eventStr = formatEventForOgClient(event)
		if (eventStr) {
			params.set(`e${index + 1}`, eventStr)
		}
	})

	return `${OG_BASE_URL}/tx/${hash}?${params.toString()}`
}

function formatEventForOgClient(event: KnownEvent): string {
	const actionPart = event.parts.find((p) => p.type === 'action')
	const action = actionPart?.type === 'action' ? actionPart.value : event.type

	const details = event.parts
		.filter((p) => p.type !== 'action')
		.map((part) => formatPartForOgClient(part))
		.filter(Boolean)
		.join(' ')

	const amountPart = event.parts.find((p) => p.type === 'amount')
	let amount = ''
	if (amountPart?.type === 'amount') {
		const val = Number(
			Value.format(amountPart.value.value, amountPart.value.decimals ?? 6),
		)
		amount = val > 0 && val < 0.01 ? '<$0.01' : `$${val.toFixed(0)}`
	}

	return `${action}|${details}|${amount}`
}

function formatPartForOgClient(part: KnownEventPart): string {
	switch (part.type) {
		case 'text':
			return part.value
		case 'amount':
			return `${Value.format(part.value.value, part.value.decimals ?? 6)} ${part.value.symbol || ''}`
		case 'account':
			return truncateAddress(part.value)
		case 'token':
			return part.value.symbol || truncateAddress(part.value.address)
		default:
			return ''
	}
}

function setMetaTag(name: string, content: string) {
	let meta = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement
	if (!meta) {
		meta = document.createElement('meta')
		meta.name = name
		document.head.appendChild(meta)
	}
	meta.content = content
}

export function useTxOgMeta(data: TxData | undefined, hash: string) {
	React.useEffect(() => {
		if (!data) return

		const ogImageUrl = buildOgImageUrl(data, hash)
		const title = `Transaction ${hash.slice(0, 10)}...${hash.slice(-6)} ⋅ Tempo Explorer`

		document.title = title

		setMetaTag('og:title', title)
		setMetaTag('og:image', ogImageUrl)
		setMetaTag('og:image:type', 'image/webp')
		setMetaTag('og:image:width', '1200')
		setMetaTag('og:image:height', '630')
		setMetaTag('twitter:card', 'summary_large_image')
		setMetaTag('twitter:image', ogImageUrl)

		return () => {
			document.title = 'Explorer ⋅ Tempo'
		}
	}, [data, hash])
}

// ============ Server-side OG (for index.server.ts) ============

export class OgMetaRemover {
	element(element: Element) {
		const property = element.getAttribute('property')
		const name = element.getAttribute('name')

		if (
			property?.startsWith('og:') ||
			name?.startsWith('og:') ||
			name?.startsWith('twitter:')
		) {
			element.remove()
		}
	}
}

export class OgMetaInjector {
	private ogImageUrl: string
	private title: string
	private description: string

	constructor(ogImageUrl: string, title: string, description: string) {
		this.ogImageUrl = ogImageUrl
		this.title = escapeHtml(title)
		this.description = escapeHtml(description)
	}

	element(element: Element) {
		element.prepend(
			`<meta name="twitter:image" content="${this.ogImageUrl}" />`,
			{ html: true },
		)
		element.prepend(
			'<meta name="twitter:card" content="summary_large_image" />',
			{ html: true },
		)
		element.prepend(
			`<meta name="twitter:description" content="${this.description}" />`,
			{ html: true },
		)
		element.prepend('<meta property="og:image:height" content="630" />', {
			html: true,
		})
		element.prepend('<meta property="og:image:width" content="1200" />', {
			html: true,
		})
		element.prepend('<meta property="og:image:type" content="image/png" />', {
			html: true,
		})
		element.prepend(
			`<meta property="og:image" content="${this.ogImageUrl}" />`,
			{ html: true },
		)
		element.prepend(
			`<meta property="og:description" content="${this.description}" />`,
			{ html: true },
		)
		element.prepend(`<meta property="og:title" content="${this.title}" />`, {
			html: true,
		})
	}
}

export function formatAmount(
	amount: {
		value: bigint
		decimals?: number
		symbol?: string
	},
	includeSymbol = true,
): string {
	const decimals = amount.decimals ?? 18
	const value = Number(amount.value) / 10 ** decimals
	let formatted: string
	if (value === 0) {
		formatted = '0.00'
	} else if (value < 0.01) {
		formatted = '<0.01'
	} else if (value >= 1000000000) {
		formatted = `${(value / 1000000000).toFixed(2)}B`
	} else if (value >= 1000000) {
		formatted = `${(value / 1000000).toFixed(2)}M`
	} else if (value >= 1000) {
		formatted = `${(value / 1000).toFixed(2)}K`
	} else {
		formatted = value.toFixed(2)
	}
	return includeSymbol && amount.symbol
		? `${formatted} ${amount.symbol}`
		: formatted
}

export function formatEventPart(part: KnownEventPart): string {
	switch (part.type) {
		case 'action':
			return part.value
		case 'text':
			return part.value
		case 'account':
			return truncateAddress(part.value)
		case 'amount':
			return formatAmount(part.value)
		case 'token':
			return part.value.symbol || truncateAddress(part.value.address)
		case 'number': {
			if (Array.isArray(part.value)) {
				const [val, dec] = part.value
				const num = Number(val) / 10 ** dec
				if (num < 1) {
					return num.toFixed(4).replace(/\.?0+$/, '')
				}
				return num.toFixed(2)
			}
			return part.value.toString()
		}
		case 'hex':
			return truncateAddress(part.value)
		default:
			return ''
	}
}

export function formatEventForOgServer(event: KnownEvent): string {
	const actionPart = event.parts.find((p) => p.type === 'action')
	const action = actionPart ? formatEventPart(actionPart) : event.type

	const detailParts = event.parts.filter((p) => p.type !== 'action')
	const details = detailParts.map(formatEventPart).filter(Boolean).join(' ')

	let usdAmount = ''
	for (const part of event.parts) {
		if (part.type === 'amount') {
			const formatted = formatAmount(part.value, false)
			usdAmount = formatted.startsWith('<')
				? `<$${formatted.slice(1)}`
				: `$${formatted}`
			break
		}
	}

	return `${truncateOgText(action, 20)}|${truncateOgText(details, 60)}|${truncateOgText(usdAmount, 15)}`
}

export function formatDate(timestamp: number): string {
	const d = new Date(timestamp)
	const month = d.toLocaleDateString('en-US', { month: 'short' })
	const day = d.getDate()
	const year = d.getFullYear()
	return `${month} ${day} ${year}`
}

export function formatTime(timestamp: number): string {
	const d = new Date(timestamp)
	const hours = String(d.getHours()).padStart(2, '0')
	const minutes = String(d.getMinutes()).padStart(2, '0')
	return `${hours}:${minutes}`
}

export function formatDateTime(timestamp: number): string {
	const date = new Date(timestamp)
	return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()} ${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`
}

export function buildTxDescription(
	txData: { timestamp: number; from: string; events: KnownEvent[] } | null,
	_hash: string,
): string {
	if (!txData) {
		return `View transaction details on Tempo Explorer.`
	}

	const date = formatDate(txData.timestamp)
	const eventCount = txData.events.length

	if (eventCount > 0) {
		const firstEvent = txData.events[0]
		const actionPart = firstEvent.parts.find((p) => p.type === 'action')
		const action = actionPart
			? truncateOgText(String(actionPart.value).toLowerCase(), 20)
			: 'transaction'

		if (eventCount === 1) {
			return truncateOgText(
				`A ${action} on ${date} from ${truncateAddress(txData.from)}. View full details on Tempo Explorer.`,
				160,
			)
		}
		return truncateOgText(
			`A ${action} and ${eventCount - 1} other action${eventCount > 2 ? 's' : ''} on ${date}. View full details on Tempo Explorer.`,
			160,
		)
	}

	return truncateOgText(
		`Transaction on ${date} from ${truncateAddress(txData.from)}. View details on Tempo Explorer.`,
		160,
	)
}

export function buildTokenDescription(
	tokenData: { name: string; symbol?: string; supply?: string } | null,
	_address: string,
): string {
	if (!tokenData || tokenData.name === '—') {
		return `View token details and activity on Tempo Explorer.`
	}

	const name = truncateOgText(tokenData.name, 30)
	const symbol =
		tokenData.symbol && tokenData.symbol !== '—'
			? truncateOgText(tokenData.symbol, 12)
			: null

	const namePart = symbol ? `${name} (${symbol})` : name

	if (tokenData.supply && tokenData.supply !== '—') {
		return truncateOgText(
			`${namePart} · ${tokenData.supply} total supply. View token activity on Tempo Explorer.`,
			160,
		)
	}

	return truncateOgText(
		`${namePart}. View token activity on Tempo Explorer.`,
		160,
	)
}

export function buildAddressDescription(
	addressData: { holdings: string; txCount: number } | null,
	_address: string,
): string {
	if (!addressData) {
		return `View address activity & holdings on Tempo Explorer.`
	}

	const parts: string[] = []
	if (addressData.holdings !== '—') {
		parts.push(`${truncateOgText(addressData.holdings, 20)} in holdings`)
	}
	if (addressData.txCount > 0) {
		parts.push(`${addressData.txCount} transactions`)
	}

	if (parts.length > 0) {
		return truncateOgText(
			`${parts.join(' · ')}. View full activity on Tempo Explorer.`,
			160,
		)
	}

	return `View address activity & holdings on Tempo Explorer.`
}
