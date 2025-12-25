/**
 * Shared OG Image Parameter Types & Utilities
 *
 * These types define the contract between the explorer (which builds URLs)
 * and the OG worker (which parses and renders them).
 *
 * NOTE: This file is duplicated in apps/og/src/og-params.ts
 * Keep them in sync until we create a shared package.
 */

// ============ Constants ============

export const MAX_PARAM_SHORT = 64
export const MAX_PARAM_MED = 256
export const MAX_PARAM_LONG = 1024
export const MAX_EVENTS = 6

// ============ Transaction OG Params ============

export interface TxOgEvent {
	action: string
	details: string
	amount?: string
	message?: string
}

export interface TxOgParams {
	hash: string
	block?: string
	sender?: string
	date?: string
	time?: string
	fee?: string
	feeToken?: string
	feePayer?: string
	total?: string
	events: TxOgEvent[]
}

// ============ Token OG Params ============

export interface TokenOgParams {
	address: string
	name?: string
	symbol?: string
	currency?: string
	holders?: string
	supply?: string
	created?: string
	quoteToken?: string
	isFeeToken?: boolean
}

// ============ Address OG Params ============

export interface AddressOgParams {
	address: string
	holdings?: string
	txCount?: string
	lastActive?: string
	created?: string
	feeToken?: string
	tokens?: string[]
	accountType?: 'empty' | 'account' | 'contract'
	methods?: string[]
}

// ============ Utility Functions ============

export function truncateText(text: string, maxLength: number): string {
	if (!text || text.length <= maxLength) return text
	return `${text.slice(0, maxLength - 1)}…`
}

export function sanitizeText(value: string): string {
	let out = ''
	for (let index = 0; index < value.length; index += 1) {
		const code = value.charCodeAt(index)
		if ((code >= 0x00 && code <= 0x1f) || code === 0x7f) {
			out += ' '
			continue
		}
		out += value[index] ?? ''
	}
	return out.replace(/\s+/g, ' ').trim()
}

// ============ URL Builders ============

export function buildTxOgUrl(baseUrl: string, params: TxOgParams): string {
	const search = new URLSearchParams()

	if (params.block)
		search.set('block', truncateText(params.block, MAX_PARAM_SHORT))
	if (params.sender)
		search.set('sender', truncateText(params.sender, MAX_PARAM_MED))
	if (params.date)
		search.set('date', truncateText(params.date, MAX_PARAM_SHORT))
	if (params.time)
		search.set('time', truncateText(params.time, MAX_PARAM_SHORT))
	if (params.fee) search.set('fee', truncateText(params.fee, MAX_PARAM_SHORT))
	if (params.feeToken) search.set('feeToken', truncateText(params.feeToken, 24))
	if (params.feePayer)
		search.set('feePayer', truncateText(params.feePayer, MAX_PARAM_MED))
	if (params.total)
		search.set('total', truncateText(params.total, MAX_PARAM_SHORT))

	params.events.slice(0, MAX_EVENTS).forEach((event, index) => {
		const parts = [
			truncateText(event.action, 40),
			truncateText(event.details, 180),
			event.amount ? truncateText(event.amount, 30) : '',
			event.message ? truncateText(event.message, 140) : '',
		]
		// Use `ev{n}` instead of `e{n}` to avoid potential upstream query-param filtering.
		// The OG renderer supports both.
		search.set(`ev${index + 1}`, parts.join('|'))
	})

	return `${baseUrl}/tx/${params.hash}?${search.toString()}`
}

export function buildTokenOgUrl(
	baseUrl: string,
	params: TokenOgParams,
): string {
	const search = new URLSearchParams()

	if (params.name) search.set('name', truncateText(params.name, 48))
	if (params.symbol) search.set('symbol', truncateText(params.symbol, 24))
	if (params.currency) search.set('currency', truncateText(params.currency, 12))
	if (params.holders) search.set('holders', truncateText(params.holders, 24))
	if (params.supply) search.set('supply', truncateText(params.supply, 32))
	if (params.created) search.set('created', truncateText(params.created, 32))
	if (params.quoteToken)
		search.set('quoteToken', truncateText(params.quoteToken, 24))
	if (params.isFeeToken) search.set('isFeeToken', 'true')

	return `${baseUrl}/token/${params.address}?${search.toString()}`
}

export function buildAddressOgUrl(
	baseUrl: string,
	params: AddressOgParams,
): string {
	const search = new URLSearchParams()

	if (params.holdings) search.set('holdings', truncateText(params.holdings, 24))
	if (params.txCount) search.set('txCount', truncateText(params.txCount, 16))
	if (params.lastActive)
		search.set('lastActive', truncateText(params.lastActive, 40))
	if (params.created) search.set('created', truncateText(params.created, 40))
	if (params.feeToken) search.set('feeToken', truncateText(params.feeToken, 24))
	if (params.tokens && params.tokens.length > 0) {
		search.set(
			'tokens',
			params.tokens
				.map((t) => truncateText(t, 24))
				.slice(0, 12)
				.join(','),
		)
	}
	if (params.accountType) {
		search.set('accountType', params.accountType)
		if (
			params.accountType === 'contract' &&
			params.methods &&
			params.methods.length > 0
		) {
			search.set(
				'methods',
				params.methods
					.map((m) => truncateText(m, 32))
					.slice(0, 16)
					.join(','),
			)
		}
	}

	return `${baseUrl}/address/${params.address}?${search.toString()}`
}
