import { queryOptions, useQuery } from '@tanstack/react-query'
import {
	createFileRoute,
	stripSearchParams,
	useNavigate,
} from '@tanstack/react-router'
import * as OxAddress from 'ox/Address'
import * as OxHex from 'ox/Hex'
import * as React from 'react'
import type { Abi } from 'viem'
import { zeroAddress } from 'viem'
import { useConnection } from 'wagmi'
import { getBlock, getTransaction, getTransactionReceipt } from 'wagmi/actions'
import * as z from 'zod/mini'
import { SimulateCallForm } from '#comps/SimulateCallForm'
import { SimulateGasPanel } from '#comps/SimulateGasPanel'
import {
	type OriginalMetrics,
	type OutputTab,
	SimulateAnswer,
	SimulateCallHeading,
	SimulateDiff,
	SimulateEvents,
	SimulateOverview,
	SimulateResultHeader,
	SimulateStepBar,
	SimulateTabs,
} from '#comps/SimulateResultPane'
import {
	Button,
	describeCall,
	PanelEmpty,
	PanelError,
	PanelSkeleton,
	SegmentedControl,
	SimulationFailure,
} from '#comps/SimulateShared'
import { TxStateDiff } from '#comps/TxStateDiff'
import {
	findDeepestFailedNode,
	TxTraceTree,
	useTraceTrees,
} from '#comps/TxTraceTree'
import { cx } from '#lib/css'
import { parseKnownEvents } from '#lib/domain/known-events'
import {
	type CallDraft,
	DEFAULT_GAS,
	emptyCall,
	type FormState,
	MAX_URL_CALLDATA_BYTES,
	parseExtraCalls,
	parseForm,
	serializeExtraCalls,
	shareGasAcrossCalls,
} from '#lib/domain/simulate-calls'
import {
	countTransferBalanceChanges,
	normalizeTempoBatchCall,
	type TempoBatchCall,
	withoutFeeTransferLogs,
} from '#lib/domain/tempo-calls'
import * as Tip20 from '#lib/domain/tip20'
import { formatTraceErrorArgs } from '#lib/domain/trace-error-args'
import { getFeeTokenForChain } from '#lib/fee-token'
import { useCopy, useKeyboardShortcut, useMediaQuery } from '#lib/hooks'
import {
	type CallTrace,
	mergePrestateDiffs,
	simulationExecutionQueryOptions,
	type SimulationInput,
	simulationPrestateQueryOptions,
	simulationTraceQueryOptions,
	type SimulationCallResult,
	useAutoloadAbi,
} from '#lib/queries'
import { zAddress, zHash } from '#lib/zod'
import { getWagmiConfig } from '#wagmi.config'
import EraserIcon from '~icons/lucide/eraser'
import LinkIcon from '~icons/lucide/link'
import PlayIcon from '~icons/lucide/play'

const EXAMPLE_TOKEN = '0x20c0000000000000000000000000000000000001'
const EXAMPLE_CALLDATA = '0x06fdde03'
const FAILING_EXAMPLE_CALLDATA =
	'0xa9059cbb0000000000000000000000000000000000000000000000000000000000000002ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'

type Pane = 'input' | 'split' | 'output'

const defaultSearch = {
	from: zeroAddress,
	data: '0x',
	value: '0',
	gas: DEFAULT_GAS,
	block: 'latest',
	pane: 'split',
	tab: 'overview',
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
		/**
		 * View state lives in the URL too, so a shared link lands on whatever the
		 * sender was looking at — and so the active tab can never desynchronise
		 * from the rendered panel, which is what made the old tab bar inert.
		 */
		pane: z.prefault(z.enum(['input', 'split', 'output']), defaultSearch.pane),
		tab: z.prefault(
			z.enum(['overview', 'trace', 'state', 'events', 'gas']),
			defaultSearch.tab,
		),
		/** Selected trace frame, shared between the Trace and Gas tabs. */
		frame: z.optional(z.string()),
		/**
		 * Which call of a batch the evidence tabs are narrowed to. Absent — the
		 * default — shows every call, because a batch is one transaction.
		 */
		step: z.optional(z.coerce.number()),
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

function SimulatePage(): React.JSX.Element {
	const search = Route.useSearch()
	const navigate = useNavigate({ from: Route.fullPath })
	const chainId = getWagmiConfig().chains[0].id as SimulationInput['chainId']
	const connection = useConnection()
	// Two panes need room. Below this the split collapses to one pane at a time,
	// because 560px each is narrower than a single trace line.
	const narrow = useMediaQuery('(max-width: 1099px)')

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
	const shareLink = useCopy({ timeout: 1_500 })
	// The form always edits exactly one call, even while the result pane shows
	// them all — so "which call am I editing" is separate from "which call am I
	// looking at", and clearing the filter does not yank the form elsewhere.
	const [editIndex, setEditIndex] = React.useState(search.step ?? 0)

	const setSearch = React.useCallback(
		(patch: Partial<typeof search>) =>
			void navigate({
				search: (current) => ({ ...current, ...patch }),
				replace: true,
				resetScroll: false,
			}),
		[navigate],
	)

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
	const [blockGasLimit, setBlockGasLimit] = React.useState(DEFAULT_GAS)
	React.useEffect(() => {
		let cancelled = false
		void getBlock(getWagmiConfig())
			.then((block) => {
				if (cancelled) return
				const gas = block.gasLimit.toString()
				setBlockGasLimit(gas)
				if (search.gas !== DEFAULT_GAS) return
				setForm((current) =>
					current.gas === DEFAULT_GAS ? { ...current, gas } : current,
				)
				setRunInput((current) =>
					current && current.gas === DEFAULT_GAS
						? {
								...current,
								// A batch shares the block between its calls; handing each
								// call the whole block limit makes the node reject the bundle.
								gas: shareGasAcrossCalls(gas, current.calls?.length ?? 1, gas),
							}
						: current,
				)
			})
			.catch(() => {})
		return () => {
			cancelled = true
		}
	}, [search.gas])

	const currentInput = React.useMemo(
		() => parseForm(form, chainId, blockGasLimit),
		[form, chainId, blockGasLimit],
	)
	const stale = Boolean(
		runInput &&
			(!currentInput ||
				JSON.stringify(currentInput) !== JSON.stringify(runInput)),
	)

	const run = React.useCallback(() => {
		const input = parseForm(form, chainId, blockGasLimit)
		if (!input) {
			setFormError(
				'Enter a valid target address, hexadecimal calldata, and numeric gas and value fields.',
			)
			return
		}
		setFormError(null)
		setRunInput(input)
		const extras = serializeExtraCalls(form.calls)
		// On a narrow screen the panes are exclusive, so running is also a request
		// to look at the result.
		const paneAfterRun = narrow ? ('output' as const) : undefined
		if (
			OxHex.size(input.data) > MAX_URL_CALLDATA_BYTES ||
			(extras ? JSON.stringify(extras).length : 0) > MAX_URL_CALLDATA_BYTES
		) {
			if (paneAfterRun) setSearch({ pane: paneAfterRun })
			return
		}
		void navigate({
			search: (current) => ({
				...current,
				from: input.from,
				to: input.to,
				data: input.data,
				value: input.value,
				gas: input.gas,
				block: input.block,
				calls: extras,
				...(paneAfterRun ? { pane: paneAfterRun } : {}),
			}),
			replace: true,
			resetScroll: false,
		})
	}, [form, chainId, blockGasLimit, navigate, narrow, setSearch])

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
			void navigate({
				search: (current) => ({
					...current,
					from: input.from,
					to: input.to,
					data: input.data,
					value: input.value,
					gas: input.gas,
					block: input.block,
					calls: undefined,
					tx: undefined,
					frame: undefined,
					tab: 'overview',
				}),
				replace: true,
				resetScroll: false,
			})
		},
		[chainId, form.gas, navigate],
	)

	useKeyboardShortcut({ 'mod+enter': run })

	/** Anything worth discarding — an edited draft, or a run to throw away. */
	const hasDraft = Boolean(
		runInput ||
			form.from.trim() ||
			form.calls.some((call) => call.to.trim() || call.data.trim()) ||
			loadHash.trim(),
	)

	/**
	 * Back to a bare `/simulate`.
	 *
	 * Clears the search params too, so the URL stops describing a call that is
	 * no longer on screen — and because the previous state is one Back away,
	 * this needs no confirmation.
	 */
	const clear = React.useCallback(() => {
		setForm({
			from: '',
			calls: [emptyCall],
			gas: blockGasLimit,
			block: 'latest',
		})
		setRunInput(null)
		setOriginal(null)
		setFormError(null)
		setLoadHash('')
		setLoadError(null)
		setEditIndex(0)
		// A transaction loaded earlier must be re-loadable, so let the `?tx=`
		// autoload fire again if the user pastes the same hash.
		autoLoaded.current = false
		void navigate({
			search: (current) => ({ pane: current.pane }),
			replace: true,
			resetScroll: false,
		})
	}, [navigate, blockGasLimit])

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
				const loaded = parseForm(nextForm, chainId, blockGasLimit)
				setRunInput(loaded)
				void navigate({
					search: (current) => ({ ...current, tx: hash, frame: undefined }),
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
		[navigate, chainId, blockGasLimit],
	)

	const autoLoaded = React.useRef(false)
	React.useEffect(() => {
		if (!search.tx || search.to || autoLoaded.current) return
		autoLoaded.current = true
		void loadTransaction(search.tx)
	}, [search.tx, search.to, loadTransaction])

	const firstTo = form.calls[0]?.to ?? ''
	const summaryAddress = OxAddress.validate(firstTo)
		? (firstTo as OxAddress.Address)
		: undefined
	const { data: summaryAbi } = useAutoloadAbi({
		address: summaryAddress,
		enabled: Boolean(summaryAddress),
	})
	const summary = React.useMemo(
		() => describeCall(form, summaryAbi as Abi | undefined),
		[form, summaryAbi],
	)

	// On a narrow screen the segmented control has two states, not three: a
	// 560px pane is narrower than one trace line, so `split` is not offered.
	// Which of the two `split` collapses to depends on why you are here — a
	// shared link carries a result and should show it, an empty page has only
	// a form to offer.
	const pane: Pane =
		narrow && search.pane === 'split'
			? runInput
				? 'output'
				: 'input'
			: search.pane
	const showInput = pane === 'input' || pane === 'split'
	const showOutput = pane === 'output' || pane === 'split'

	return (
		<div className="flex w-full flex-col px-[24px] pt-8 pb-12 min-[800px]:pt-14 min-[1240px]:px-[84px]">
			<div className="mb-[12px] flex flex-wrap items-center gap-x-[14px] gap-y-[8px]">
				<h1 className="shrink-0 text-[18px] font-medium text-primary">
					Simulate
				</h1>
				<p
					className="min-w-0 flex-1 truncate font-mono text-[12px] text-tertiary"
					title={summary}
				>
					{summary}
				</p>
				<SegmentedControl
					value={pane}
					options={
						narrow
							? [
									{ value: 'input', label: 'Input' },
									{ value: 'output', label: 'Result' },
								]
							: [
									{ value: 'input', label: 'Input' },
									{ value: 'split', label: 'Split' },
									{ value: 'output', label: 'Result' },
								]
					}
					onChange={(value) => setSearch({ pane: value })}
				/>
				{/* Both page-scoped: Share copies the whole URL — inputs, tab, and
				    selected frame — not just the result. Keeping them here means one
				    action bar rather than a second Run inside the result header. */}
				{hasDraft && (
					<Button onClick={clear} title="Start over with an empty call">
						<EraserIcon className="size-[12px]" />
						Clear
					</Button>
				)}
				{runInput && (
					<Button
						onClick={() =>
							shareLink.copy(
								typeof window === 'undefined' ? '' : window.location.href,
							)
						}
						title="Copy a link that reproduces this screen"
					>
						<LinkIcon className="size-[12px]" />
						{shareLink.notifying ? 'Copied' : 'Share'}
					</Button>
				)}
				<Button tone="primary" onClick={run} title="Run this simulation (⌘↵)">
					<PlayIcon className="size-[12px]" />
					{runInput && !stale ? 'Run' : runInput ? 'Re-run' : 'Simulate'}
					<span className="text-[10px] opacity-70">⌘↵</span>
				</Button>
			</div>

			<div
				className={cx(
					'grid min-h-[560px] min-w-0 items-start gap-[14px]',
					pane === 'split' &&
						'min-[1100px]:grid-cols-[minmax(360px,420px)_minmax(0,1fr)]',
				)}
			>
				{showInput && (
					<section className="flex min-w-0 flex-col overflow-hidden rounded-[10px] border border-card-border bg-card-header">
						<SimulateCallForm
							form={form}
							setForm={setForm}
							step={editIndex}
							onStepChange={(index) => {
								setEditIndex(index)
								setSearch({ step: index })
							}}
							defaultGas={blockGasLimit}
							formError={formError}
							loadHash={loadHash}
							setLoadHash={setLoadHash}
							loadError={loadError}
							loadingTransaction={loadingTransaction}
							onLoad={() => void loadTransaction(loadHash)}
						/>
					</section>
				)}

				{showOutput && (
					<SimulationResults
						input={runInput}
						stale={stale}
						original={original}
						tab={search.tab}
						frame={search.frame}
						step={search.step}
						onStepChange={(index) => {
							if (index !== undefined) setEditIndex(index)
							setSearch({ step: index, frame: undefined })
						}}
						onSearchChange={setSearch}
						onExample={runExample}
						onEdit={() => setSearch({ pane: narrow ? 'input' : 'split' })}
					/>
				)}
			</div>
		</div>
	)
}

function SimulationResults(props: {
	input: SimulationInput | null
	stale: boolean
	original: OriginalMetrics | null
	tab: OutputTab
	frame: string | undefined
	/** `undefined` narrows nothing: the evidence covers the whole batch. */
	step: number | undefined
	onStepChange: (index: number | undefined) => void
	onSearchChange: (patch: Record<string, unknown>) => void
	onExample: (kind: 'read' | 'failing') => void
	onEdit: () => void
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
	const executionQuery = useQuery({
		...simulationExecutionQueryOptions(input),
		enabled,
	})
	// Stable identity: `?? []` allocates a fresh array on every pending render,
	// which would defeat the tree builder's memo.
	const traces = React.useMemo(() => traceQuery.data ?? [], [traceQuery.data])
	const prestate = React.useMemo(
		() => mergePrestateDiffs(prestateQuery.data ?? []),
		[prestateQuery.data],
	)

	// Which call the evidence tabs are narrowed to. A single call is always
	// "step 0"; a batch defaults to every call.
	const callCount = input.calls?.length ?? 1
	const step = isBatch
		? props.step === undefined
			? undefined
			: Math.min(props.step, callCount - 1)
		: 0
	const showingAll = step === undefined
	// Gas available to everything currently in view. `input.gas` is per call, so
	// a batch's allowance is that times the number of calls — the header and the
	// Gas tab must not disagree about the denominator.
	const gasAllowance =
		BigInt(input.gas || '0') * BigInt(showingAll ? callCount : 1)
	// The trace for the narrowed call. When showing all, each call renders its
	// own tree below rather than being stitched into one synthetic root.
	// Every call's tree, built through one shared ABI lookup. The narrowed view
	// picks one out of it rather than building a second time.
	const framePrefix = React.useCallback((index: number) => `call-${index}`, [])
	const allTrees = useTraceTrees(traces, framePrefix)
	const tree = allTrees[step ?? 0] ?? null
	const stepPrestate = React.useMemo(
		() =>
			isBatch && step !== undefined
				? mergePrestateDiffs(
						prestateQuery.data
							? [prestateQuery.data[step]].filter(Boolean)
							: [],
					)
				: // `mergePrestateDiffs` already collapses the batch into its net
					// effect: earliest `pre`, latest `post`.
					prestate,
		[isBatch, prestateQuery.data, step, prestate],
	)

	// When a later call in a batch is the one that reverted, its trace holds the
	// reason — call 0's does not.
	const failedCallIndex =
		executionQuery.data?.calls.findIndex(
			(call) => call.status === 'reverted',
		) ?? -1
	const failedCallTree =
		failedCallIndex > 0 ? (allTrees[failedCallIndex] ?? null) : null

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
	// Narrowing to one call narrows its events too — `eth_simulateV1` already
	// reports logs per call, so this is a filter rather than a reconstruction.
	const visibleLogs =
		step === undefined
			? (executionQuery.data?.logs ?? [])
			: (executionQuery.data?.calls[step]?.logs ?? [])
	// A `KnownEvent` does not carry the log it came from, so the narrowed set is
	// re-interpreted from that call's logs rather than filtered after the fact —
	// which also gives the interpreter the right call as context.
	const visibleKnownEvents = React.useMemo(() => {
		const execution = executionQuery.data
		if (!isBatch || step === undefined || !execution) return knownEvents
		const call = input.calls?.[step]
		return parseKnownEvents(
			{
				...execution.receipt,
				logs: visibleLogs as unknown as typeof execution.receipt.logs,
			},
			{
				transaction: {
					to: call?.to ?? input.to,
					input: call?.data ?? input.data,
				},
				getTokenMetadata: metadataQuery.data,
			},
		)
	}, [
		executionQuery.data,
		isBatch,
		knownEvents,
		step,
		visibleLogs,
		input,
		metadataQuery.data,
	])
	const failedNode = React.useMemo(
		() => findDeepestFailedNode(failedCallTree ?? tree),
		[failedCallTree, tree],
	)
	/** Decoded name per call, from the trees rather than a second ABI fetch. */
	const callLabels = React.useMemo(
		() =>
			allTrees.map((node) =>
				node?.functionName
					? `${node.functionName}()`
					: (node?.selector ?? 'call()'),
			),
		[allTrees],
	)

	// Remember what the previous run produced so this one can be compared against
	// it. `props.input` is a fresh object per run, so identity is the run key —
	// a refetch of the same input must not overwrite the comparison point.
	const execution = executionQuery.data
	const [previous, setPrevious] = React.useState<OriginalMetrics | null>(null)
	const lastRun = React.useRef<{
		input: SimulationInput
		metrics: OriginalMetrics
	} | null>(null)
	React.useEffect(() => {
		if (!execution || !props.input) return
		const prior = lastRun.current
		if (prior && prior.input !== props.input) setPrevious(prior.metrics)
		lastRun.current = {
			input: props.input,
			metrics: {
				status: execution.status,
				gasUsed: execution.gasUsed,
				events: execution.logs.length,
				balances: execution.assetChanges.length,
			},
		}
	}, [execution, props.input])

	const stateAccounts = React.useMemo(
		() =>
			stepPrestate
				? TxStateDiff.buildData(stepPrestate, [], tokenMetadata, {
						omitNonceOnlyFor: input.from,
					}).accounts.length
				: 0,
		[stepPrestate, tokenMetadata, input.from],
	)
	const stateReceipt = React.useMemo(
		() => ({ from: input.from, to: input.to }),
		[input.from, input.to],
	)
	const gasTrees = React.useMemo(
		() => (showingAll ? allTrees : [tree]),
		[showingAll, allTrees, tree],
	)

	if (!props.input)
		return (
			<SimulationEmptyState onExample={props.onExample} onEdit={props.onEdit} />
		)

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

	// Count what actually renders, not raw prestate keys — the diff drops
	// accounts with no real change and the caller's simulation-only nonce tick.

	const tabs = [
		{ id: 'overview' as const, label: 'Overview' },
		{
			id: 'trace' as const,
			label: 'Trace',
			// Counts describe what the tab will actually render, so showing every
			// call has to count every call's frames.
			count: showingAll
				? allTrees.reduce(
						(sum: number, node) => sum + (node?.subtreeSize ?? 0),
						0,
					)
				: (tree?.subtreeSize ?? 0),
		},
		{ id: 'state' as const, label: 'State', count: stateAccounts },
		{ id: 'events' as const, label: 'Events', count: visibleLogs.length },
		{ id: 'gas' as const, label: 'Gas' },
	]

	// One selection operation for every site that has one — the gas table, the
	// flamegraph, the trace rows, "Go to revert", and the answer's jump link.
	// Three of them used to set `?frame=` without switching tab or scrolling, so
	// "Go to revert" highlighted a frame that stayed off-screen.
	const selectFrame = (id: string) => {
		props.onSearchChange({ frame: id, tab: 'trace' })
		// The trace may be off-screen when the jump comes from the Gas tab, so
		// scroll after the tab switch has committed.
		requestAnimationFrame(() => {
			document
				.getElementById(id)
				?.scrollIntoView({ block: 'center', behavior: 'smooth' })
		})
	}

	return (
		<section className="flex min-w-0 flex-col overflow-hidden rounded-[10px] border border-card-border bg-card-header">
			<SimulateResultHeader
				execution={execution}
				input={input}
				gasLimit={gasAllowance}
				stale={props.stale}
			/>

			<div
				className={cx(
					'flex min-w-0 flex-col transition-opacity',
					// Only the evidence dims when inputs change. Dimming the header too
					// made every shared link's first impression a greyed-out screen.
					props.stale && 'opacity-60',
				)}
			>
				{execution ? (
					<>
						<SimulateAnswer
							execution={execution}
							tree={tree}
							failedNode={failedNode}
							errorArgs={
								failedNode?.decodedError
									? formatTraceErrorArgs({
											error: failedNode.decodedError,
											contract: failedNode.trace.to,
											tokenMetadata,
										})
									: []
							}
							knownEvents={knownEvents}
							onJumpToFrame={selectFrame}
						/>
						{/* On-chain is the more meaningful comparison when it exists, so
						    it wins; otherwise fall back to the previous run. */}
						{props.original ? (
							<SimulateDiff
								label="vs. on-chain"
								original={props.original}
								execution={execution}
							/>
						) : previous ? (
							<SimulateDiff
								label="vs. previous run"
								original={previous}
								execution={execution}
							/>
						) : null}
					</>
				) : (
					<PanelSkeleton rows={2} />
				)}

				{/* Waits for results rather than rendering a bare "Showing" with no
				    chips: the chips are labelled by outcome, so there is nothing to
				    draw until the run lands. */}
				{isBatch && execution && execution.calls.length > 1 && (
					<SimulateStepBar
						calls={execution.calls}
						labels={callLabels}
						step={step}
						onSelect={props.onStepChange}
					/>
				)}

				<SimulateTabs
					tabs={tabs}
					value={props.tab}
					onChange={(tab) => props.onSearchChange({ tab })}
				/>

				<div className="min-w-0">
					{props.tab === 'overview' &&
						(execution ? (
							<SimulateOverview
								input={input}
								execution={execution}
								gasLimit={gasAllowance}
								functionLabel={
									tree?.functionName
										? `${tree.functionName}()`
										: (tree?.selector ?? undefined)
								}
								assetChanges={execution.assetChanges}
								tokenMetadata={tokenMetadata}
							/>
						) : (
							<PanelSkeleton rows={5} />
						))}

					{props.tab === 'trace' &&
						(traceQuery.isPending ? (
							<PanelSkeleton rows={7} />
						) : traceQuery.error ? (
							<PanelError
								title="Call trace unavailable"
								error={traceQuery.error}
							/>
						) : showingAll && isBatch ? (
							// One tree per call, in order, each under its own heading.
							// Keeping them separate is the point: which call a frame
							// belongs to is never in question, and nothing has to be
							// invented for a batch-level root frame that does not exist.
							<div className="flex flex-col">
								{(execution?.calls ?? []).map((call) => (
									<CallTracePanel
										key={call.index}
										call={call}
										label={callLabels[call.index] ?? 'call()'}
										total={callCount}
										trace={traces[call.index] ?? null}
										tree={allTrees[call.index] ?? null}
										selectedId={props.frame}
										onSelect={selectFrame}
										onIsolate={() => props.onStepChange(call.index)}
									/>
								))}
							</div>
						) : tree ? (
							<TxTraceTree
								trace={traces[step ?? 0] ?? null}
								tree={tree}
								label={null}
								toolbar
								selectedId={props.frame}
								onSelect={selectFrame}
							/>
						) : (
							<PanelEmpty>No trace returned for this call.</PanelEmpty>
						))}

					{props.tab === 'state' &&
						(prestateQuery.isPending ? (
							<PanelSkeleton rows={5} />
						) : prestateQuery.error ? (
							<PanelError
								title="State diff unavailable"
								error={prestateQuery.error}
							/>
						) : stateAccounts > 0 ? (
							<TxStateDiff
								prestate={stepPrestate}
								trace={traces[step ?? 0] ?? null}
								receipt={stateReceipt}
								logs={execution?.logs}
								tokenMetadata={tokenMetadata}
								label={null}
								omitSenderNonceFor={input.from}
							/>
						) : (
							<PanelEmpty>No state changed.</PanelEmpty>
						))}

					{props.tab === 'events' &&
						(executionQuery.isPending ? (
							<PanelSkeleton rows={4} />
						) : executionQuery.error ? (
							<PanelError
								title="Execution result unavailable"
								error={executionQuery.error}
							/>
						) : (
							<SimulateEvents
								logs={visibleLogs}
								knownEvents={visibleKnownEvents}
							/>
						))}

					{props.tab === 'gas' &&
						(traceQuery.isPending ? (
							<PanelSkeleton rows={5} />
						) : (
							<SimulateGasPanel
								trees={gasTrees}
								prestate={stepPrestate}
								gasUsed={
									showingAll && execution
										? execution.gasUsed
										: BigInt(tree?.gasUsed ?? 0)
								}
								gasLimit={
									BigInt(input.gas || '0') * BigInt(showingAll ? callCount : 1)
								}
								selectedFrameId={props.frame}
								onSelectFrame={selectFrame}
							/>
						))}
				</div>
			</div>
		</section>
	)
}

/**
 * One call of a batch, with its own heading and its own trace tree.
 *
 * A component rather than a loop body because `useTraceTree` is a hook and each
 * call needs its own — and its own frame-id namespace, so `?frame=` stays
 * unambiguous about which call it points at.
 */
function CallTracePanel(props: {
	call: SimulationCallResult
	label: string
	total: number
	trace: CallTrace | null
	tree: TxTraceTree.Node | null
	selectedId: string | undefined
	onSelect: (id: string) => void
	onIsolate: () => void
}): React.JSX.Element {
	const { tree } = props
	return (
		<div className="flex min-w-0 flex-col">
			<SimulateCallHeading
				call={props.call}
				label={props.label}
				total={props.total}
				onIsolate={props.onIsolate}
			/>
			{tree ? (
				<TxTraceTree
					trace={props.trace}
					tree={tree}
					label={null}
					toolbar
					selectedId={props.selectedId}
					onSelect={props.onSelect}
				/>
			) : (
				<PanelEmpty>No trace returned for this call.</PanelEmpty>
			)}
		</div>
	)
}

/**
 * The empty pane teaches the layout rather than apologising for being empty:
 * the shape of the result is visible, greyed, before anything has run.
 */
function SimulationEmptyState(props: {
	onExample: (kind: 'read' | 'failing') => void
	onEdit: () => void
}): React.JSX.Element {
	return (
		<section className="flex min-w-0 flex-col overflow-hidden rounded-[10px] border border-card-border bg-card-header">
			<div className="flex items-center gap-[8px] border-b border-card-border px-[16px] py-[10px]">
				<span className="text-[14px] font-medium text-content-dimmed">
					Nothing simulated yet
				</span>
			</div>
			<div className="pointer-events-none select-none opacity-40">
				<SimulateTabs
					tabs={[
						{ id: 'overview', label: 'Overview' },
						{ id: 'trace', label: 'Trace' },
						{ id: 'state', label: 'State' },
						{ id: 'events', label: 'Events' },
						{ id: 'gas', label: 'Gas' },
					]}
					value="overview"
					onChange={() => {}}
				/>
			</div>
			<div className="flex flex-col gap-[12px] px-[16px] py-[16px]">
				<p className="max-w-[520px] text-[12px] leading-[18px] text-tertiary">
					Fill in a call and run it, or replay an existing transaction by hash
					against the state of its parent block. Nothing is signed and nothing
					is broadcast.
				</p>
				{/* All secondary: the page already has one primary action, and a second
				    blue button competing with Run is a coin toss, not a hierarchy. */}
				<div className="flex flex-wrap gap-[8px]">
					<Button onClick={() => props.onExample('read')}>
						Read a token name
					</Button>
					<Button onClick={() => props.onExample('failing')}>
						See a failing transfer
					</Button>
					<Button onClick={props.onEdit}>Compose a call</Button>
				</div>
			</div>
		</section>
	)
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
