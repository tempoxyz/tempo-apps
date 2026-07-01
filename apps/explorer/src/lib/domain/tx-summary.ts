import * as Hex from 'ox/Hex'
import * as Value from 'ox/Value'
import type { TransactionReceipt } from 'viem'
import { decodeErrorResult, decodeFunctionData } from 'viem'
import { allAbis } from '#lib/abis'
import { getContractInfo } from '#lib/domain/contracts'
import {
	preferredEventsFilter,
	type KnownEvent,
	type KnownEventPart,
} from '#lib/domain/known-events'
import { isTip20Address } from '#lib/domain/tip20'
import { HexFormatter, PriceFormatter } from '#lib/formatting'
import type { BalanceChangesData } from '#lib/queries/balance-changes'
import type { CallTrace } from '#lib/queries/trace'

export type TxSummary = {
	tone: 'success' | 'failure' | 'neutral'
	headline: string
	details: string[]
	rawReason?: string
}

type DecodedTraceError = {
	errorName: string
	args: readonly unknown[]
}

export function buildTxSummary(params: {
	receipt: TransactionReceipt
	knownEvents: KnownEvent[]
	trace: CallTrace | null
	balanceChangesData?: BalanceChangesData
}): TxSummary {
	const { receipt, knownEvents, trace, balanceChangesData } = params

	if (receipt.status === 'reverted') {
		return buildFailureSummary({ trace, balanceChangesData })
	}

	const event = knownEvents.find(preferredEventsFilter) ?? knownEvents[0]
	if (!event) {
		return {
			tone: 'success',
			headline: 'Transaction succeeded.',
			details: ['No high-level events were detected for this transaction.'],
		}
	}

	const headline = sentenceCase(formatKnownEvent(event))
	const details =
		knownEvents.length > 1
			? [`${knownEvents.length.toLocaleString()} interpreted events detected.`]
			: ['1 interpreted event detected.']

	return {
		tone: 'success',
		headline: `${headline}.`,
		details,
	}
}

function buildFailureSummary(params: {
	trace: CallTrace | null
	balanceChangesData?: BalanceChangesData
}): TxSummary {
	const failedTrace = findDeepestFailedTrace(params.trace)
	const decodedError = failedTrace ? decodeTraceError(failedTrace) : null
	const rawReason =
		failedTrace?.revertReason || failedTrace?.error || decodedError?.errorName

	const insufficientBalance = buildInsufficientBalanceSummary({
		decodedError,
		failedTrace,
		balanceChangesData: params.balanceChangesData,
		rawReason,
	})
	if (insufficientBalance) return insufficientBalance

	const functionName = failedTrace ? decodeTraceFunctionName(failedTrace) : null
	const contractName = failedTrace?.to
		? getContractInfo(failedTrace.to)?.name
		: undefined
	const action = functionName
		? `${sentenceCase(functionName)} failed`
		: 'Transaction failed'
	const reason = decodedError?.errorName
		? humanizeIdentifier(decodedError.errorName)
		: humanizeRawReason(rawReason)

	const details: string[] = []
	if (contractName && functionName) {
		details.push(`Failed call: ${contractName}.${functionName}().`)
	} else if (contractName) {
		details.push(`Failed contract: ${contractName}.`)
	}
	if (rawReason && rawReason !== reason)
		details.push(`Raw reason: ${rawReason}`)

	return {
		tone: 'failure',
		headline: reason ? `${action}: ${reason}.` : `${action}.`,
		details,
		rawReason,
	}
}

function buildInsufficientBalanceSummary(params: {
	decodedError: DecodedTraceError | null
	failedTrace: CallTrace | null
	balanceChangesData?: BalanceChangesData
	rawReason?: string
}): TxSummary | null {
	const { decodedError, failedTrace, balanceChangesData, rawReason } = params
	const errorText = `${decodedError?.errorName ?? ''} ${rawReason ?? ''}`
	if (!/insufficient/i.test(errorText) || !/balance/i.test(errorText)) {
		return null
	}

	const token =
		failedTrace?.to && isTip20Address(failedTrace.to)
			? failedTrace.to
			: undefined
	const metadata = token ? balanceChangesData?.tokenMetadata[token] : undefined
	const amounts = decodedError?.args.filter(
		(arg): arg is bigint => typeof arg === 'bigint',
	)
	const available = amounts && amounts.length >= 2 ? amounts.at(-2) : undefined
	const required = amounts && amounts.length >= 2 ? amounts.at(-1) : undefined
	const balanceLabel = metadata?.symbol
		? `${metadata.symbol} balance`
		: token
			? 'TIP-20 balance'
			: 'token balance'

	const amountDetail =
		available !== undefined && required !== undefined
			? ` Available ${formatTokenAmount(available, metadata)}, required ${formatTokenAmount(required, metadata)}.`
			: ''

	const details: string[] = []
	if (failedTrace?.to) {
		const contractName = getContractInfo(failedTrace.to)?.name
		details.push(
			`Failed at ${contractName ?? HexFormatter.truncate(failedTrace.to)}.`,
		)
	}
	if (rawReason) details.push(`Raw reason: ${rawReason}`)

	return {
		tone: 'failure',
		headline: `Transfer failed: insufficient ${balanceLabel}.${amountDetail}`,
		details,
		rawReason,
	}
}

function findDeepestFailedTrace(trace: CallTrace | null): CallTrace | null {
	if (!trace) return null

	let failed: CallTrace | null =
		trace.error || trace.revertReason ? trace : null
	const stack = [...(trace.calls ?? [])]

	while (stack.length > 0) {
		const current = stack.pop()
		if (!current) continue
		if (current.error || current.revertReason) failed = current
		if (current.calls) stack.push(...current.calls)
	}

	return failed
}

function decodeTraceError(trace: CallTrace): DecodedTraceError | null {
	const data = getRevertData(trace)
	if (!data) return null

	try {
		const decoded = decodeErrorResult({ abi: allAbis, data })
		return {
			errorName: decoded.errorName,
			args: decoded.args ?? [],
		}
	} catch {
		return null
	}
}

function decodeTraceFunctionName(trace: CallTrace): string | null {
	if (!trace.input || trace.input === '0x') return null

	try {
		const decoded = decodeFunctionData({ abi: allAbis, data: trace.input })
		return decoded.functionName
	} catch {
		return null
	}
}

function getRevertData(trace: CallTrace): Hex.Hex | null {
	if (trace.output && trace.output !== '0x' && Hex.validate(trace.output)) {
		return trace.output
	}

	const raw = trace.revertReason || trace.error
	const [data] = raw?.match(/0x[0-9a-fA-F]+/) ?? []
	if (data && Hex.validate(data)) return data as Hex.Hex
	return null
}

function formatKnownEvent(event: KnownEvent): string {
	return event.parts.map(formatKnownEventPart).filter(Boolean).join(' ')
}

function formatKnownEventPart(part: KnownEventPart): string {
	switch (part.type) {
		case 'account':
			return HexFormatter.truncate(part.value)
		case 'action':
		case 'text':
			return part.value
		case 'amount':
			return formatTokenAmount(part.value.value, part.value)
		case 'contractCall':
			return `call ${HexFormatter.truncate(part.value.address)}`
		case 'duration':
			return `${part.value.toLocaleString()}s`
		case 'hex':
		case 'role':
			return HexFormatter.truncate(part.value)
		case 'number': {
			const value = part.value
			if (Array.isArray(value)) return Value.format(value[0], value[1])
			return value.toLocaleString()
		}
		case 'tick':
			return part.value.toLocaleString()
		case 'token':
			return part.value.symbol ?? HexFormatter.truncate(part.value.address)
	}
}

function formatTokenAmount(
	value: bigint,
	metadata?: {
		decimals?: number
		symbol?: string
		currency?: string
	},
): string {
	if (metadata?.decimals === undefined) return value.toLocaleString()

	const formatted = PriceFormatter.formatAmount(
		Value.format(value, metadata.decimals),
	)
	const suffix = metadata.symbol ?? metadata.currency
	return suffix ? `${formatted} ${suffix}` : formatted
}

function sentenceCase(value: string): string {
	if (!value) return value
	return `${value[0]?.toUpperCase() ?? ''}${value.slice(1)}`
}

function humanizeIdentifier(value: string): string {
	return value
		.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
		.replace(/[_-]+/g, ' ')
		.replace(/^tip 20\s+/i, 'TIP-20 ')
		.toLowerCase()
}

function humanizeRawReason(value: string | undefined): string | undefined {
	if (!value) return undefined
	const cleaned = value
		.replace(/^execution reverted:?\s*/i, '')
		.replace(/^reverted:?\s*/i, '')
		.trim()

	if (!cleaned || cleaned.startsWith('0x')) return undefined
	return cleaned
}
