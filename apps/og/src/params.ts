/**
 * Shared OG Image Parameter Types & Utilities
 *
 * These types define the contract between the explorer (which builds URLs)
 * and the OG worker (which parses and renders them).
 *
 * NOTE: This file is duplicated in apps/explorer/src/lib/og-params.ts
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
	block: string
	sender: string
	date: string
	time: string
	fee?: string
	feeToken?: string
	feePayer?: string
	total?: string
	events: TxOgEvent[]
}

// ============ Token OG Params ============

export interface TokenOgParams {
	address: string
	name: string
	symbol: string
	currency: string
	holders: string
	supply: string
	created: string
	quoteToken?: string
	isFeeToken: boolean
}

// ============ Address OG Params ============

export interface AddressOgParams {
	address: string
	holdings: string
	txCount: string
	lastActive: string
	created: string
	feeToken: string
	tokens: string[]
	isContract: boolean
	methods: string[]
}

// ============ Utility Functions ============

export function truncateText(text: string, maxLength: number): string {
	if (!text || text.length <= maxLength) return text
	return `${text.slice(0, maxLength - 1)}…`
}

export function sanitizeText(value: string): string {
	let out = ''
	for (let index = 0; index < value.length; index++) {
		const code = value.charCodeAt(index)
		if ((code >= 0x00 && code <= 0x1f) || code === 0x7f) {
			out += ' '
			continue
		}
		out += value[index] ?? ''
	}
	return out.replace(/\s+/g, ' ').trim()
}

function getParam(
	params: URLSearchParams,
	key: string,
	maxLen: number,
): string | undefined {
	const raw = params.get(key)
	if (!raw) return undefined
	return sanitizeText(raw).slice(0, maxLen)
}

// ============ URL Parsers ============

export function parseTxOgParams(
	hash: string,
	params: URLSearchParams,
): TxOgParams {
	const events: TxOgEvent[] = []

	for (let i = 1; i <= MAX_EVENTS; i++) {
		// Events can arrive via multiple key formats depending on who generated the URL.
		// Prefer the newer `ev{n}` keys, but keep backwards compatibility with `e{n}`.
		const eventParam =
			getParam(params, `ev${i}`, MAX_PARAM_LONG) ??
			getParam(params, `e${i}`, MAX_PARAM_LONG) ??
			getParam(params, `event${i}`, MAX_PARAM_LONG)
		if (eventParam) {
			const [action, details, amount, message] = eventParam.split('|')
			if (action) {
				events.push({
					action: truncateText(action, 40),
					details: truncateText(details || '', 180),
					amount: amount ? truncateText(amount, 30) : undefined,
					message: message ? truncateText(message, 140) : undefined,
				})
			}
		}
	}

	return {
		hash,
		block: getParam(params, 'block', MAX_PARAM_SHORT) || '—',
		sender: getParam(params, 'sender', MAX_PARAM_MED) || '—',
		date: getParam(params, 'date', MAX_PARAM_SHORT) || '—',
		time: getParam(params, 'time', MAX_PARAM_SHORT) || '—',
		fee: getParam(params, 'fee', MAX_PARAM_SHORT),
		feeToken: getParam(params, 'feeToken', 24),
		feePayer: getParam(params, 'feePayer', MAX_PARAM_MED),
		total: getParam(params, 'total', MAX_PARAM_SHORT),
		events,
	}
}

export function parseTokenOgParams(
	address: string,
	params: URLSearchParams,
): TokenOgParams {
	return {
		address,
		name: getParam(params, 'name', 48) || '—',
		symbol: getParam(params, 'symbol', 24) || '—',
		currency: getParam(params, 'currency', 12) || '—',
		holders: getParam(params, 'holders', 24) || '—',
		supply: getParam(params, 'supply', 32) || '—',
		created: getParam(params, 'created', 32) || '—',
		quoteToken: getParam(params, 'quoteToken', 24),
		isFeeToken: params.get('isFeeToken') === 'true',
	}
}

export function parseAddressOgParams(
	address: string,
	params: URLSearchParams,
): AddressOgParams {
	const tokensParam = sanitizeText(params.get('tokens') || '').slice(
		0,
		MAX_PARAM_LONG,
	)
	const methodsParam = sanitizeText(params.get('methods') || '').slice(
		0,
		MAX_PARAM_LONG,
	)

	return {
		address,
		holdings: truncateText(sanitizeText(params.get('holdings') || '—'), 24),
		txCount: truncateText(sanitizeText(params.get('txCount') || '—'), 16),
		lastActive: truncateText(sanitizeText(params.get('lastActive') || '—'), 40),
		created: truncateText(sanitizeText(params.get('created') || '—'), 40),
		feeToken: truncateText(sanitizeText(params.get('feeToken') || '—'), 24),
		tokens: tokensParam
			? tokensParam
					.split(',')
					.map((t) => truncateText(t.trim(), 24))
					.filter(Boolean)
					.slice(0, 12)
			: [],
		isContract: params.get('isContract') === 'true',
		methods: methodsParam
			? methodsParam
					.split(',')
					.map((m) => truncateText(m.trim(), 32))
					.filter(Boolean)
					.slice(0, 16)
			: [],
	}
}
