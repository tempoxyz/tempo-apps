import type * as Hex from 'ox/Hex'
import * as Value from 'ox/Value'
import type * as Address from 'ox/Address'
import type { TransactionReceipt } from 'viem'
import { decodeFunctionData } from 'viem'
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
import type { TxTraceTree } from '#comps/TxTraceTree'

export type TxSummary = {
	tone: 'success' | 'failure' | 'neutral'
	headline: string
	details: string[]
	error?: string
	rawReason?: string
}

type SummaryTransaction = {
	input?: Hex.Hex | undefined
	data?: Hex.Hex | undefined
	to?: Address.Address | null | undefined
}

export function buildTxSummary(params: {
	receipt: TransactionReceipt
	knownEvents: KnownEvent[]
	tree: TxTraceTree.Node | null
	transaction?: SummaryTransaction
	balanceChangesData?: BalanceChangesData
}): TxSummary {
	const { receipt, knownEvents, tree, transaction, balanceChangesData } = params

	if (receipt.status === 'reverted') {
		return buildFailureSummary({
			tree,
			transaction,
			knownEvents,
			balanceChangesData,
		})
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
	tree: TxTraceTree.Node | null
	transaction?: SummaryTransaction
	knownEvents: KnownEvent[]
	balanceChangesData?: BalanceChangesData
}): TxSummary {
	const failedNode = findDeepestFailedNode(params.tree)
	const failedTrace = failedNode?.trace
	const decodedError = failedNode?.decodedError
	const rawReason =
		failedTrace?.revertReason || failedTrace?.error || decodedError?.name

	const insufficientBalance = buildInsufficientBalanceSummary({
		decodedError,
		failedTrace,
		balanceChangesData: params.balanceChangesData,
		rawReason,
	})
	if (insufficientBalance) return insufficientBalance

	const functionName =
		failedNode?.functionName ??
		decodeTransactionFunctionName(params.transaction) ??
		decodeKnownEventFunctionName(params.knownEvents)
	const contractAddress = failedTrace?.to ?? params.transaction?.to
	const contractName =
		failedNode?.contractName ??
		(contractAddress ? getContractInfo(contractAddress)?.name : undefined)
	const action = functionName
		? `${sentenceCase(functionName)} failed`
		: (failureActionFromKnownEvents(params.knownEvents) ?? 'Transaction failed')
	const reason = decodedError
		? formatDecodedError(decodedError)
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
		headline: `${action}.`,
		details,
		...(reason ? { error: reason } : {}),
		rawReason,
	}
}

function buildInsufficientBalanceSummary(params: {
	decodedError: TxTraceTree.DecodedError | undefined
	failedTrace: TxTraceTree.Node['trace'] | undefined
	balanceChangesData?: BalanceChangesData
	rawReason?: string
}): TxSummary | null {
	const { decodedError, failedTrace, balanceChangesData, rawReason } = params
	const errorText = `${decodedError?.name ?? ''} ${rawReason ?? ''}`
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
		error: `insufficient ${balanceLabel}`,
		rawReason,
	}
}

export function findDeepestFailedNode(
	tree: TxTraceTree.Node | null,
): TxTraceTree.Node | null {
	if (!tree) return null

	let failed: { node: TxTraceTree.Node; depth: number } | null = null
	const stack = [{ node: tree, depth: 0 }]

	while (stack.length > 0) {
		const current = stack.pop()
		if (!current) continue
		if (current.node.hasError) {
			if (!failed || current.depth > failed.depth) failed = current
		}
		for (const child of current.node.children) {
			stack.push({ node: child, depth: current.depth + 1 })
		}
	}

	return failed?.node ?? null
}

function decodeTransactionFunctionName(
	transaction: SummaryTransaction | undefined,
): string | null {
	return decodeInputFunctionName(transaction?.input ?? transaction?.data)
}

function decodeKnownEventFunctionName(
	events: readonly KnownEvent[],
): string | null {
	for (const event of events) {
		for (const part of event.parts) {
			if (part.type !== 'contractCall') continue
			const functionName = decodeInputFunctionName(part.value.input)
			if (functionName) return functionName
		}
	}

	return null
}

function decodeInputFunctionName(input: Hex.Hex | undefined): string | null {
	if (!input || input === '0x') return null

	try {
		const decoded = decodeFunctionData({ abi: allAbis, data: input })
		return decoded.functionName
	} catch {
		return null
	}
}

function failureActionFromKnownEvents(
	events: readonly KnownEvent[],
): string | undefined {
	const event = events.find(preferredEventsFilter) ?? events[0]
	if (!event) return undefined

	const contractCall = event.parts.find((part) => part.type === 'contractCall')
	if (contractCall) {
		return 'Contract call failed'
	}

	const action = formatKnownEvent(event)
	if (!action) return undefined

	return `${sentenceCase(action)} failed`
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

function formatDecodedError(error: TxTraceTree.DecodedError): string {
	if (error.panicReason) return `panic: ${error.panicReason}`
	const args = error.args.map(formatErrorArgument).join(', ')
	return args ? `${error.name}(${args})` : error.name
}

function formatErrorArgument(value: unknown): string {
	if (typeof value === 'bigint') return value.toLocaleString()
	if (typeof value === 'string') return value
	if (typeof value === 'boolean') return value ? 'true' : 'false'
	try {
		return JSON.stringify(value, (_, item) =>
			typeof item === 'bigint' ? item.toString() : item,
		)
	} catch {
		return String(value)
	}
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
