import { useQuery } from '@tanstack/react-query'
import {
	createFileRoute,
	Link,
	notFound,
	redirect,
	rootRouteId,
	stripSearchParams,
} from '@tanstack/react-router'
import { Hex, Value } from 'ox'
import * as React from 'react'
import { decodeFunctionData, isHex, zeroAddress } from 'viem'
import { Abis } from 'viem/tempo'
import { useChains } from 'wagmi'
import * as z from 'zod/mini'
import { Address as AddressLink } from '#comps/Address'
import { BlockCard } from '#comps/BlockCard'
import { Breadcrumbs } from '#comps/Breadcrumbs'
import { DataGrid } from '#comps/DataGrid'
import { Midcut } from '#comps/Midcut'
import { NotFound } from '#comps/NotFound'
import { Sections } from '#comps/Sections'
import { TxEventDescription } from '#comps/TxEventDescription'
import { cx } from '#lib/css'
import {
	type KnownEvent,
	preferredEventsFilter,
} from '#lib/domain/known-events'
import { PriceFormatter } from '#lib/formatting.ts'
import { withLoaderTiming } from '#lib/profiling'
import { useMediaQuery } from '#lib/hooks'
import {
	type BlockIdentifier,
	type BlockTransaction,
	blockDetailQueryOptions,
	blockKnownEventsQueryOptions,
	TRANSACTIONS_PER_PAGE,
} from '#lib/queries'
import { fetchLatestBlock } from '#lib/server/latest-block.server.ts'

const defaultSearchValues = { page: 1 } as const

const combinedAbi = Object.values(Abis).flat()

interface TransactionTypeResult {
	type: 'system' | 'sub-block' | 'fee-token' | 'regular'
	label: string
}

export const Route = createFileRoute('/_layout/block/$id')({
	component: RouteComponent,
	notFoundComponent: ({ data }) => (
		<NotFound
			title="Block Not Found"
			message="The block does not exist or could not be found."
			data={data as NotFound.NotFoundData}
		/>
	),
	validateSearch: z.object({
		page: z.prefault(z.coerce.number(), defaultSearchValues.page),
	}),
	search: {
		middlewares: [stripSearchParams(defaultSearchValues)],
	},
	loader: ({ params, context }) =>
		withLoaderTiming('/_layout/block/$id', async () => {
			const { id } = params

			if (id === 'latest') {
				const blockNumber = await fetchLatestBlock()
				throw redirect({
					to: '/block/$id',
					params: { id: String(blockNumber) },
				})
			}

			try {
				let blockRef: BlockIdentifier
				if (isHex(id)) {
					Hex.assert(id)
					blockRef = { kind: 'hash', blockHash: id }
				} else {
					const parsedNumber = Number(id)
					if (!Number.isSafeInteger(parsedNumber)) throw notFound()
					blockRef = { kind: 'number', blockNumber: BigInt(parsedNumber) }
				}

				return await context.queryClient.ensureQueryData(
					blockDetailQueryOptions(blockRef),
				)
			} catch (error) {
				console.error(error)
				throw notFound({
					routeId: rootRouteId,
					data: {
						error: error instanceof Error ? error.message : 'Invalid block ID',
					},
				})
			}
		}),
})

function RouteComponent() {
	const { page } = Route.useSearch()
	const loaderData = Route.useLoaderData()

	const { data: blockData } = useQuery({
		...blockDetailQueryOptions(loaderData.blockRef),
		initialData: loaderData,
	})

	const { block } = blockData ?? loaderData

	const [chain] = useChains()
	const decimals = chain?.nativeCurrency.decimals ?? 18
	const symbol = chain?.nativeCurrency.symbol ?? 'UNIT'

	const allTransactions = block?.transactions ?? []
	const startIndex = (page - 1) * TRANSACTIONS_PER_PAGE
	const transactions = allTransactions.slice(
		startIndex,
		startIndex + TRANSACTIONS_PER_PAGE,
	)

	// Batch fetch known events for current page only
	const knownEventsQuery = useQuery({
		...blockKnownEventsQueryOptions(block.number ?? 0n, transactions, page),
		enabled: !!block.number && transactions.length > 0,
	})
	const { data: knownEventsByHash, isLoading: knownEventsLoading } =
		knownEventsQuery

	const isMobile = useMediaQuery('(max-width: 799px)')
	const mode = isMobile ? 'stacked' : 'tabs'

	return (
		<div
			className={cx(
				'max-[800px]:flex max-[800px]:flex-col max-[800px]:pt-10 max-[800px]:pb-8 w-full',
				'grid w-full pt-20 pb-16 px-4 gap-[14px] min-w-0 grid-cols-[auto_1fr] min-[1240px]:max-w-[1280px]',
			)}
		>
			<Breadcrumbs className="col-span-full" />
			<div className="self-start max-[800px]:self-stretch">
				<BlockCard block={block} />
			</div>
			<Sections
				mode={mode}
				sections={[
					{
						title: 'Transactions',
						totalItems: allTransactions.length,
						itemsLabel: 'txns',
						autoCollapse: false,
						content: (
							<TransactionsSection
								transactions={transactions}
								knownEventsByHash={knownEventsByHash ?? {}}
								knownEventsLoading={knownEventsLoading}
								decimals={decimals}
								symbol={symbol}
								page={page}
								totalItems={allTransactions.length}
								startIndex={startIndex}
							/>
						),
					},
				]}
			/>
		</div>
	)
}

function getTransactionType(
	transaction: BlockTransaction,
): TransactionTypeResult {
	// System transactions have from address as 0x0000...0000
	if (transaction.from === zeroAddress) {
		const systemTxNames: Record<string, string> = {
			'0x3000000000000000000000000000000000000000': 'Rewards Registry',
			'0xfeec000000000000000000000000000000000000': 'Fee Manager',
			'0xdec0000000000000000000000000000000000000': 'Stablecoin Exchange',
			'0x0000000000000000000000000000000000000000': 'Subblock Metadata',
		}
		const to = transaction.to || ''
		const name = systemTxNames[to] || 'System'
		return { type: 'system', label: name }
	}

	// Check for sub-block transactions (nonce starts with 0x5b)
	const nonceHex = transaction.nonce?.toString(16).padStart(8, '0') || ''
	if (nonceHex.startsWith('5b'))
		return { type: 'sub-block', label: 'Sub-block' }

	// Check for fee token transactions (type 0x76)
	// @ts-expect-error - check transaction type field
	if (transaction.type === '0x76' || transaction.type === 118) {
		return { type: 'fee-token', label: 'Fee Token' }
	}

	return { type: 'regular', label: 'Regular' }
}

const GAS_DECIMALS = 18

function TransactionsSection(props: TransactionsSectionProps) {
	const {
		transactions,
		knownEventsByHash,
		knownEventsLoading,
		decimals,
		symbol,
		page,
		totalItems,
		startIndex,
	} = props

	const cols = [
		{ label: 'Index', align: 'start', width: '0.5fr' },
		{ label: 'Description', align: 'start', width: '3fr' },
		{ label: 'From', align: 'end', width: '1fr' },
		{ label: 'Hash', align: 'end', width: '1fr' },
		{ label: 'Fee', align: 'end', width: '0.5fr' },
		{ label: 'Total', align: 'end', width: '0.5fr' },
	] satisfies DataGrid.Props['columns']['stacked']

	return (
		<DataGrid
			columns={{ stacked: cols, tabs: cols }}
			items={() =>
				transactions.map((transaction, index) => {
					const transactionIndex =
						(transaction.transactionIndex ?? null) !== null
							? Number(transaction.transactionIndex) + 1
							: startIndex + index + 1

					const txType = getTransactionType(transaction)
					const knownEvents = transaction.hash
						? knownEventsByHash[transaction.hash]
						: undefined

					const fee = getEstimatedFee(transaction)
					const feeValue = fee ? Number(Value.format(fee, GAS_DECIMALS)) : 0
					const feeDisplay =
						feeValue > 0 ? PriceFormatter.format(feeValue) : '—'

					const txValue = transaction.value ?? 0n
					const totalValue = Number(Value.format(txValue, decimals))
					const totalDisplay =
						totalValue > 0 ? PriceFormatter.format(totalValue) : '—'

					const amountDisplay = PriceFormatter.formatNativeAmount(
						txValue,
						decimals,
						symbol,
					)

					return {
						cells: [
							<span key="index" className="text-tertiary tabular-nums">
								[{transactionIndex}]
							</span>,
							<TransactionDescription
								key="desc"
								transaction={transaction}
								amountDisplay={amountDisplay}
								knownEvents={knownEvents}
								loading={knownEventsLoading}
							/>,
							txType.type === 'system' ? (
								<span
									key="from"
									className="text-tertiary w-full truncate text-right"
								>
									{txType.label}
								</span>
							) : (
								<AddressLink
									key="from"
									address={transaction.from}
									chars={1}
									align="end"
								/>
							),
							transaction.hash ? (
								<Link
									key="hash"
									to="/receipt/$hash"
									params={{ hash: transaction.hash }}
									className="text-accent hover:underline press-down w-full"
									title={transaction.hash}
								>
									<Midcut value={transaction.hash} prefix="0x" align="end" />
								</Link>
							) : (
								<span key="hash" className="text-tertiary">
									—
								</span>
							),
							<span key="fee" className="text-tertiary">
								{feeDisplay}
							</span>,
							<span
								key="total"
								className={totalValue > 0 ? 'text-primary' : 'text-tertiary'}
							>
								{totalDisplay}
							</span>,
						],
						link: transaction.hash
							? {
									href: `/tx/${transaction.hash}`,
									title: `View transaction ${transaction.hash}`,
								}
							: undefined,
					}
				})
			}
			totalItems={totalItems}
			page={page}
			itemsLabel="transactions"
			itemsPerPage={TRANSACTIONS_PER_PAGE}
			emptyState="No transactions were included in this block."
		/>
	)
}

interface TransactionsSectionProps {
	transactions: BlockTransaction[]
	knownEventsByHash: Record<string, KnownEvent[]>
	knownEventsLoading: boolean
	decimals: number
	symbol: string
	page: number
	totalItems: number
	startIndex: number
}

function TransactionDescription(props: TransactionDescriptionProps) {
	const { transaction, amountDisplay, knownEvents, loading } = props

	const decodedCall = React.useMemo(() => {
		const data = transaction.input
		if (!data || data === '0x') return undefined
		try {
			return decodeFunctionData({ abi: combinedAbi, data })
		} catch {
			return undefined
		}
	}, [transaction.input])

	const selector = transaction.input?.slice(0, 10)

	const { title, subtitle } = React.useMemo(() => {
		if (!decodedCall)
			return {
				title: selector ?? 'Call',
				subtitle: undefined,
			}

		return {
			title: decodedCall.functionName
				? `${decodedCall.functionName}()`
				: (selector ?? 'Call'),
			subtitle: undefined,
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [decodedCall?.functionName, decodedCall?.args, selector, decodedCall])

	if (loading && !knownEvents) {
		return (
			<span className="text-tertiary" title="Loading…">
				…
			</span>
		)
	}

	// Contract creation takes priority - check before known events
	// (contract constructors often emit Transfer events that would otherwise show)
	if (!transaction.to) {
		if (knownEvents && knownEvents.length > 0) {
			// Prioritize "create token" events for contract deployments as they're more descriptive
			const tokenCreationEvent = knownEvents.find(
				(e) => e.type === 'create token',
			)
			const primaryEvent = tokenCreationEvent ?? knownEvents[0]
			const otherEvents = knownEvents.filter((e) => e !== primaryEvent)
			const reorderedEvents = [primaryEvent, ...otherEvents]

			return (
				<TxEventDescription.ExpandGroup
					events={reorderedEvents}
					limitFilter={preferredEventsFilter}
				/>
			)
		}
		return <span className="text-primary">Deploy contract</span>
	}

	// knownEvents already has decoded calls prepended (from the loader)
	if (knownEvents && knownEvents.length > 0)
		return (
			<TxEventDescription.ExpandGroup
				events={knownEvents}
				limitFilter={preferredEventsFilter}
			/>
		)

	if (transaction.value === 0n)
		return (
			<div className="flex flex-col gap-[2px] flex-1">
				<div className="text-primary flex-1 flex-nowrap flex gap-[8px]">
					<div>{title} </div>
					<AddressLink address={transaction.to} chars={4} />
				</div>
				{subtitle && (
					<span className="text-base-content-secondary text-[12px]">
						{subtitle}
					</span>
				)}
			</div>
		)

	return (
		<span className="text-primary whitespace-nowrap">
			Send <span className="text-base-content-positive">{amountDisplay}</span>{' '}
			to{' '}
			<AddressLink
				address={transaction.to}
				chars={4}
				className="text-accent press-down"
			/>
		</span>
	)
}

interface TransactionDescriptionProps {
	transaction: BlockTransaction
	amountDisplay: string
	knownEvents?: KnownEvent[]
	loading?: boolean
}

function getEstimatedFee(transaction: BlockTransaction) {
	const gasPrice =
		transaction.gasPrice ??
		('maxFeePerGas' in transaction && transaction.maxFeePerGas
			? transaction.maxFeePerGas
			: 0n)
	return gasPrice * (transaction.gas ?? 0n)
}
