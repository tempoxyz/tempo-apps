import { useQuery } from '@tanstack/react-query'
import {
	createFileRoute,
	Link,
	notFound,
	redirect,
	rootRouteId,
} from '@tanstack/react-router'
import { Hex, Value } from 'ox'
import * as React from 'react'
import { Abis } from 'tempo.ts/viem'
import { decodeFunctionData, isHex, zeroAddress } from 'viem'
import { useChains } from 'wagmi'
import { Address as AddressLink } from '#comps/Address'
import { BlockCard } from '#comps/BlockCard'
import { DataGrid } from '#comps/DataGrid'
import { NotFound } from '#comps/NotFound'
import { Sections } from '#comps/Sections'
import { TruncatedHash } from '#comps/TruncatedHash'
import { TxEventDescription } from '#comps/TxEventDescription'
import { cx } from '#cva.config.ts'
import type { KnownEvent } from '#lib/domain/known-events'
import { DateFormatter, PriceFormatter } from '#lib/formatting.ts'
import { useMediaQuery } from '#lib/hooks'
import {
	type BlockIdentifier,
	type BlockTransaction,
	blockDetailQueryOptions,
} from '#lib/queries'
import { fetchLatestBlock } from '#lib/server/latest-block.server.ts'

const combinedAbi = Object.values(Abis).flat()

interface TransactionTypeResult {
	type: 'system' | 'sub-block' | 'fee-token' | 'regular'
	label: string
}

export const Route = createFileRoute('/_layout/block/$id')({
	component: RouteComponent,
	notFoundComponent: NotFound,
	loader: async ({ params, context }) => {
		const { id } = params

		if (id === 'latest') {
			const blockNumber = await fetchLatestBlock()
			throw redirect({ to: '/block/$id', params: { id: String(blockNumber) } })
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
	},
})

function RouteComponent() {
	const loaderData = Route.useLoaderData()

	const { data } = useQuery({
		...blockDetailQueryOptions(loaderData.blockRef),
		initialData: loaderData,
	})

	const { block, knownEventsByHash } = data

	const [chain] = useChains()
	const decimals = chain?.nativeCurrency.decimals ?? 18
	const symbol = chain?.nativeCurrency.symbol ?? 'UNIT'

	const transactions = React.useMemo(() => {
		if (!block?.transactions) return []
		return block.transactions
	}, [block?.transactions])

	const isMobile = useMediaQuery('(max-width: 799px)')
	const mode = isMobile ? 'stacked' : 'tabs'

	return (
		<div
			className={cx(
				'max-[800px]:flex max-[800px]:flex-col max-w-[800px]:pt-10 max-w-[800px]:pb-8 w-full',
				'grid w-full pt-20 pb-16 px-4 gap-[14px] min-w-0 grid-cols-[auto_1fr] min-[1240px]:max-w-[1280px]',
			)}
		>
			<BlockCard block={block} />
			<Sections
				mode={mode}
				sections={[
					{
						title: 'Transactions',
						totalItems: transactions.length,
						itemsLabel: 'txns',
						autoCollapse: false,
						content: (
							<TransactionsSection
								transactions={transactions}
								knownEventsByHash={knownEventsByHash}
								decimals={decimals}
								symbol={symbol}
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
	const { transactions, knownEventsByHash, decimals, symbol } = props

	const cols = [
		{ label: 'Index', align: 'start', width: '0.5fr' },
		{ label: 'Description', align: 'start', width: '3fr' },
		{ label: 'From', align: 'start', width: '1.5fr' },
		{ label: 'Hash', align: 'end', width: '1.5fr' },
		{ label: 'Fee', align: 'end', width: '1fr' },
		{ label: 'Total', align: 'end', width: '1fr' },
	] satisfies DataGrid.Props['columns']['stacked']

	return (
		<DataGrid
			columns={{ stacked: cols, tabs: cols }}
			items={() =>
				transactions.map((transaction, index) => {
					const transactionIndex =
						(transaction.transactionIndex ?? null) !== null
							? Number(transaction.transactionIndex) + 1
							: index + 1

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
							/>,
							txType.type === 'system' ? (
								<span key="from" className="text-tertiary">
									{txType.label}
								</span>
							) : (
								<AddressLink
									key="from"
									address={transaction.from}
									chars={4}
									className="text-accent press-down whitespace-nowrap"
								/>
							),
							transaction.hash ? (
								<Link
									key="hash"
									to="/receipt/$hash"
									params={{ hash: transaction.hash }}
									className="text-accent hover:underline press-down"
									title={transaction.hash}
								>
									<TruncatedHash hash={transaction.hash} minChars={6} />
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
			totalItems={transactions.length}
			page={1}
			isPending={false}
			itemsLabel="transactions"
			itemsPerPage={transactions.length}
			emptyState="No transactions were included in this block."
		/>
	)
}

interface TransactionsSectionProps {
	transactions: BlockTransaction[]
	knownEventsByHash: Record<Hex.Hex, KnownEvent[]>
	decimals: number
	symbol: string
}

function ExpandableEvents(props: { events: KnownEvent[] }) {
	const { events } = props
	const [expanded, setExpanded] = React.useState(false)

	if (events.length === 0) return null

	const [firstEvent, ...rest] = events
	const showAll = expanded || rest.length === 0

	return (
		<div className="inline-flex items-center gap-[8px] text-primary flex-wrap">
			<TxEventDescription
				event={firstEvent}
				className="flex flex-row items-center gap-[6px]"
			/>
			{showAll ? (
				rest.map((event, index) => (
					<TxEventDescription
						key={`${event.type}-${index}`}
						event={event}
						className="flex flex-row items-center gap-[6px]"
					/>
				))
			) : (
				<button
					type="button"
					onClick={() => setExpanded(true)}
					className="text-tertiary whitespace-nowrap cursor-pointer hover:text-secondary/70"
				>
					+{rest.length} more
				</button>
			)}
		</div>
	)
}

function TransactionDescription(props: TransactionDescriptionProps) {
	const { transaction, amountDisplay, knownEvents } = props

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

		if (decodedCall.functionName === 'finalizeStreams') {
			const ts = decodedCall.args?.[0]
			const asBigInt = typeof ts === 'bigint' ? ts : undefined
			return {
				title: 'Finalize reward streams',
				subtitle:
					asBigInt !== undefined
						? `at ${DateFormatter.format(asBigInt)} (unix ${asBigInt})`
						: undefined,
			}
		}

		if (decodedCall.functionName === 'executeBlock') {
			return {
				title: 'Execute orderbook block',
				subtitle: 'Settle stablecoin exchange batch',
			}
		}

		return {
			title: decodedCall.functionName
				? `${decodedCall.functionName}()`
				: (selector ?? 'Call'),
			subtitle: undefined,
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [decodedCall?.functionName, decodedCall?.args, selector, decodedCall])

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

			return <ExpandableEvents events={reorderedEvents} />
		}
		return <span className="text-primary">Deploy contract</span>
	}

	if (knownEvents && knownEvents.length > 0) {
		return <ExpandableEvents events={knownEvents} />
	}

	if (transaction.value === 0n)
		return (
			<div className="flex flex-col gap-[2px]">
				<span className="text-primary whitespace-nowrap">
					{title}{' '}
					<AddressLink
						address={transaction.to}
						chars={4}
						className="text-accent press-down"
					/>
				</span>
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
}

function getEstimatedFee(transaction: BlockTransaction) {
	const gasPrice =
		transaction.gasPrice ??
		('maxFeePerGas' in transaction && transaction.maxFeePerGas
			? transaction.maxFeePerGas
			: 0n)
	return gasPrice * (transaction.gas ?? 0n)
}
