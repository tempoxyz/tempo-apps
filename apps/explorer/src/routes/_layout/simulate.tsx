import { queryOptions, useQuery } from '@tanstack/react-query'
import {
	createFileRoute,
	stripSearchParams,
	useNavigate,
} from '@tanstack/react-router'
import * as OxAddress from 'ox/Address'
import * as OxHex from 'ox/Hex'
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
import { Sections } from '#comps/Sections'
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
import * as Tip20 from '#lib/domain/tip20'
import { formatTraceErrorArgs } from '#lib/domain/trace-error-args'
import { formatDecodedTraceErrorShort } from '#lib/domain/trace-errors'
import { HexFormatter } from '#lib/formatting'
import { useCopy, useKeyboardShortcut } from '#lib/hooks'
import { getFeeTokenForChain } from '#lib/fee-token'
import {
	SimulationApiError,
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
		call: z.optional(z.coerce.number()),
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
	to: string
	data: string
	value: string
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
	const [form, setForm] = React.useState<FormState>(() => ({
		from: search.from,
		to: search.to ?? getFeeTokenForChain(chainId) ?? EXAMPLE_TOKEN,
		data: search.to ? search.data : EXAMPLE_CALLDATA,
		value: search.value,
		gas: search.gas,
		block: search.block,
	}))
	const [formError, setFormError] = React.useState<string | null>(null)
	const [loadHash, setLoadHash] = React.useState(search.tx ?? '')
	const [loadError, setLoadError] = React.useState<string | null>(null)
	const [loadingTransaction, setLoadingTransaction] = React.useState(false)
	const [batchCalls, setBatchCalls] = React.useState<TempoBatchCall[]>([])
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
			form.from === zeroAddress &&
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

	// A batch runs whole unless the user has drilled into one of its calls.
	const activeBatch =
		search.call === undefined && batchCalls.length > 1 ? batchCalls : undefined
	const currentInput = React.useMemo(
		() => parseForm(form, chainId, activeBatch),
		[form, chainId, activeBatch],
	)
	const dirty = Boolean(
		runInput &&
			(!currentInput ||
				JSON.stringify(currentInput) !== JSON.stringify(runInput)),
	)

	const run = React.useCallback(() => {
		const input = parseForm(form, chainId, activeBatch)
		if (!input) {
			setFormError(
				'Enter valid from/to addresses, hexadecimal calldata, and numeric gas/value fields.',
			)
			return
		}
		setFormError(null)
		setRunInput(input)
		setEditing(false)
		if (OxHex.size(input.data) > MAX_URL_CALLDATA_BYTES) return
		void navigate({
			search: {
				from: input.from,
				to: input.to,
				data: input.data,
				value: input.value,
				gas: input.gas,
				block: input.block,
				tx: search.tx,
				call: search.call,
				originStatus: original?.status,
				originGas: original?.gasUsed.toString(),
				originEvents: original?.events,
				originBalances: original?.balances,
			},
			replace: true,
			resetScroll: false,
		})
	}, [form, chainId, activeBatch, navigate, search.tx, search.call, original])

	const runExample = React.useCallback(
		(kind: 'read' | 'failing') => {
			const input: SimulationInput = {
				chainId,
				from: OxAddress.from(
					kind === 'failing'
						? '0x000000000000000000000000000000000000dEaD'
						: form.from,
				),
				to: OxAddress.from(getFeeTokenForChain(chainId) ?? EXAMPLE_TOKEN),
				data: kind === 'failing' ? FAILING_EXAMPLE_CALLDATA : EXAMPLE_CALLDATA,
				value: '0',
				gas: form.gas,
				block: 'latest',
			}
			setForm(input)
			setOriginal(null)
			setFormError(null)
			setRunInput(input)
			setEditing(false)
			void navigate({ search: input, replace: true, resetScroll: false })
		},
		[chainId, form.from, form.gas, navigate],
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
				setBatchCalls(tempoCalls)
				const selectedCall = tempoCalls[search.call ?? 0]
				const next = selectedCall ?? {
					to: transaction.to,
					data: transaction.input,
					value: transaction.value,
				}
				if (!next.to)
					throw new Error('Contract creation simulation is not supported yet.')
				const comparableLogs = withoutFeeTransferLogs(receipt.logs)
				const nextForm: FormState = {
					from: transaction.from,
					to: next.to,
					data: next.data ?? '0x',
					value: (next.value ?? 0n).toString(),
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
				const batch =
					search.call === undefined && tempoCalls.length > 1
						? tempoCalls
						: undefined
				const loaded = parseForm(nextForm, chainId, batch)
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
		[navigate, search.call, chainId],
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
					batchCalls={batchCalls}
					selectedCall={search.call}
					onSelectCall={(index) => {
						const call = index === undefined ? batchCalls[0] : batchCalls[index]
						if (call)
							setForm((current) => ({
								...current,
								to: call.to,
								data: call.data,
								value: call.value.toString(),
							}))
						void navigate({
							search: (previous) => ({ ...previous, call: index }),
							replace: true,
							resetScroll: false,
						})
					}}
					onLoad={() => void loadTransaction(loadHash)}
					onRun={run}
				/>

				<SimulationResults
					input={runInput}
					dirty={dirty}
					original={original}
					onExample={runExample}
					onTraceCall={(index) => {
						const call = batchCalls[index]
						if (!call) return
						setForm((current) => ({
							...current,
							to: call.to,
							data: call.data,
							value: call.value.toString(),
						}))
						void navigate({
							search: (previous) => ({ ...previous, call: index }),
							replace: true,
							resetScroll: false,
						})
					}}
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
	batchCalls: TempoBatchCall[]
	selectedCall: number | undefined
	onSelectCall: (index: number | undefined) => void
	onLoad: () => void
	onRun: () => void
}): React.JSX.Element {
	const { form, setForm, editing } = props
	const loadTransactionId = React.useId()
	const shareCopy = useCopy({ timeout: 1_500 })
	const address = OxAddress.validate(form.to)
		? (form.to as OxAddress.Address)
		: undefined
	const { data: abi } = useAutoloadAbi({ address, enabled: Boolean(address) })

	const summary = React.useMemo(
		() =>
			props.batchCalls.length > 1 && props.selectedCall === undefined
				? describeBatch(form, props.batchCalls)
				: describeCall(form, abi as Abi | undefined),
		[form, abi, props.batchCalls, props.selectedCall],
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

					{props.batchCalls.length > 1 && (
						<div className="flex flex-wrap items-center gap-[10px] rounded-[6px] border border-card-border bg-distinct px-[10px] py-[8px] text-[11px]">
							<span className="text-secondary">
								Tempo batch · {props.batchCalls.length} calls
							</span>
							<span className="text-tertiary">
								{props.selectedCall === undefined
									? 'Simulating the whole batch in order.'
									: `Simulating call ${props.selectedCall + 1} on its own — earlier calls in the batch are not applied.`}
							</span>
							{props.selectedCall !== undefined && (
								<button
									type="button"
									onClick={() => props.onSelectCall(undefined)}
									className="ml-auto text-accent cursor-pointer hover:underline press-down"
								>
									Simulate whole batch
								</button>
							)}
						</div>
					)}

					<div className="grid gap-[12px] min-[720px]:grid-cols-2">
						<Field label="From">
							<input
								value={form.from}
								onChange={(event) =>
									setForm((current) => ({
										...current,
										from: event.target.value,
									}))
								}
								className={inputClassName}
							/>
						</Field>
						<Field label="To">
							<input
								value={form.to}
								onChange={(event) =>
									setForm((current) => ({ ...current, to: event.target.value }))
								}
								placeholder="0x contract address"
								className={inputClassName}
							/>
						</Field>
					</div>

					<CalldataControl
						abi={abi as Abi | undefined}
						data={form.data}
						onChange={(data) => setForm((current) => ({ ...current, data }))}
					/>

					<div className="grid gap-[12px] min-[720px]:grid-cols-3">
						<Field label="Value">
							<input
								value={form.value}
								onChange={(event) =>
									setForm((current) => ({
										...current,
										value: event.target.value,
									}))
								}
								className={inputClassName}
							/>
						</Field>
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
	onTraceCall: (index: number) => void
}): React.JSX.Element {
	const fallback = emptySimulationInput()
	const input = props.input ?? fallback
	const enabled = Boolean(props.input)
	// `debug_traceCall` takes one call and cannot chain state between them, so a
	// batch has no single call tree or state diff. `eth_simulateV1` still gives
	// accurate sequential per-call results, which is what batch mode shows.
	const isBatch = (input.calls?.length ?? 0) > 1
	const traceQuery = useQuery({
		...simulationTraceQueryOptions(input),
		enabled: enabled && !isBatch,
	})
	const prestateQuery = useQuery({
		...simulationPrestateQueryOptions(input),
		enabled: enabled && !isBatch,
	})
	const executionQuery = useQuery({
		...simulationExecutionQueryOptions(input),
		enabled,
	})
	const tree = useTraceTree(traceQuery.data ?? null)
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
	const failedNode = findDeepestFailedNode(tree)

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
	const stateAccounts = prestateQuery.data
		? TxStateDiff.buildData(prestateQuery.data, [], tokenMetadata, {
				omitNonceOnlyFor: input.from,
			}).accounts.length
		: 0
	const effectCount =
		(executionQuery.data?.logs.length ?? 0) +
		(executionQuery.data?.assetChanges.length ?? 0)

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
					onTraceCall={props.onTraceCall}
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
					<TxTraceTree
						trace={traceQuery.data ?? null}
						tree={tree}
						label={null}
					/>
					<TxTraceFlamegraph tree={tree} prestate={prestateQuery.data} />
				</div>
			),
		},
		{
			title: 'State changes',
			itemsLabel: 'accounts',
			totalItems: stateAccounts,
			autoCollapse: false,
			visible:
				!isBatch &&
				(prestateQuery.isPending ||
					Boolean(prestateQuery.error) ||
					stateAccounts > 0),
			content: prestateQuery.isPending ? (
				<PanelSkeleton rows={5} />
			) : prestateQuery.error ? (
				<PanelError
					title="State diff unavailable"
					error={prestateQuery.error}
				/>
			) : (
				<TxStateDiff
					prestate={prestateQuery.data ?? null}
					trace={traceQuery.data ?? null}
					receipt={{ from: input.from, to: input.to }}
					logs={executionQuery.data?.logs}
					tokenMetadata={tokenMetadata}
					label={null}
					omitSenderNonceFor={input.from}
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
				effectCount > 0,
			content: executionQuery.isPending ? (
				<PanelSkeleton rows={4} />
			) : executionQuery.error ? (
				<PanelError
					title="Execution result unavailable"
					error={executionQuery.error}
				/>
			) : (
				<SimulationEffects
					logs={executionQuery.data?.logs ?? []}
					knownEvents={knownEvents}
					assetChanges={executionQuery.data?.assetChanges ?? []}
					tokenMetadata={tokenMetadata}
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

					{execution.calls.length > 1 ? (
						<BatchDetail
							execution={execution}
							knownEvents={props.knownEvents}
						/>
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

function BatchDetail(props: {
	execution: SimulationExecutionResult
	knownEvents: ReturnType<typeof parseKnownEvents>
}): React.JSX.Element {
	const { execution, knownEvents } = props
	const succeeded = execution.calls.filter(
		(call) => call.status === 'success',
	).length
	const event = knownEvents.find(preferredEventsFilter) ?? knownEvents[0]

	return (
		<div className="mt-[5px] flex flex-col gap-[6px]">
			<p className="text-[13px] text-secondary">
				{succeeded} of {execution.calls.length} calls succeeded, executed in
				order against each other{'’'}s state.
			</p>
			{event && (
				<div className="text-[13px] text-secondary">
					<TxEventDescription event={event} />
				</div>
			)}
		</div>
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

function SimulationEffects(props: {
	logs: Log[]
	knownEvents: ReturnType<typeof parseKnownEvents>
	assetChanges: Array<{
		address: OxAddress.Address
		token: OxAddress.Address
		diff: bigint
	}>
	tokenMetadata: Record<string, { symbol?: string; decimals?: number }>
}): React.JSX.Element {
	if (props.logs.length === 0 && props.assetChanges.length === 0)
		return (
			<div className="px-[18px] py-[24px] text-center text-[13px] text-tertiary">
				No events or balance changes.
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
			{props.logs.length > 0 && props.knownEvents.length === 0 && (
				<div className="px-[18px] py-[12px] text-[12px] text-tertiary">
					{props.logs.length} raw event{props.logs.length === 1 ? '' : 's'}{' '}
					emitted.
				</div>
			)}
			{props.assetChanges.map((change) => (
				<div
					key={`${change.address}-${change.token}`}
					className="grid grid-cols-[1fr_auto] gap-[12px] px-[18px] py-[10px] text-[12px] font-mono"
				>
					<span
						className="min-w-0 truncate text-secondary"
						title={change.address}
					>
						{change.address} ·{' '}
						{props.tokenMetadata[change.token]?.symbol ?? change.token}
					</span>
					<span
						className={
							change.diff > 0n ? 'text-base-content-positive' : 'text-primary'
						}
					>
						{signed(change.diff)}
					</span>
				</div>
			))}
		</div>
	)
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
	onTraceCall: (index: number) => void
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
					onTrace={() => props.onTraceCall(call.index)}
				/>
			))}
		</div>
	)
}

function BatchCallRow(props: {
	call: SimulationCallResult
	onTrace: () => void
}): React.JSX.Element {
	const { call } = props
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
			<div className="flex flex-wrap items-center gap-[8px] text-[12px]">
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
				<button
					type="button"
					onClick={props.onTrace}
					className="shrink-0 text-[11px] text-accent cursor-pointer hover:underline press-down"
				>
					Trace
				</button>
			</div>
			{!succeeded && (
				<span className="pl-[26px] font-mono text-[11px] break-all text-negative">
					reverted{call.revertData ? ` · ${call.revertData}` : ''}
				</span>
			)}
			{succeeded && call.returnData !== '0x' && (
				<span className="pl-[26px] font-mono text-[11px] break-all text-tertiary">
					returned {abbreviate(call.returnData, 42)}
				</span>
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

/** `0xdEaD…dEaD → pathUSD.transfer(0x…0002, …)  @ latest` */
function describeCall(form: FormState, abi: Abi | undefined): string {
	const from = OxAddress.validate(form.from)
		? HexFormatter.truncate(form.from as OxHex.Hex)
		: form.from || '—'
	const to = OxAddress.validate(form.to)
		? HexFormatter.truncate(form.to as OxHex.Hex)
		: form.to || '—'
	const block = form.block === 'latest' ? 'latest' : 'pinned block'

	let call =
		form.data && form.data !== '0x' ? `${form.data.slice(0, 10)}()` : 'call()'
	if (abi && OxHex.validate(form.data) && form.data.length >= 10) {
		try {
			const decoded = decodeFunctionData({
				abi,
				data: form.data as OxHex.Hex,
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

/** `0x54bd…194d → 2 calls @ pinned block` */
function describeBatch(form: FormState, calls: TempoBatchCall[]): string {
	const from = OxAddress.validate(form.from)
		? HexFormatter.truncate(form.from as OxHex.Hex)
		: form.from || '—'
	const block = form.block === 'latest' ? 'latest' : 'pinned block'
	return `${from} → ${calls.length} calls @ ${block}`
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

function parseForm(
	form: FormState,
	chainId: number,
	batch?: TempoBatchCall[] | undefined,
): SimulationInput | null {
	const single = parseSingleForm(form, chainId)
	if (!single || !batch?.length || batch.length < 2) return single
	return {
		...single,
		calls: batch.map((call) => ({
			to: call.to,
			data: call.data,
			value: call.value.toString(),
		})),
	}
}

function parseSingleForm(
	form: FormState,
	chainId: number,
): SimulationInput | null {
	if (
		(chainId !== 4217 && chainId !== 42431 && chainId !== 31318) ||
		!OxAddress.validate(form.from) ||
		!OxAddress.validate(form.to) ||
		!OxHex.validate(form.data) ||
		!/^\d+$/.test(form.value) ||
		!/^\d+$/.test(form.gas) ||
		(form.block !== 'latest' &&
			(!OxHex.validate(form.block) || OxHex.size(form.block) !== 32))
	)
		return null
	return {
		chainId,
		from: OxAddress.from(form.from),
		to: OxAddress.from(form.to),
		data: form.data as OxHex.Hex,
		value: form.value,
		gas: form.gas,
		block: form.block as 'latest' | OxHex.Hex,
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
			to: search.to,
			data: search.data,
			value: search.value,
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
