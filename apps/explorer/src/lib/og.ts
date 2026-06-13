import type * as Address from 'ox/Address'
import * as Value from 'ox/Value'
import type { AccountType } from '#lib/account'
import type { KnownEvent, KnownEventPart } from '#lib/domain/known-events'
import { DEFAULT_KNOWN_EVENT_AMOUNT_DECIMALS } from '#lib/domain/known-event-totals'
import { DateFormatter, HexFormatter } from '#lib/formatting'
import {
	type AddressOgParams,
	buildAddressOgUrl,
	buildTokenOgUrl,
	buildTxOgUrl,
	type TokenOgParams,
	type TxOgEvent,
	type TxOgParams,
} from '#lib/og-params'
import type { TxData as TxDataQuery } from '#lib/queries'

// ============ Constants ============

export const OG_BASE_URL = 'https://og.tempo.xyz'

function truncateOgText(text: string, maxLength: number): string {
	if (text.length <= maxLength) return text
	return `${text.slice(0, maxLength - 1)}…`
}

// ============ Client-side OG (for $hash.tsx) ============

export function buildOgImageUrl(data: TxDataQuery, hash: string): string {
	const timestamp = data.block.timestamp
	const ogTimestamp = DateFormatter.formatTimestampForOg(timestamp)

	let fee: string | undefined
	let total: string | undefined
	if (data.feeBreakdown.length > 0) {
		const totalFee = data.feeBreakdown.reduce((sum, item) => {
			const amount = Number.parseFloat(Value.format(item.amount, item.decimals))
			return sum + amount
		}, 0)
		const feeDisplay =
			totalFee > 0 && totalFee < 0.01 ? '<$0.01' : `$${totalFee.toFixed(2)}`
		fee = feeDisplay
		total = feeDisplay
	}

	const events: TxOgEvent[] = data.knownEvents.slice(0, 5).map((event) => {
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
				Value.format(
					amountPart.value.value,
					amountPart.value.decimals ?? DEFAULT_KNOWN_EVENT_AMOUNT_DECIMALS,
				),
			)
			amount = val > 0 && val < 0.01 ? '<$0.01' : `$${val.toFixed(0)}`
		}

		return { action, details, amount: amount || undefined }
	})

	const params: TxOgParams = {
		hash,
		block: String(data.block.number),
		sender: data.receipt.from,
		date: ogTimestamp.date,
		time: ogTimestamp.time,
		fee,
		total,
		events,
	}

	return buildTxOgUrl(OG_BASE_URL, params)
}

function formatPartForOgClient(part: KnownEventPart): string {
	switch (part.type) {
		case 'text':
			return part.value
		case 'amount':
			return `${Value.format(part.value.value, part.value.decimals ?? DEFAULT_KNOWN_EVENT_AMOUNT_DECIMALS)} ${part.value.symbol || ''}`
		case 'account':
			return HexFormatter.truncate(part.value)
		case 'token':
			return part.value.symbol || HexFormatter.truncate(part.value.address)
		case 'contractCall': {
			const selector = part.value.input.slice(0, 10)
			const target = HexFormatter.truncate(part.value.address)
			return `${selector} on ${target}`
		}
		default:
			return ''
	}
}

function formatAmount(
	amount: {
		value: bigint
		decimals?: number
		symbol?: string
	},
	includeSymbol = true,
): string {
	const decimals = amount.decimals ?? 18
	const value = Number.parseFloat(Value.format(amount.value, decimals))
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

function formatEventPart(part: KnownEventPart): string {
	switch (part.type) {
		case 'action':
			return part.value
		case 'text':
			return part.value
		case 'account':
			return HexFormatter.truncate(part.value)
		case 'amount':
			return formatAmount(part.value)
		case 'token':
			return part.value.symbol || HexFormatter.truncate(part.value.address)
		case 'number': {
			if (Array.isArray(part.value)) {
				const [val, dec] = part.value
				const num = Number.parseFloat(Value.format(val, dec))
				if (num < 1) {
					return num.toFixed(4).replace(/\.?0+$/, '')
				}
				return num.toFixed(2)
			}
			return part.value.toString()
		}
		case 'hex':
			return HexFormatter.truncate(part.value)
		case 'contractCall': {
			const selector = part.value.input.slice(0, 10)
			const target = HexFormatter.truncate(part.value.address)
			return `${selector} on ${target}`
		}
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
				`A ${action} on ${date} from ${HexFormatter.truncate(txData.from as Address.Address)}. View full details on Tempo Explorer.`,
				160,
			)
		}
		return truncateOgText(
			`A ${action} and ${eventCount - 1} other action${eventCount > 2 ? 's' : ''} on ${date}. View full details on Tempo Explorer.`,
			160,
		)
	}

	return truncateOgText(
		`Transaction on ${date} from ${HexFormatter.truncate(txData.from as Address.Address)}. View details on Tempo Explorer.`,
		160,
	)
}

export function buildTokenDescription(
	tokenData: { name: string; symbol?: string; supply?: string } | null,
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

export function buildTokenOgImageUrl(params: {
	address: string
	chainId: number
	name?: string
	symbol?: string
	currency?: string
	holders?: number | string
	supply?: string
	created?: string
	isFeeToken?: boolean
}): string {
	const ogParams: TokenOgParams = {
		address: params.address,
		chainId: params.chainId,
		name: params.name,
		symbol: params.symbol,
		currency: params.currency,
		holders:
			typeof params.holders === 'number'
				? params.holders.toString()
				: params.holders,
		supply: params.supply,
		created: params.created,
		isFeeToken: params.isFeeToken,
	}
	return buildTokenOgUrl(OG_BASE_URL, ogParams)
}

export function buildAddressOgImageUrl(params: {
	address: string
	holdings?: string
	txCount?: number
	lastActive?: string
	created?: string
	feeToken?: string
	tokens?: string[]
	accountType?: AccountType
	methods?: string[]
	deployer?: string
	contractName?: string
}): string {
	const ogParams: AddressOgParams = {
		address: params.address,
		holdings: params.holdings,
		txCount:
			typeof params.txCount === 'number'
				? params.txCount.toString()
				: undefined,
		lastActive: params.lastActive,
		created: params.created,
		feeToken: params.feeToken,
		tokens: params.tokens,
		accountType: params.accountType,
		methods: params.methods,
		deployer: params.deployer,
		contractName: params.contractName,
	}
	return buildAddressOgUrl(OG_BASE_URL, ogParams)
}
