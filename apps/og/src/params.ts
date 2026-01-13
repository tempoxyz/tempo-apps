/**
 * Shared OG Image Parameter Types & Utilities
 *
 * These types define the contract between the explorer (which builds URLs)
 * and the OG worker (which parses and renders them).
 *
 * NOTE: This file is duplicated in apps/explorer/src/lib/og-params.ts
 * Keep them in sync until we create a shared package.
 */

import * as z from 'zod/mini'

// ============ Constants ============

export const MAX_PARAM_SHORT = 64
export const MAX_PARAM_MED = 256
export const MAX_PARAM_LONG = 1024
export const MAX_EVENTS = 6

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

/** Sanitize + truncate transform for Zod Mini */
const sanitized = (maxLen: number) =>
	z.pipe(
		z.optional(z.string()),
		z.transform((v) => (v ? sanitizeText(v).slice(0, maxLen) : undefined)),
	)

/** Sanitize + truncate with default value */
const sanitizedWithDefault = (maxLen: number, defaultValue = '—') =>
	z.pipe(
		z.optional(z.string()),
		z.transform((v) =>
			v ? sanitizeText(v).slice(0, maxLen) : sanitizeText(defaultValue),
		),
	)

const zAccountType = z.enum(['empty', 'account', 'contract'])

/** Boolean from string "true" */
const booleanString = z.pipe(
	z.optional(z.string()),
	z.transform((v) => v === 'true'),
)

/** Optional string field */
const optionalString = z.optional(z.string())

/** Parse pipe-delimited event string */
function parseEventString(eventParam: string | undefined) {
	if (!eventParam) return undefined
	const sanitizedParam = sanitizeText(eventParam).slice(0, MAX_PARAM_LONG)
	const [action, details, amount, message] = sanitizedParam.split('|')
	if (!action) return undefined
	return {
		action: truncateText(action, 40),
		details: truncateText(details || '', 180),
		amount: amount ? truncateText(amount, 30) : undefined,
		message: message ? truncateText(message, 140) : undefined,
	}
}

// ============ Transaction OG Schema ============

export interface TxOgEvent {
	action: string
	details: string
	amount?: string
	message?: string
}

export const txOgQuerySchema = z.pipe(
	z.object({
		block: sanitizedWithDefault(MAX_PARAM_SHORT),
		sender: sanitizedWithDefault(MAX_PARAM_MED),
		date: sanitizedWithDefault(MAX_PARAM_SHORT),
		time: sanitizedWithDefault(MAX_PARAM_SHORT),
		fee: sanitized(MAX_PARAM_SHORT),
		feeToken: sanitized(24),
		feePayer: sanitized(MAX_PARAM_MED),
		total: sanitized(MAX_PARAM_SHORT),
		// Events can arrive via multiple key formats: ev{n}, e{n}, event{n}
		ev1: optionalString,
		ev2: optionalString,
		ev3: optionalString,
		ev4: optionalString,
		ev5: optionalString,
		ev6: optionalString,
		e1: optionalString,
		e2: optionalString,
		e3: optionalString,
		e4: optionalString,
		e5: optionalString,
		e6: optionalString,
		event1: optionalString,
		event2: optionalString,
		event3: optionalString,
		event4: optionalString,
		event5: optionalString,
		event6: optionalString,
	}),
	z.transform((data) => {
		const events: TxOgEvent[] = []
		for (let i = 1; i <= MAX_EVENTS; i++) {
			const eventParam =
				data[`ev${i}` as keyof typeof data] ??
				data[`e${i}` as keyof typeof data] ??
				data[`event${i}` as keyof typeof data]
			const event = parseEventString(eventParam as string | undefined)
			if (event) events.push(event)
		}
		return {
			block: data.block,
			sender: data.sender,
			date: data.date,
			time: data.time,
			fee: data.fee,
			feeToken: data.feeToken,
			feePayer: data.feePayer,
			total: data.total,
			events,
		}
	}),
)

export type TxOgQueryParams = z.output<typeof txOgQuerySchema>

// ============ Token OG Schema ============

export const tokenOgQuerySchema = z.pipe(
	z.object({
		name: sanitizedWithDefault(48),
		symbol: sanitizedWithDefault(24),
		currency: sanitizedWithDefault(12),
		holders: sanitizedWithDefault(24),
		supply: sanitizedWithDefault(32),
		created: sanitizedWithDefault(32),
		quoteToken: sanitized(24),
		isFeeToken: booleanString,
		chainId: z.optional(z.coerce.number()),
	}),
	z.transform((data) => ({
		name: data.name,
		symbol: data.symbol,
		currency: data.currency,
		holders: data.holders,
		supply: data.supply,
		created: data.created,
		quoteToken: data.quoteToken,
		isFeeToken: data.isFeeToken,
		chainId: data.chainId,
	})),
)

export type TokenOgQueryParams = z.output<typeof tokenOgQuerySchema>

// ============ Address OG Schema ============

/** Parse comma-separated list with truncation */
const commaSeparatedList = (itemMaxLen: number, maxItems: number) =>
	z.pipe(
		z.optional(z.string()),
		z.transform((v) => {
			if (!v) return []
			return sanitizeText(v)
				.slice(0, MAX_PARAM_LONG)
				.split(',')
				.map((item) => truncateText(item.trim(), itemMaxLen))
				.filter(Boolean)
				.slice(0, maxItems)
		}),
	)

/** Sanitize string with default and truncation */
const sanitizedField = (maxLen: number, defaultValue = '—') =>
	z.pipe(
		z.optional(z.string()),
		z.transform((v) => truncateText(sanitizeText(v || defaultValue), maxLen)),
	)

export const addressOgQuerySchema = z.pipe(
	z.object({
		holdings: sanitizedField(24),
		txCount: sanitizedField(16),
		lastActive: sanitizedField(40),
		created: sanitizedField(40),
		feeToken: sanitizedField(24),
		tokens: commaSeparatedList(24, 12),
		methods: commaSeparatedList(32, 16),
		accountType: z.optional(zAccountType),
	}),
	z.transform((data) => ({
		holdings: data.holdings,
		txCount: data.txCount,
		lastActive: data.lastActive,
		created: data.created,
		feeToken: data.feeToken,
		tokens: data.tokens,
		methods: data.methods,
		accountType: data.accountType,
	})),
)

export type AddressOgQueryParams = z.output<typeof addressOgQuerySchema>
