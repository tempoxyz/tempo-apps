import { queryOptions, useQuery } from '@tanstack/react-query'
import {
	createFileRoute,
	Link,
	stripSearchParams,
	useNavigate,
} from '@tanstack/react-router'
import * as OxAddress from 'ox/Address'
import * as OxHex from 'ox/Hex'
import * as Value from 'ox/Value'
import * as React from 'react'
import type { Abi, AbiFunction, Log } from 'viem'
import {
	decodeFunctionData,
	encodeFunctionData,
	getFunctionSelector,
	zeroAddress,
} from 'viem'
import { getBlock, getTransaction, getTransactionReceipt } from 'wagmi/actions'
import { useConnection } from 'wagmi'
import * as z from 'zod/mini'
import { Address } from '#comps/Address'
import { Sections } from '#comps/Sections'
import { TokenIcon } from '#comps/TokenIcon'
import { TxEventDescription } from '#comps/TxEventDescription'
import { TxStateDiff } from '#comps/TxStateDiff'
import { TxTraceFlamegraph } from '#comps/TxTraceFlamegraph'
import {
	findDeepestFailedNode,
	TxTraceTree,
	useTraceTree,
} from '#comps/TxTraceTree'
import { cx } from '#lib/css'
import {
	formatAbiValue,
	getInputType,
	getPlaceholder,
	isArrayType,
	parseInputValue,
} from '#lib/domain/contracts'
import {
	parseKnownEvents,
	preferredEventsFilter,
} from '#lib/domain/known-events'
import {
	countTransferBalanceChanges,
	normalizeTempoBatchCall,
	type TempoBatchCall,
	withoutFeeTransferLogs,
} from '#lib/domain/tempo-calls'
import {
	type CallDraft,
	emptyCall,
	parseExtraCalls,
	serializeExtraCalls,
} from '#lib/domain/simulate-calls'
import * as Tip20 from '#lib/domain/tip20'
import { formatTraceErrorArgs } from '#lib/domain/trace-error-args'
import { formatDecodedTraceErrorShort } from '#lib/domain/trace-errors'
import { HexFormatter, PriceFormatter } from '#lib/formatting'
import { useCopy, useKeyboardShortcut } from '#lib/hooks'
import { getFeeTokenForChain } from '#lib/fee-token'
import type { CallTrace, PrestateDiff } from '#lib/queries/trace'
import {
	mergePrestateDiffs,
	SimulationApiError,
	type SimulationAssetChange,
	type SimulationBatchCall,
	type SimulationCallResult,
	simulationExecutionQueryOptions,
	type SimulationExecutionResult,
	type SimulationInput,
	simulationPrestateQueryOptions,
	simulationTraceQueryOptions,
	useAutoloadAbi,
} from '#lib/queries'
import { getWagmiConfig } from '#wagmi.config'
import { zAddress, zHash } from '#lib/zod'
import ArrowRightIcon from '~icons/lucide/arrow-right'
import CheckIcon from '~icons/lucide/check'
import ChevronDownIcon from '~icons/lucide/chevron-down'
import CircleAlertIcon from '~icons/lucide/circle-alert'
import CopyIcon from '~icons/lucide/copy'
import LinkIcon from '~icons/lucide/link'
import LoaderIcon from '~icons/lucide/loader-circle'
import PlayIcon from '~icons/lucide/play'
import PlusIcon from '~icons/lucide/plus'
import RotateCcwIcon from '~icons/lucide/rotate-ccw'

const DEFAULT_GAS = '50000000'
const MAX_URL_CALLDATA_BYTES = 3_000
const EXAMPLE_TOKEN = '0x20c0000000000000000000000000000000000001'
const EXAMPLE_CALLDATA = '0x06fdde03'
const FAILING_EXAMPLE_CALLDATA =
	'0xa9059cbb0000000000000000000000000000000000000000000000000000000000000002ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'

const defaultSearch = {
	from: zeroAddress,
	data: '0x',
	value: '0',
	gas: DEFAULT_GAS,
	block: 'latest',
} as const

/**
 * Search params round-trip through the router, which parses `gas=2735514` back
 * out as a number. Accept both and normalise to a string, otherwise every
 * shared link with a non-default gas or value fails validation and takes the
 * whole route down.
 */
const DecimalSchema = z.pipe(
	z.union([z.string(), z.number()]).check((ctx) => {
		if (!/^\d+$/.test(String(ctx.value)))
			ctx.issues.push({
				code: 'custom',
				input: ctx.value,
				message: 'Expected a whole number',
			})
	}),
	z.transform((value) => String(value)),
)

const HexSchema = z.pipe(
	z.string().check((ctx) => {
		if (!OxHex.validate(ctx.value))
			ctx.issues.push({
				code: 'custom',
				input: ctx.value,
				message: 'Invalid hex value',
			})
	}),
	z.transform((value) => value as OxHex.Hex),
)

export const Route = createFileRoute('/_layout/simulate')({
	component: SimulatePage,
	validateSearch: z.object({
		from: z.prefault(zAddress(), defaultSearch.from),
		to: z.optional(zAddress()),
		data: z.prefault(HexSchema, defaultSearch.data),
		value: z.prefault(DecimalSchema, defaultSearch.value),
		gas: z.prefault(DecimalSchema, defaultSearch.gas),
		block: z.prefault(
			z.union([z.literal('latest'), zHash()]),
			defaultSearch.block,
		),
		tx: z.optional(zHash()),
		/**
		 * Calls after the first, as [[to, data, value], …].
		 *
		 * Must be declared as the array it is: the router JSON-parses search
		 * values, so a `string` schema rejects its own serialized output and
		 * takes the route down — the same trap `gas` fell into.
		 */
		calls: z.optional(z.array(z.array(z.string()))),
		originStatus: z.optional(z.enum(['success', 'reverted'])),
		originGas: z.optional(DecimalSchema),
		originEvents: z.optional(z.coerce.number()),
		originBalances: z.optional(z.coerce.number()),
	}),
	search: { middlewares: [stripSearchParams(defaultSearch)] },
	head: () => ({
		meta: [
			{ title: 'Simulate Transaction ⋅ Tempo Explorer' },
			{
				name: 'description',
				content:
					'Simulate a Tempo contract call and inspect its trace, revert reason, events, and state changes.',
			},
		],
	}),
})

type FormState = {
	from: string
	calls: CallDraft[]
	gas: string
	block: string
}

type OriginalMetrics = {
	status: 'success' | 'reverted'
	gasUsed: bigint
	events: number
	balances: number
}

function SimulatePage(): React.JSX.Element {
	const search = Route.useSearch()
	const navigate = useNavigate({ from: Route.fullPath })
	const chainId = getWagmiConfig().chains[0].id as SimulationInput['chainId']
	const connection = useConnection()
	// A bare /simulate starts empty. Prefilling a token address and a name()
	// selector looked like state the user had chosen, so the first task on
	// arriving was working out what was already there and deleting it.
	const [form, setForm] = React.useState<FormState>(() => ({
		from: search.to ? search.from : '',
		calls: search.to
			? [
					{ to: search.to, data: search.data, value: search.value },
					...parseExtraCalls(search.calls),
				]
			: [emptyCall],
		gas: search.gas,
		block: search.block,
	}))
	const [formError, setFormError] = React.useState<string | null>(null)
	const [loadHash, setLoadHash] = React.useState(search.tx ?? '')
	const [loadError, setLoadError] = React.useState<string | null>(null)
	const [loadingTransaction, setLoadingTransaction] = React.useState(false)
	const [original, setOriginal] = React.useState<OriginalMetrics | null>(() =>
		search.originStatus && search.originGas
			? {
					status: search.originStatus,
					gasUsed: BigInt(search.originGas),
					events: search.originEvents ?? 0,
					balances: search.originBalances ?? 0,
				}
			: null,
	)
	const initialInput = React.useMemo(
		() => toSimulationInput(search, chainId),
		[search, chainId],
	)
	const [runInput, setRunInput] = React.useState<SimulationInput | null>(
		initialInput,
	)
	// Collapsed once something has run — the call is an input, not the subject.
	const [editing, setEditing] = React.useState(!initialInput)

	React.useEffect(() => {
		if (
			!search.to &&
			!form.from &&
			connection.address &&
			OxAddress.validate(connection.address)
		)
			setForm((current) => ({ ...current, from: connection.address as string }))
	}, [connection.address, form.from, search.to])

	// Resolve the real block gas limit for the placeholder default. This has to
	// advance `runInput` alongside the form, otherwise the first render is
	// instantly "stale" against a value the user never touched — and the gas
	// shown in the form would not be the gas the simulation ran with.
	React.useEffect(() => {
		if (search.gas !== DEFAULT_GAS) return
		let cancelled = false
		void getBlock(getWagmiConfig())
			.then((block) => {
				if (cancelled) return
				const gas = block.gasLimit.toString()
				setForm((current) =>
					current.gas === DEFAULT_GAS ? { ...current, gas } : current,
				)
				setRunInput((current) =>
					current && current.gas === DEFAULT_GAS
						? { ...current, gas }
						: current,
				)
			})
			.catch(() => {})
		return () => {
			cancelled = true
		}
	}, [search.gas])

	const currentInput = React.useMemo(
		() => parseForm(form, chainId),
		[form, chainId],
	)
	const dirty = Boolean(
		runInput &&
			(!currentInput ||
				JSON.stringify(currentInput) !== JSON.stringify(runInput)),
	)

	const run = React.useCallback(() => {
		const input = parseForm(form, chainId)
		if (!input) {
			setFormError(
				'Enter valid from/to addresses, hexadecimal calldata, and numeric gas/value fields.',
			)
			return
		}
		setFormError(null)
		setRunInput(input)
		setEditing(false)
		const extras = serializeExtraCalls(form.calls)
		if (
			OxHex.size(input.data) > MAX_URL_CALLDATA_BYTES ||
			(extras ? JSON.stringify(extras).length : 0) > MAX_URL_CALLDATA_BYTES
		)
			return
		void navigate({
			search: {
				from: input.from,
				to: input.to,
				data: input.data,
				value: input.value,
				gas: input.gas,
				block: input.block,
				calls: extras,
				tx: search.tx,
				originStatus: original?.status,
				originGas: original?.gasUsed.toString(),
				originEvents: original?.events,
				originBalances: original?.balances,
			},
			replace: true,
			resetScroll: false,
		})
	}, [form, chainId, navigate, search.tx, original])

	const runExample = React.useCallback(
		(kind: 'read' | 'failing') => {
			const input: SimulationInput = {
				chainId,
				// Self-contained: the form is empty on arrival, so the examples
				// cannot borrow a sender from it.
				from: OxAddress.from(
					kind === 'failing'
						? '0x000000000000000000000000000000000000dEaD'
						: zeroAddress,
				),
				to: OxAddress.from(getFeeTokenForChain(chainId) ?? EXAMPLE_TOKEN),
				data: kind === 'failing' ? FAILING_EXAMPLE_CALLDATA : EXAMPLE_CALLDATA,
				value: '0',
				gas: form.gas,
				block: 'latest',
			}
			setForm({
				from: input.from,
				calls: [{ to: input.to, data: input.data, value: input.value }],
				gas: input.gas,
				block: input.block,
			})
			setOriginal(null)
			setFormError(null)
			setRunInput(input)
			setEditing(false)
			void navigate({
				search: {
					from: input.from,
					to: input.to,
					data: input.data,
					value: input.value,
					gas: input.gas,
					block: input.block,
				},
				replace: true,
				resetScroll: false,
			})
		},
		[chainId, form.gas, navigate],
	)

	useKeyboardShortcut({ 'mod+enter': run })

	const loadTransaction = React.useCallback(
		async (hashValue: string) => {
			if (!OxHex.validate(hashValue) || OxHex.size(hashValue) !== 32) {
				setLoadError('Enter a valid transaction hash.')
				return
			}
			setLoadError(null)
			setLoadingTransaction(true)
			try {
				const config = getWagmiConfig()
				const hash = hashValue as OxHex.Hex
				const [transaction, receipt, txData] = await Promise.all([
					getTransaction(config, { hash }),
					getTransactionReceipt(config, { hash }),
					config
						.getClient()
						.request({ method: 'eth_getTransactionByHash', params: [hash] }),
				])
				const parent = await getBlock(config, {
					blockNumber:
						transaction.blockNumber > 0n ? transaction.blockNumber - 1n : 0n,
				})
				const tempoCalls =
					txData &&
					typeof txData === 'object' &&
					'calls' in txData &&
					Array.isArray(txData.calls)
						? txData.calls
								.map((call) => normalizeTempoBatchCall(call))
								.filter((call): call is TempoBatchCall => call !== null)
						: []
				// Every call of a batch lands in the form, so all of them are
				// visible and editable rather than just the first.
				const drafts: CallDraft[] = tempoCalls.length
					? tempoCalls.map((call) => ({
							to: call.to,
							data: call.data,
							value: call.value.toString(),
						}))
					: [
							{
								to: transaction.to ?? '',
								data: transaction.input ?? '0x',
								value: transaction.value.toString(),
							},
						]
				if (drafts.some((call) => !call.to))
					throw new Error('Contract creation simulation is not supported yet.')
				const comparableLogs = withoutFeeTransferLogs(receipt.logs)
				const nextForm: FormState = {
					from: transaction.from,
					calls: drafts,
					gas: transaction.gas.toString(),
					block: parent.hash,
				}
				setForm(nextForm)
				setOriginal(
					tempoCalls.length > 1
						? null
						: {
								status: receipt.status,
								gasUsed: receipt.gasUsed,
								events: comparableLogs.length,
								balances: countTransferBalanceChanges(comparableLogs),
							},
				)

				// Loading a transaction is a request to see its result, so run it
				// rather than leaving the user staring at a filled-in form.
				const loaded = parseForm(nextForm, chainId)
				setRunInput(loaded)
				setEditing(!loaded)
				void navigate({
					search: (previous) => ({ ...previous, tx: hash }),
					replace: true,
					resetScroll: false,
				})
			} catch (error) {
				setLoadError(
					error instanceof Error ? error.message : 'Failed to load transaction',
				)
			} finally {
				setLoadingTransaction(false)
			}
		},
		[navigate, chainId],
	)

	const autoLoaded = React.useRef(false)
	React.useEffect(() => {
		if (!search.tx || search.to || autoLoaded.current) return
		autoLoaded.current = true
		void loadTransaction(search.tx)
	}, [search.tx, search.to, loadTransaction])

	return (
		<div className="w-full px-4 pt-12 pb-16 min-[800px]:pt-20 min-[1240px]:max-w-[1180px]">
			<div className="mb-[18px] flex flex-col gap-[6px]">
				<h1 className="text-[20px] font-medium text-primary">Simulate</h1>
				<p className="max-w-[680px] text-[13px] text-tertiary">
					Run a call against current or pinned chain state without signing it.
				</p>
			</div>

			<div className="flex flex-col gap-[14px]">
				<CallBar
					form={form}
					setForm={setForm}
					editing={editing}
					setEditing={setEditing}
					dirty={dirty}
					hasRun={Boolean(runInput)}
					formError={formError}
					loadHash={loadHash}
					setLoadHash={setLoadHash}
					loadError={loadError}
					loadingTransaction={loadingTransaction}
					onLoad={() => void loadTransaction(loadHash)}
					onRun={run}
				/>

				<SimulationResults
					input={runInput}
					dirty={dirty}
					original={original}
					onExample={runExample}
				/>
			</div>
		</div>
	)
}

/**
 * Collapsed, the call reads as one sentence. Expanded, it is the full form.
 * Keeping it one control means the result stays the subject of the page.
 */
function CallBar(props: {
	form: FormState
	setForm: React.Dispatch<React.SetStateAction<FormState>>
	editing: boolean
	setEditing: (value: boolean) => void
	dirty: boolean
	hasRun: boolean
	formError: string | null
	loadHash: string
	setLoadHash: (value: string) => void
	loadError: string | null
	loadingTransaction: boolean
	onLoad: () => void
	onRun: () => void
}): React.JSX.Element {
	const { form, setForm, editing } = props
	const loadTransactionId = React.useId()
	const shareCopy = useCopy({ timeout: 1_500 })
	const firstTo = form.calls[0]?.to ?? ''
	const address = OxAddress.validate(firstTo)
		? (firstTo as OxAddress.Address)
		: undefined
	const { data: abi } = useAutoloadAbi({ address, enabled: Boolean(address) })

	const summary = React.useMemo(
		() => describeCall(form, abi as Abi | undefined),
		[form, abi],
	)

	const updateCall = React.useCallback(
		(index: number, patch: Partial<CallDraft>) =>
			setForm((current) => ({
				...current,
				calls: current.calls.map((call, i) =>
					i === index ? { ...call, ...patch } : call,
				),
			})),
		[setForm],
	)

	return (
		<section className="overflow-hidden rounded-[10px] border border-card-border bg-card-header shadow-[0px_4px_44px_rgba(0,0,0,0.05)]">
			<div className="flex flex-wrap items-center gap-[10px] px-[14px] py-[10px]">
				<button
					type="button"
					onClick={() => props.setEditing(!editing)}
					className="flex min-w-0 flex-1 items-center gap-[8px] text-left cursor-pointer press-down"
					title={editing ? 'Collapse call' : 'Edit call'}
				>
					<ChevronDownIcon
						className={cx(
							'size-[13px] shrink-0 text-tertiary transition-transform',
							!editing && '-rotate-90',
						)}
					/>
					<span className="min-w-0 truncate font-mono text-[12px] text-secondary">
						{summary}
					</span>
				</button>
				<div className="flex shrink-0 items-center gap-[6px]">
					{props.hasRun && (
						<button
							type="button"
							onClick={() =>
								shareCopy.copy(
									typeof window === 'undefined' ? '' : window.location.href,
								)
							}
							className="flex h-[30px] items-center gap-[5px] rounded-[7px] border border-card-border px-[9px] text-[12px] text-secondary cursor-pointer press-down hover:text-primary"
							title="Copy a link to this simulation"
						>
							<LinkIcon className="size-[12px]" />
							{shareCopy.notifying ? 'Copied' : 'Share'}
						</button>
					)}
					<button
						type="button"
						onClick={props.onRun}
						className={cx(
							'flex h-[30px] items-center gap-[7px] rounded-[7px] px-[12px] text-[12px] font-medium cursor-pointer press-down',
							props.dirty || !props.hasRun
								? 'bg-accent text-accent-contrast'
								: 'border border-card-border text-secondary hover:text-primary',
						)}
					>
						<PlayIcon className="size-[12px]" />
						{props.dirty && props.hasRun ? 'Re-run' : 'Run'}
						<span className="text-[10px] opacity-70">⌘↵</span>
					</button>
				</div>
			</div>

			{editing && (
				<div className="flex flex-col gap-[14px] border-t border-card-border bg-card px-[16px] py-[16px]">
					<div className="flex flex-col gap-[6px]">
						<label
							className="text-[11px] text-tertiary"
							htmlFor={loadTransactionId}
						>
							Load an existing transaction
						</label>
						<div className="flex gap-[6px]">
							<input
								id={loadTransactionId}
								value={props.loadHash}
								onChange={(event) => props.setLoadHash(event.target.value)}
								placeholder="0x transaction hash"
								className={cx(inputClassName, 'max-w-[520px]')}
							/>
							<button
								type="button"
								onClick={props.onLoad}
								disabled={props.loadingTransaction}
								className="rounded-[6px] bg-distinct px-[10px] text-[12px] text-primary cursor-pointer press-down disabled:opacity-50"
							>
								{props.loadingTransaction ? 'Loading…' : 'Load'}
							</button>
						</div>
						{props.loadError && (
							<span className="text-[11px] text-negative">
								{props.loadError}
							</span>
						)}
					</div>

					<Field label="From">
						<input
							value={form.from}
							onChange={(event) =>
								setForm((current) => ({
									...current,
									from: event.target.value,
								}))
							}
							placeholder="0x sender — defaults to the zero address"
							className={cx(inputClassName, 'max-w-[520px]')}
						/>
					</Field>

					<div className="flex flex-col gap-[10px]">
						{form.calls.map((call, index) => (
							<CallEditor
								key={index}
								call={call}
								index={index}
								total={form.calls.length}
								onChange={(patch) => updateCall(index, patch)}
								onRemove={() =>
									setForm((current) => ({
										...current,
										calls: current.calls.filter((_, i) => i !== index),
									}))
								}
							/>
						))}
						<button
							type="button"
							onClick={() =>
								setForm((current) => ({
									...current,
									calls: [...current.calls, emptyCall],
								}))
							}
							className="flex w-fit items-center gap-[5px] rounded-[6px] border border-dashed border-card-border px-[10px] py-[6px] text-[11px] text-secondary cursor-pointer press-down hover:border-accent hover:text-primary"
						>
							<PlusIcon className="size-[12px]" />
							Add a call
						</button>
						{form.calls.length > 1 && (
							<p className="text-[11px] text-tertiary">
								Calls run in order against each other{'’'}s state, the way a
								Tempo batch transaction executes.
							</p>
						)}
					</div>

					<div className="grid gap-[12px] min-[720px]:grid-cols-2">
						<Field label="Gas limit">
							<input
								value={form.gas}
								onChange={(event) =>
									setForm((current) => ({
										...current,
										gas: event.target.value,
									}))
								}
								className={inputClassName}
							/>
						</Field>
						<Field label="Block">
							<input
								value={form.block}
								onChange={(event) =>
									setForm((current) => ({
										...current,
										block: event.target.value,
									}))
								}
								placeholder="latest or block hash"
								className={inputClassName}
							/>
						</Field>
					</div>

					{props.formError && (
						<div className="text-[12px] text-negative">{props.formError}</div>
					)}
				</div>
			)}
		</section>
	)
}

/**
 * A single call in the list: target, calldata, value. Numbered only once there
 * is more than one, so a plain single call keeps its uncluttered form.
 */
function CallEditor(props: {
	call: CallDraft
	index: number
	total: number
	onChange: (patch: Partial<CallDraft>) => void
	onRemove: () => void
}): React.JSX.Element {
	const { call, index, total } = props
	const address = OxAddress.validate(call.to)
		? (call.to as OxAddress.Address)
		: undefined
	const { data: abi } = useAutoloadAbi({ address, enabled: Boolean(address) })
	const isList = total > 1

	return (
		<div
			className={cx(
				'flex flex-col gap-[12px]',
				isList &&
					'rounded-[8px] border border-card-border bg-distinct/40 p-[12px]',
			)}
		>
			{isList && (
				<div className="flex items-center gap-[8px]">
					<span className="flex size-[18px] shrink-0 items-center justify-center rounded-full bg-distinct text-[10px] font-medium text-secondary">
						{index + 1}
					</span>
					<span className="text-[11px] text-tertiary">
						Call {index + 1} of {total}
					</span>
					<button
						type="button"
						onClick={props.onRemove}
						className="ml-auto text-[11px] text-tertiary cursor-pointer press-down hover:text-negative"
						title="Remove this call"
					>
						Remove
					</button>
				</div>
			)}

			<div className="grid gap-[12px] min-[720px]:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
				<Field label="To">
					<input
						value={call.to}
						onChange={(event) => props.onChange({ to: event.target.value })}
						placeholder="0x contract address"
						className={inputClassName}
					/>
				</Field>
				<Field label="Value">
					<input
						value={call.value}
						onChange={(event) => props.onChange({ value: event.target.value })}
						className={inputClassName}
					/>
				</Field>
			</div>

			<CalldataControl
				abi={abi as Abi | undefined}
				data={call.data}
				onChange={(data) => props.onChange({ data })}
			/>
		</div>
	)
}

/**
 * One value, two representations, one explicit toggle. The previous split
 * between a function picker and a separate calldata box let the two disagree
 * silently — the form could show one call while running another.
 */
function CalldataControl(props: {
	abi: Abi | undefined
	data: string
	onChange: (data: string) => void
}): React.JSX.Element {
	const { abi, data, onChange } = props
	// Every function, not just the writes: "what does this return" is a
	// first-class reason to simulate, and read calls are the cheapest way in.
	const functions = React.useMemo(
		() =>
			(abi ?? []).filter(
				(item): item is AbiFunction => item.type === 'function',
			),
		[abi],
	)
	const [mode, setMode] = React.useState<'decoded' | 'hex'>('decoded')
	const [selector, setSelector] = React.useState('')
	const [values, setValues] = React.useState<string[]>([])
	const [mismatch, setMismatch] = React.useState(false)

	const selected = functions.find((fn) => getFunctionSelector(fn) === selector)

	// Keep the decoded view in step with hex edits, and say so when it can't.
	React.useEffect(() => {
		if (!abi || !OxHex.validate(data) || data.length < 10) {
			setMismatch(false)
			return
		}
		try {
			const decoded = decodeFunctionData({ abi, data: data as OxHex.Hex })
			setSelector(OxHex.slice(data as OxHex.Hex, 0, 4))
			setValues((decoded.args ?? []).map((value) => inputValueToString(value)))
			setMismatch(false)
		} catch {
			setMismatch(true)
		}
	}, [abi, data])

	const encode = React.useCallback(
		(fn: AbiFunction, nextValues: string[]) => {
			try {
				const args = fn.inputs.map((input, index) =>
					parseInputValue(nextValues[index] ?? '', input.type),
				)
				onChange(encodeFunctionData({ abi: [fn], functionName: fn.name, args }))
				setMismatch(false)
			} catch {
				// Incomplete input while typing — leave the hex at its last good value.
			}
		},
		[onChange],
	)

	const canDecode = functions.length > 0
	const showDecoded = canDecode && mode === 'decoded' && !mismatch
	const byteLength = OxHex.validate(data) ? OxHex.size(data) : 0

	return (
		<div className="flex flex-col gap-[8px]">
			<div className="flex items-center justify-between gap-[8px]">
				<span className="text-[11px] text-tertiary">Calldata</span>
				{canDecode && (
					<div className="flex items-center rounded-[6px] border border-card-border p-[2px] text-[11px]">
						{(['decoded', 'hex'] as const).map((value) => (
							<button
								key={value}
								type="button"
								onClick={() => setMode(value)}
								className={cx(
									'rounded-[4px] px-[8px] py-[2px] cursor-pointer press-down capitalize',
									mode === value
										? 'bg-distinct text-primary'
										: 'text-tertiary hover:text-secondary',
								)}
							>
								{value}
							</button>
						))}
					</div>
				)}
			</div>

			{mismatch && mode === 'decoded' && (
				<div className="rounded-[6px] border border-warning/40 bg-warning-background px-[10px] py-[7px] text-[11px] text-secondary">
					This calldata doesn{'’'}t match any function in the contract
					{'’'}s ABI — showing hex.
				</div>
			)}

			{showDecoded ? (
				<div className="flex flex-col gap-[10px] rounded-[6px] border border-card-border bg-distinct px-[10px] py-[10px]">
					<select
						value={selector}
						onChange={(event) => {
							const next = event.target.value
							setSelector(next)
							const fn = functions.find(
								(candidate) => getFunctionSelector(candidate) === next,
							)
							if (!fn) return
							const blank = fn.inputs.map(() => '')
							setValues(blank)
							if (fn.inputs.length === 0) encode(fn, blank)
						}}
						className={cx(inputClassName, 'bg-card')}
					>
						<option value="">Select a function…</option>
						{functions.map((fn) => (
							<option
								key={getFunctionSelector(fn)}
								value={getFunctionSelector(fn)}
							>
								{fn.name || getFunctionSelector(fn)}(
								{fn.inputs.map((input) => input.type).join(', ')})
							</option>
						))}
					</select>

					{selected?.inputs.map((input, index) => (
						<div
							key={`${input.name}-${input.type}-${index}`}
							className="grid items-center gap-[8px] min-[720px]:grid-cols-[140px_minmax(0,1fr)]"
						>
							<span className="text-[11px] text-tertiary">
								{input.name || `arg ${index}`}
								<span className="ml-[5px] text-quaternary">{input.type}</span>
							</span>
							{getInputType(input.type) === 'textarea' ? (
								<textarea
									value={values[index] ?? ''}
									onChange={(event) => {
										const next = values.map((value, itemIndex) =>
											itemIndex === index ? event.target.value : value,
										)
										setValues(next)
										encode(selected, next)
									}}
									placeholder={getPlaceholder(input)}
									className={cx(
										inputClassName,
										'min-h-[64px] resize-y bg-card',
									)}
								/>
							) : (
								<input
									type={getInputType(input.type)}
									checked={
										getInputType(input.type) === 'checkbox'
											? values[index] === 'true'
											: undefined
									}
									value={values[index] ?? ''}
									onChange={(event) => {
										const value =
											event.target.type === 'checkbox'
												? String(event.target.checked)
												: event.target.value
										const next = values.map((current, itemIndex) =>
											itemIndex === index ? value : current,
										)
										setValues(next)
										encode(selected, next)
									}}
									placeholder={getPlaceholder(input)}
									className={cx(inputClassName, 'bg-card')}
								/>
							)}
						</div>
					))}

					<HexRow data={data} byteLength={byteLength} />
				</div>
			) : (
				<>
					<textarea
						value={data}
						onChange={(event) => onChange(event.target.value)}
						className={cx(
							inputClassName,
							'min-h-[84px] resize-y break-all',
							!OxHex.validate(data) && 'border-negative',
						)}
					/>
					{byteLength > 0 && (
						<span className="text-[11px] text-tertiary">
							{byteLength} bytes
							{byteLength > MAX_URL_CALLDATA_BYTES &&
								' · too long for a shareable URL'}
						</span>
					)}
				</>
			)}
		</div>
	)
}

function HexRow(props: {
	data: string
	byteLength: number
}): React.JSX.Element | null {
	const copy = useCopy({ timeout: 1_500 })
	if (!props.data || props.data === '0x') return null
	return (
		<div className="flex items-center gap-[8px] border-t border-dashed border-card-border pt-[8px] text-[11px]">
			<span className="min-w-0 flex-1 truncate font-mono text-tertiary">
				{props.data}
			</span>
			<span className="shrink-0 text-quaternary">{props.byteLength} bytes</span>
			<button
				type="button"
				onClick={() => copy.copy(props.data)}
				className="shrink-0 text-tertiary cursor-pointer press-down hover:text-primary"
				title="Copy calldata"
			>
				{copy.notifying ? (
					<CheckIcon className="size-[12px]" />
				) : (
					<CopyIcon className="size-[12px]" />
				)}
			</button>
		</div>
	)
}

function SimulationResults(props: {
	input: SimulationInput | null
	dirty: boolean
	original: OriginalMetrics | null
	onExample: (kind: 'read' | 'failing') => void
}): React.JSX.Element {
	const fallback = emptySimulationInput()
	const input = props.input ?? fallback
	const enabled = Boolean(props.input)
	const isBatch = (input.calls?.length ?? 0) > 1
	// Batches trace through `debug_traceCallMany`, which runs the bundle in
	// order against shared state — so every call gets a real tree, not just
	// the first one.
	const traceQuery = useQuery({
		...simulationTraceQueryOptions(input),
		enabled,
	})
	const prestateQuery = useQuery({
		...simulationPrestateQueryOptions(input),
		enabled,
	})
	const traces = traceQuery.data ?? []
	const prestate = React.useMemo(
		() => mergePrestateDiffs(prestateQuery.data ?? []),
		[prestateQuery.data],
	)
	const executionQuery = useQuery({
		...simulationExecutionQueryOptions(input),
		enabled,
	})
	// The primary tree: the single call, or the first call of a batch.
	const tree = useTraceTree(traces[0] ?? null)
	// When a later call in a batch is the one that reverted, its trace holds the
	// reason — call 0's does not.
	const failedCallIndex =
		executionQuery.data?.calls.findIndex(
			(call) => call.status === 'reverted',
		) ?? -1
	const failedCallTree = useTraceTree(
		failedCallIndex > 0 ? (traces[failedCallIndex] ?? null) : null,
	)
	const metadataAddresses = React.useMemo(
		() => [
			input.to,
			...(executionQuery.data?.assetChanges.map((change) => change.token) ??
				[]),
		],
		[input.to, executionQuery.data?.assetChanges],
	)
	const metadataQuery = useQuery(
		queryOptions({
			queryKey: ['simulation-token-metadata', metadataAddresses],
			queryFn: () => Tip20.metadataForTokens(metadataAddresses),
			enabled: metadataAddresses.some(Tip20.isTip20Address),
			staleTime: Number.POSITIVE_INFINITY,
		}),
	)
	const tokenMetadata = React.useMemo(() => {
		const entries: Array<[string, { symbol?: string; decimals?: number }]> = []
		for (const token of metadataAddresses) {
			const metadata = metadataQuery.data?.(token)
			if (!metadata) continue
			const value = { symbol: metadata.symbol, decimals: metadata.decimals }
			// Keyed both ways: consumers look up by checksummed and lowercase.
			entries.push([token, value], [token.toLowerCase(), value])
		}
		return Object.fromEntries(entries)
	}, [metadataAddresses, metadataQuery.data])
	const knownEvents = React.useMemo(
		() =>
			executionQuery.data
				? parseKnownEvents(executionQuery.data.receipt, {
						transaction: { to: input.to, input: input.data },
						getTokenMetadata: metadataQuery.data,
					})
				: [],
		[executionQuery.data, input, metadataQuery.data],
	)
	const failedNode = findDeepestFailedNode(failedCallTree ?? tree)

	if (!props.input) return <SimulationEmptyState onExample={props.onExample} />

	// The three panels share one endpoint and one node, so anything wrong with
	// the request — bad params, rate limit, timeout, node down — fails all three
	// identically. Repeating it four times says nothing extra.
	const panelErrors = [
		...(isBatch ? [] : [traceQuery.error, prestateQuery.error]),
		executionQuery.error,
	].filter((error): error is Error => Boolean(error))
	if (panelErrors.length === (isBatch ? 1 : 3))
		return (
			<SimulationFailure
				errors={panelErrors}
				onRetry={() => {
					void traceQuery.refetch()
					void prestateQuery.refetch()
					void executionQuery.refetch()
				}}
			/>
		)

	const frameCount = tree?.subtreeSize ?? 0
	// Count what actually renders, not raw prestate keys — the diff drops
	// accounts with no real change and the caller's simulation-only nonce tick.
	const stateAccounts = prestate
		? TxStateDiff.buildData(prestate, [], tokenMetadata, {
				omitNonceOnlyFor: input.from,
			}).accounts.length
		: 0

	const sections: Sections.Section[] = [
		{
			title: 'Calls',
			itemsLabel: 'calls',
			totalItems: executionQuery.data?.calls.length ?? 0,
			autoCollapse: false,
			visible: isBatch,
			content: executionQuery.isPending ? (
				<PanelSkeleton rows={3} />
			) : (
				<BatchCalls
					calls={executionQuery.data?.calls ?? []}
					traces={traces}
					prestates={prestateQuery.data ?? []}
				/>
			),
		},
		{
			title: 'Trace',
			itemsLabel: 'frames',
			totalItems: frameCount,
			autoCollapse: false,
			visible: !isBatch,
			content: traceQuery.isPending ? (
				<PanelSkeleton rows={7} />
			) : traceQuery.error ? (
				<PanelError title="Call trace unavailable" error={traceQuery.error} />
			) : (
				<div className="flex flex-col">
					<TxTraceTree trace={traces[0] ?? null} tree={tree} label={null} />
					<TxTraceFlamegraph tree={tree} prestate={prestate} />
				</div>
			),
		},
		{
			title: 'State changes',
			itemsLabel: 'accounts',
			totalItems: stateAccounts,
			autoCollapse: false,
			visible:
				prestateQuery.isPending ||
				Boolean(prestateQuery.error) ||
				stateAccounts > 0,
			content: prestateQuery.isPending ? (
				<PanelSkeleton rows={5} />
			) : prestateQuery.error ? (
				<PanelError
					title="State diff unavailable"
					error={prestateQuery.error}
				/>
			) : (
				<TxStateDiff
					prestate={prestate}
					trace={traces[0] ?? null}
					receipt={{ from: input.from, to: input.to }}
					logs={executionQuery.data?.logs}
					tokenMetadata={tokenMetadata}
					label={null}
					omitSenderNonceFor={input.from}
				/>
			),
		},
		{
			title: 'Balance changes',
			itemsLabel: 'changes',
			totalItems: executionQuery.data?.assetChanges.length ?? 0,
			autoCollapse: false,
			visible: (executionQuery.data?.assetChanges.length ?? 0) > 0,
			content: (
				<SimulationBalances
					assetChanges={executionQuery.data?.assetChanges ?? []}
					tokenMetadata={tokenMetadata}
				/>
			),
		},
		{
			title: 'Events',
			itemsLabel: 'events',
			totalItems: executionQuery.data?.logs.length ?? 0,
			autoCollapse: false,
			visible:
				executionQuery.isPending ||
				Boolean(executionQuery.error) ||
				(executionQuery.data?.logs.length ?? 0) > 0,
			content: executionQuery.isPending ? (
				<PanelSkeleton rows={4} />
			) : executionQuery.error ? (
				<PanelError
					title="Execution result unavailable"
					error={executionQuery.error}
				/>
			) : (
				<SimulationEvents
					logs={executionQuery.data?.logs ?? []}
					knownEvents={knownEvents}
				/>
			),
		},
	]

	return (
		<div
			className={cx(
				'flex min-w-0 flex-col gap-[14px] transition-opacity',
				props.dirty && 'opacity-50',
			)}
		>
			<SimulationVerdict
				execution={executionQuery.data}
				error={executionQuery.error}
				tree={tree}
				failedNode={failedNode}
				knownEvents={knownEvents}
				original={props.original}
				input={input}
				tokenMetadata={tokenMetadata}
			/>

			<Sections mode="stacked" sections={sections} />
		</div>
	)
}

function SimulationVerdict(props: {
	execution: SimulationExecutionResult | undefined
	error: Error | null
	tree: TxTraceTree.Node | null
	failedNode: TxTraceTree.Node | null
	knownEvents: ReturnType<typeof parseKnownEvents>
	original: OriginalMetrics | null
	input: SimulationInput
	tokenMetadata: Record<string, { symbol?: string; decimals?: number }>
}): React.JSX.Element {
	const { execution, tree, failedNode } = props
	if (props.error)
		return <PanelError title="Simulation unavailable" error={props.error} />
	if (!execution)
		return (
			<div className="rounded-[10px] border border-card-border bg-card px-[18px] py-[18px]">
				<div className="flex items-center gap-[8px] text-[13px] text-tertiary">
					<LoaderIcon className="size-[14px] animate-spin" /> Simulating
					execution…
				</div>
			</div>
		)

	const succeeded = execution.status === 'success'
	const errorArgs = failedNode?.decodedError
		? formatTraceErrorArgs({
				error: failedNode.decodedError,
				contract: failedNode.trace.to,
				tokenMetadata: props.tokenMetadata,
			})
		: []

	return (
		<div
			className={cx(
				'overflow-hidden rounded-[10px] border bg-card shadow-[0px_4px_44px_rgba(0,0,0,0.05)]',
				succeeded ? 'border-card-border' : 'border-negative/40',
			)}
		>
			<div className="flex items-start gap-[12px] px-[18px] py-[16px]">
				<div
					className={cx(
						'mt-[1px] flex size-[20px] shrink-0 items-center justify-center rounded-full',
						succeeded
							? 'bg-base-content-positive/15 text-base-content-positive'
							: 'bg-negative/15 text-negative',
					)}
				>
					{succeeded ? (
						<CheckIcon className="size-[13px]" />
					) : (
						<CircleAlertIcon className="size-[13px]" />
					)}
				</div>
				<div className="min-w-0 flex-1">
					<div className="flex flex-wrap items-center justify-between gap-[8px]">
						<h2
							className={cx(
								'text-[14px] font-medium',
								succeeded ? 'text-primary' : 'text-negative',
							)}
						>
							{verdictHeadline(execution)}
						</h2>
						<span
							className="font-mono text-[11px] text-tertiary"
							title="Gas used by the simulated call. No fee is charged or synthesized."
						>
							{execution.gasUsed.toLocaleString()} gas estimated
						</span>
					</div>

					{execution.calls.length > 1 && succeeded ? (
						<BatchDetail execution={execution} />
					) : succeeded ? (
						<SuccessDetail
							tree={tree}
							knownEvents={props.knownEvents}
							execution={execution}
						/>
					) : (
						<FailureDetail
							failedNode={failedNode}
							errorArgs={errorArgs}
							returnData={execution.returnData}
						/>
					)}

					<VerdictFooter
						input={props.input}
						blockNumber={execution.blockNumber}
					/>
				</div>
			</div>
			{props.original && (
				<SimulationDiff original={props.original} execution={execution} />
			)}
		</div>
	)
}

function verdictHeadline(execution: SimulationExecutionResult): string {
	if (execution.calls.length <= 1)
		return execution.status === 'success' ? 'Succeeded' : 'Reverted'
	const failed = execution.calls.find((call) => call.status === 'reverted')
	if (!failed) return `All ${execution.calls.length} calls succeeded`
	return `Reverted in call ${failed.index + 1} of ${execution.calls.length}`
}

/**
 * A batch has no single representative event — picking one out of twenty-six
 * is arbitrary and misleading. Summarise by volume and let the sections below
 * carry the detail.
 */
function BatchDetail(props: {
	execution: SimulationExecutionResult
}): React.JSX.Element {
	const { execution } = props
	const parts = [
		`${execution.calls.length} calls in order`,
		`${execution.logs.length} event${execution.logs.length === 1 ? '' : 's'}`,
	]
	if (execution.assetChanges.length > 0)
		parts.push(
			`${execution.assetChanges.length} balance change${execution.assetChanges.length === 1 ? '' : 's'}`,
		)

	return (
		<p className="mt-[5px] text-[13px] text-secondary">{parts.join(' · ')}</p>
	)
}

function SuccessDetail(props: {
	tree: TxTraceTree.Node | null
	knownEvents: ReturnType<typeof parseKnownEvents>
	execution: SimulationExecutionResult
}): React.JSX.Element {
	const { tree, knownEvents, execution } = props
	const event = knownEvents.find(preferredEventsFilter) ?? knownEvents[0]
	const call = tree ? callLabel(tree) : undefined
	const returned = tree?.decodedOutput

	// A read call's return value is the entire answer — lead with it.
	if (returned)
		return (
			<p className="mt-[5px] font-mono text-[13px] text-secondary">
				<span className="text-tertiary">{call} returned </span>
				<span className="text-primary">{returned}</span>
			</p>
		)

	if (event)
		return (
			<div className="mt-[5px] text-[13px] text-secondary">
				<TxEventDescription event={event} />
			</div>
		)

	return (
		<p className="mt-[5px] text-[13px] text-tertiary">
			{call ? `${call} completed. ` : ''}
			{execution.logs.length === 0
				? 'No events emitted.'
				: `${execution.logs.length} event${execution.logs.length === 1 ? '' : 's'} emitted.`}
		</p>
	)
}

function FailureDetail(props: {
	failedNode: TxTraceTree.Node | null
	errorArgs: ReturnType<typeof formatTraceErrorArgs>
	returnData: string
}): React.JSX.Element {
	const { failedNode, errorArgs } = props
	const decoded = failedNode?.decodedError
	const call = failedNode ? callLabel(failedNode) : undefined
	const errorName = decoded
		? decoded.undecoded
			? undefined
			: formatDecodedTraceErrorShort(decoded)
		: undefined

	return (
		<div className="mt-[6px] flex flex-col gap-[8px]">
			<p className="font-mono text-[13px] text-secondary">
				{call ? `${call} ` : ''}
				<span className="text-tertiary">reverted</span>
			</p>

			{errorName ? (
				<div className="flex flex-col gap-[5px] rounded-[7px] border border-negative/25 bg-negative/5 px-[12px] py-[10px]">
					<span className="font-mono text-[13px] font-medium text-negative">
						{errorName}
					</span>
					{errorArgs.length > 0 && (
						<dl className="mt-[2px] grid gap-x-[14px] gap-y-[3px] font-mono text-[12px] min-[560px]:grid-cols-[max-content_minmax(0,1fr)]">
							{errorArgs.map((arg) => (
								<React.Fragment key={arg.label}>
									<dt className="text-tertiary">{arg.label}</dt>
									<dd
										className="min-w-0 break-all text-primary"
										title={arg.title}
									>
										{arg.value}
										{arg.note && (
											<span className="ml-[8px] text-tertiary">{arg.note}</span>
										)}
									</dd>
								</React.Fragment>
							))}
						</dl>
					)}
				</div>
			) : (
				<div className="rounded-[7px] border border-negative/25 bg-negative/5 px-[12px] py-[10px] font-mono text-[12px] break-all text-secondary">
					{decoded?.raw ?? props.returnData ?? 'No revert data returned.'}
				</div>
			)}

			{failedNode?.hasFailure && failedNode.frameIndex > 0 && (
				<a
					href={`#${failedNode.id}`}
					className="inline-flex w-fit items-center gap-[4px] text-[11px] text-accent hover:underline"
				>
					<ArrowRightIcon className="size-[11px]" />
					Jump to {call ?? 'the failing frame'}
				</a>
			)}
		</div>
	)
}

function VerdictFooter(props: {
	input: SimulationInput
	blockNumber: bigint
}): React.JSX.Element {
	const network =
		props.input.chainId === 4217
			? 'mainnet'
			: props.input.chainId === 42431
				? 'moderato'
				: 'devnet'
	return (
		<p className="mt-[10px] text-[11px] text-tertiary">
			{network} ·{' '}
			{props.input.block === 'latest'
				? `after the latest block${props.blockNumber > 0n ? ` (${props.blockNumber.toLocaleString()})` : ''}`
				: `after block ${props.blockNumber.toLocaleString()} — later transactions in the next block are not applied`}
		</p>
	)
}

function SimulationDiff(props: {
	original: OriginalMetrics
	execution: {
		status: 'success' | 'reverted'
		gasUsed: bigint
		logs: Log[]
		assetChanges: Array<unknown>
	}
}): React.JSX.Element {
	const gasDiff = props.execution.gasUsed - props.original.gasUsed
	const eventDiff = props.execution.logs.length - props.original.events
	const balanceDiff =
		props.execution.assetChanges.length - props.original.balances
	const statusChanged = props.execution.status !== props.original.status
	return (
		<div className="flex flex-wrap items-center gap-[6px] border-t border-dashed border-card-border px-[18px] py-[10px] text-[11px]">
			<span className="mr-[4px] text-tertiary">vs. on-chain</span>
			<DiffChip label="gas" value={signed(gasDiff)} />
			{statusChanged && (
				<DiffChip
					label="status"
					value={`${props.original.status} → ${props.execution.status}`}
					tone="negative"
				/>
			)}
			<DiffChip label="events" value={signed(BigInt(eventDiff))} />
			<DiffChip label="balances" value={signed(BigInt(balanceDiff))} />
		</div>
	)
}

function DiffChip(props: {
	label: string
	value: string
	tone?: 'negative'
}): React.JSX.Element {
	return (
		<span
			className={cx(
				'rounded-full px-[8px] py-[3px] font-mono',
				props.tone === 'negative'
					? 'bg-negative/10 text-negative'
					: 'bg-distinct text-secondary',
			)}
		>
			{props.label} {props.value}
		</span>
	)
}

function SimulationEvents(props: {
	logs: Log[]
	knownEvents: ReturnType<typeof parseKnownEvents>
}): React.JSX.Element {
	if (props.logs.length === 0)
		return (
			<div className="px-[18px] py-[24px] text-center text-[13px] text-tertiary">
				No events emitted.
			</div>
		)

	return (
		<div className="flex flex-col divide-y divide-card-border">
			{props.knownEvents.map((event, index) => (
				<div
					key={`${event.type}-${index}`}
					className="px-[18px] py-[12px] text-[13px]"
				>
					<TxEventDescription event={event} />
				</div>
			))}
			{props.knownEvents.length === 0 && (
				<div className="px-[18px] py-[12px] text-[12px] text-tertiary">
					{props.logs.length} raw event{props.logs.length === 1 ? '' : 's'}{' '}
					emitted.
				</div>
			)}
		</div>
	)
}

/**
 * Net token movement per account. Amounts are formatted with the token's
 * decimals — a raw integer here reads as a wildly wrong number (0.1 USDC.e
 * shows as 100,000), which is worse than showing nothing.
 */
function SimulationBalances(props: {
	assetChanges: SimulationAssetChange[]
	tokenMetadata: Record<string, { symbol?: string; decimals?: number }>
}): React.JSX.Element {
	if (props.assetChanges.length === 0)
		return (
			<div className="px-[18px] py-[24px] text-center text-[13px] text-tertiary">
				No balance changes.
			</div>
		)

	const byAccount = new Map<OxAddress.Address, SimulationAssetChange[]>()
	for (const change of props.assetChanges) {
		const existing = byAccount.get(change.address)
		if (existing) existing.push(change)
		else byAccount.set(change.address, [change])
	}

	return (
		<div className="flex flex-col divide-y divide-card-border">
			{[...byAccount.entries()].map(([account, changes]) => (
				<div
					key={account}
					className="flex flex-col gap-[6px] px-[18px] py-[12px]"
				>
					<Address address={account} />
					<div className="flex flex-col gap-[3px] border-l border-base-border pl-[12px]">
						{changes.map((change) => {
							const metadata =
								props.tokenMetadata[change.token] ??
								props.tokenMetadata[change.token.toLowerCase()]
							const positive = change.diff > 0n
							return (
								<div
									key={change.token}
									className="flex items-center gap-[8px] text-[13px]"
								>
									<span
										className={cx(
											'shrink-0 tabular-nums',
											positive
												? 'text-base-content-positive'
												: 'text-secondary',
										)}
										title={`${change.diff.toString()} (raw)`}
									>
										{formatBalanceDelta(change.diff, metadata?.decimals)}
									</span>
									<Link
										to={
											Tip20.isTip20Address(change.token)
												? '/token/$address'
												: '/address/$address'
										}
										params={{ address: change.token }}
										className="inline-flex shrink-0 items-center gap-[4px] text-base-content-positive press-down"
									>
										<TokenIcon
											address={change.token}
											name={metadata?.symbol}
											className="size-[16px]!"
										/>
										<span>
											{metadata?.symbol ?? HexFormatter.truncate(change.token)}
										</span>
									</Link>
								</div>
							)
						})}
					</div>
				</div>
			))}
		</div>
	)
}

/** Formats with the token's decimals, or falls back to the raw integer. */
function formatBalanceDelta(
	diff: bigint,
	decimals: number | undefined,
): string {
	const sign = diff > 0n ? '+' : '−'
	const magnitude = diff < 0n ? -diff : diff
	if (decimals === undefined) return `${sign}${magnitude.toLocaleString()}`
	return `${sign}${PriceFormatter.formatAmount(Value.format(magnitude, decimals))}`
}

function SimulationEmptyState(props: {
	onExample: (kind: 'read' | 'failing') => void
}): React.JSX.Element {
	return (
		<div className="rounded-[10px] border border-card-border bg-card px-[20px] py-[22px]">
			<h2 className="text-[13px] font-medium text-primary">
				Nothing simulated yet
			</h2>
			<p className="mt-[6px] max-w-[560px] text-[12px] leading-[18px] text-tertiary">
				Fill in the call above and run it, or load an existing transaction by
				hash to replay it against the state of its parent block. Nothing is
				signed and nothing is broadcast.
			</p>
			<div className="mt-[14px] flex flex-wrap gap-[8px]">
				<button
					type="button"
					onClick={() => props.onExample('read')}
					className="rounded-[6px] bg-accent/10 px-[12px] py-[7px] text-[12px] text-accent cursor-pointer press-down"
				>
					Read a token name
				</button>
				<button
					type="button"
					onClick={() => props.onExample('failing')}
					className="rounded-[6px] border border-card-border bg-distinct px-[12px] py-[7px] text-[12px] text-primary cursor-pointer press-down"
				>
					See a failing transfer
				</button>
			</div>
		</div>
	)
}

/**
 * Per-call results for a Tempo batch. `eth_simulateV1` runs the calls in order
 * against each other's state, so unlike tracing them individually these numbers
 * are the ones the real transaction would produce.
 */
function BatchCalls(props: {
	calls: SimulationCallResult[]
	traces: CallTrace[]
	prestates: PrestateDiff[]
}): React.JSX.Element {
	if (props.calls.length === 0)
		return (
			<div className="px-[18px] py-[24px] text-center text-[13px] text-tertiary">
				No call results.
			</div>
		)

	return (
		<div className="flex flex-col divide-y divide-card-border">
			{props.calls.map((call) => (
				<BatchCallRow
					key={call.index}
					call={call}
					trace={props.traces[call.index] ?? null}
					prestate={props.prestates[call.index] ?? null}
				/>
			))}
		</div>
	)
}

function BatchCallRow(props: {
	call: SimulationCallResult
	trace: CallTrace | null
	prestate: PrestateDiff | null
}): React.JSX.Element {
	const { call } = props
	const [expanded, setExpanded] = React.useState(call.status === 'reverted')
	const tree = useTraceTree(props.trace)
	// The outer frame's revert bytes are usually a wrapper like TokenCallFailed;
	// the deepest failing frame is the one that says what actually went wrong.
	const failed = findDeepestFailedNode(tree)
	const reason = failed?.decodedError
		? formatDecodedTraceErrorShort(failed.decodedError)
		: undefined
	const { data: abi } = useAutoloadAbi({ address: call.to, enabled: true })
	const succeeded = call.status === 'success'

	const label = React.useMemo(() => {
		if (abi && call.data.length >= 10) {
			try {
				const decoded = decodeFunctionData({ abi: abi as Abi, data: call.data })
				const args = (decoded.args ?? [])
					.map((value) => shorten(inputValueToString(value)))
					.join(', ')
				return `${decoded.functionName}(${args})`
			} catch {}
		}
		return call.data.length >= 10 ? `${call.data.slice(0, 10)}()` : 'call()'
	}, [abi, call.data])

	return (
		<div className="flex flex-col gap-[6px] px-[18px] py-[12px]">
			{/* The whole row toggles: a small text link was too easy to miss. */}
			<button
				type="button"
				onClick={() => tree && setExpanded(!expanded)}
				disabled={!tree}
				title={tree ? (expanded ? 'Hide trace' : 'Show trace') : undefined}
				className={cx(
					'-mx-[6px] flex flex-wrap items-center gap-[8px] rounded-[6px] px-[6px] py-[4px] text-left text-[12px]',
					tree && 'cursor-pointer press-down hover:bg-distinct/60',
				)}
			>
				<span
					className={cx(
						'flex size-[18px] shrink-0 items-center justify-center rounded-full text-[10px] font-medium',
						succeeded
							? 'bg-base-content-positive/15 text-base-content-positive'
							: 'bg-negative/15 text-negative',
					)}
					title={succeeded ? 'Succeeded' : 'Reverted'}
				>
					{call.index + 1}
				</span>
				<span className="font-mono text-tertiary">
					{HexFormatter.truncate(call.to)}
				</span>
				<span className="min-w-0 flex-1 truncate font-mono text-code-identifier">
					{label}
				</span>
				<span className="shrink-0 font-mono text-[11px] text-tertiary">
					{call.gasUsed.toLocaleString()} gas
				</span>
				<span className="flex shrink-0 items-center gap-[4px] text-[11px] text-tertiary">
					{tree
						? `${tree.subtreeSize} frame${tree.subtreeSize === 1 ? '' : 's'}`
						: 'no trace'}
					{tree && (
						<ChevronDownIcon
							className={cx(
								'size-[12px] transition-transform',
								!expanded && '-rotate-90',
							)}
						/>
					)}
				</span>
			</button>
			{!succeeded && (
				<span
					className="pl-[26px] font-mono text-[11px] break-all text-negative"
					title={call.revertData}
				>
					reverted
					{reason ? (
						<>
							{' · '}
							<span className="font-medium">{reason}</span>
							{failed?.contractName ? (
								<span className="text-tertiary"> in {failed.contractName}</span>
							) : null}
						</>
					) : call.revertData ? (
						` · ${call.revertData}`
					) : null}
				</span>
			)}
			{succeeded && call.returnData !== '0x' && (
				<span className="pl-[26px] font-mono text-[11px] break-all text-tertiary">
					returned {abbreviate(call.returnData, 42)}
				</span>
			)}
			{expanded && tree && (
				<div className="mt-[6px] overflow-hidden rounded-[7px] border border-card-border bg-card-header">
					<TxTraceTree trace={props.trace} tree={tree} label={null} />
					<TxTraceFlamegraph tree={tree} prestate={props.prestate} />
				</div>
			)}
		</div>
	)
}

function abbreviate(value: string, max: number): string {
	if (value.length <= max) return value
	return `${value.slice(0, max - 8)}…${value.slice(-6)}`
}

/**
 * Whole-simulation failure: one box, not one per panel. Titled by what the user
 * can do about it rather than by which query object threw.
 */
function SimulationFailure(props: {
	errors: Error[]
	onRetry: () => void
}): React.JSX.Element {
	const status = props.errors.find(
		(error): error is SimulationApiError => error instanceof SimulationApiError,
	)?.status
	const { title, hint } = describeFailure(status)
	const messages = [...new Set(props.errors.map((error) => error.message))]

	return (
		<div className="overflow-hidden rounded-[10px] border border-negative/40 bg-card shadow-[0px_4px_44px_rgba(0,0,0,0.05)]">
			<div className="flex items-start gap-[12px] px-[18px] py-[16px]">
				<div className="mt-[1px] flex size-[20px] shrink-0 items-center justify-center rounded-full bg-negative/15 text-negative">
					<CircleAlertIcon className="size-[13px]" />
				</div>
				<div className="min-w-0 flex-1">
					<h2 className="text-[14px] font-medium text-negative">{title}</h2>
					<p className="mt-[5px] text-[13px] text-secondary">{hint}</p>
					<div className="mt-[10px] flex flex-col gap-[4px]">
						{messages.map((message) => (
							<code
								key={message}
								className="block break-all rounded-[6px] bg-distinct px-[10px] py-[7px] font-mono text-[11px] text-tertiary"
							>
								{message}
							</code>
						))}
					</div>
					<button
						type="button"
						onClick={props.onRetry}
						className="mt-[12px] flex h-[30px] w-fit items-center gap-[6px] rounded-[7px] border border-card-border px-[10px] text-[12px] text-secondary cursor-pointer press-down hover:text-primary"
					>
						<RotateCcwIcon className="size-[12px]" />
						Try again
					</button>
				</div>
			</div>
		</div>
	)
}

function describeFailure(status: number | undefined): {
	title: string
	hint: string
} {
	if (status === 429)
		return {
			title: 'Rate limited',
			hint: 'Too many simulations from this address in a short window. Wait a few seconds and run it again.',
		}
	if (status === 504)
		return {
			title: 'Simulation timed out',
			hint: 'The node took too long to trace this call. A lower gas limit or a pinned block may help.',
		}
	if (status === 400)
		return {
			title: 'This call could not be simulated',
			hint: 'The request was rejected before it reached the node. Check the addresses, calldata, and gas limit.',
		}
	return {
		title: 'The node rejected this simulation',
		hint: 'Nothing was traced. This is usually the call itself — an unsupported target, or a block the node no longer has state for.',
	}
}

function PanelSkeleton(props: { rows: number }): React.JSX.Element {
	return (
		<div className="flex flex-col gap-[9px] px-[18px] py-[16px] animate-pulse">
			{Array.from({ length: props.rows }, (_, index) => (
				<div
					key={index}
					className="h-[12px] rounded bg-distinct"
					style={{ width: `${88 - (index % 3) * 14}%` }}
				/>
			))}
		</div>
	)
}

function PanelError(props: { title: string; error: Error }): React.JSX.Element {
	const rateLimited =
		props.error instanceof SimulationApiError && props.error.status === 429
	return (
		<div className="px-[18px] py-[18px] text-[12px]">
			<div className="text-negative">
				{rateLimited ? 'Rate limited' : props.title}
			</div>
			<div className="mt-[4px] text-tertiary">{props.error.message}</div>
		</div>
	)
}

function Field(props: {
	label: string
	children: React.ReactNode
}): React.JSX.Element {
	return (
		<div className="flex min-w-0 flex-col gap-[6px] text-[11px] text-tertiary">
			<span>{props.label}</span>
			{props.children}
		</div>
	)
}

const inputClassName =
	'w-full min-w-0 rounded-[6px] border border-card-border bg-distinct px-[9px] py-[7px] text-[12px] font-mono text-primary outline-none focus:border-accent'

/** `0xdEaD…dEaD → pathUSD.transfer(0x…0002, …) @ latest`, or `→ 2 calls`. */
function describeCall(form: FormState, abi: Abi | undefined): string {
	const first = form.calls[0]
	if (!first || (!first.to.trim() && !first.data.trim())) return 'New call'

	const from = OxAddress.validate(form.from)
		? HexFormatter.truncate(form.from as OxHex.Hex)
		: form.from || 'anyone'
	const block = form.block === 'latest' ? 'latest' : 'pinned block'

	if (form.calls.length > 1)
		return `${from} → ${form.calls.length} calls @ ${block}`

	const to = OxAddress.validate(first.to)
		? HexFormatter.truncate(first.to as OxHex.Hex)
		: first.to || '—'

	let call =
		first.data && first.data !== '0x'
			? `${first.data.slice(0, 10)}()`
			: 'call()'
	if (abi && OxHex.validate(first.data) && first.data.length >= 10) {
		try {
			const decoded = decodeFunctionData({
				abi,
				data: first.data as OxHex.Hex,
			})
			const args = (decoded.args ?? [])
				.map((value) => shorten(inputValueToString(value)))
				.join(', ')
			call = `${decoded.functionName}(${args})`
		} catch {
			// Unknown selector — the hex form above is a fine fallback.
		}
	}

	return `${from} → ${to}.${call} @ ${block}`
}

function shorten(value: string): string {
	if (value.length <= 14) return value
	return `${value.slice(0, 6)}…${value.slice(-4)}`
}

function callLabel(node: TxTraceTree.Node): string {
	const contract =
		node.contractName ??
		(node.trace.to ? HexFormatter.truncate(node.trace.to) : 'contract')
	const fn = node.functionName ?? node.selector ?? 'call'
	return `${contract}.${fn}()`
}

function parseForm(form: FormState, chainId: number): SimulationInput | null {
	if (chainId !== 4217 && chainId !== 42431 && chainId !== 31318) return null
	// An unset sender means "nobody in particular" — the zero address, matching
	// what `eth_call` does. Only `to` is genuinely required.
	const from = form.from.trim() === '' ? zeroAddress : form.from.trim()
	if (
		!OxAddress.validate(from) ||
		!/^\d+$/.test(form.gas) ||
		(form.block !== 'latest' &&
			(!OxHex.validate(form.block) || OxHex.size(form.block) !== 32))
	)
		return null

	const calls: SimulationBatchCall[] = []
	for (const draft of form.calls) {
		const data = draft.data.trim() === '' ? '0x' : draft.data.trim()
		if (
			!OxAddress.validate(draft.to.trim()) ||
			!OxHex.validate(data) ||
			!/^\d+$/.test(draft.value)
		)
			return null
		calls.push({
			to: OxAddress.from(draft.to.trim()),
			data: data as OxHex.Hex,
			value: draft.value,
		})
	}

	const first = calls[0]
	if (!first) return null
	return {
		chainId,
		from: OxAddress.from(from),
		to: first.to,
		data: first.data,
		value: first.value,
		gas: form.gas,
		block: form.block as 'latest' | OxHex.Hex,
		...(calls.length > 1 ? { calls } : {}),
	}
}

function toSimulationInput(
	search: ReturnType<typeof Route.useSearch>,
	chainId: number,
): SimulationInput | null {
	if (!search.to) return null
	return parseForm(
		{
			from: search.from,
			calls: [
				{ to: search.to, data: search.data, value: search.value },
				...parseExtraCalls(search.calls),
			],
			gas: search.gas,
			block: search.block,
		},
		chainId,
	)
}

function emptySimulationInput(): SimulationInput {
	return {
		chainId: 42431,
		from: zeroAddress,
		to: zeroAddress,
		data: '0x',
		value: '0',
		gas: DEFAULT_GAS,
		block: 'latest',
	}
}

function inputValueToString(value: unknown): string {
	if (typeof value === 'bigint') return value.toString()
	if (typeof value === 'string' || typeof value === 'boolean')
		return String(value)
	if (isArrayType(Array.isArray(value) ? 'unknown[]' : 'unknown'))
		return JSON.stringify(value)
	try {
		return JSON.stringify(value, (_, item) =>
			typeof item === 'bigint' ? item.toString() : item,
		)
	} catch {
		return formatAbiValue(value)
	}
}

function signed(value: bigint): string {
	if (value === 0n) return '±0'
	return `${value > 0n ? '+' : '−'}${(value < 0n ? -value : value).toLocaleString()}`
}
