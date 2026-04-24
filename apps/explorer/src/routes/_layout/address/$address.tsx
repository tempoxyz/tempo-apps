import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
	ClientOnly,
	createFileRoute,
	Link,
	notFound,
	redirect,
	rootRouteId,
	stripSearchParams,
	useLocation,
	useNavigate,
} from '@tanstack/react-router'
import * as Address from 'ox/Address'
import * as Hex from 'ox/Hex'
import * as React from 'react'
import { formatUnits } from 'viem'
import type { Config } from 'wagmi'
import { Actions } from 'wagmi/tempo'
import * as z from 'zod/mini'
import { Amount } from '#comps/Amount'
import { AccountCard } from '#comps/AccountCard'
import { AddressCsvExportButton } from '#comps/AddressCsvExportButton'
import { WalletActions } from '#comps/WalletActions'
import { AddressCell } from '#comps/AddressCell'
import { AmountCell, BalanceCell } from '#comps/AmountCell'
import { BreadcrumbsSlot } from '#comps/Breadcrumbs'
import { ContractTabContent, InteractTabContent } from '#comps/Contract'
import { Tip20TokenTabContent } from '#comps/Tip20ContractInfo'
import { DataGrid } from '#comps/DataGrid'
import { Pagination } from '#comps/Pagination'
import { Midcut } from 'midcut'
import { NotFound } from '#comps/NotFound'
import { Sections } from '#comps/Sections'
import {
	TimeColumnHeader,
	type TimeFormat,
	useTimeFormat,
} from '#comps/TimeFormat'
import { TimestampCell } from '#comps/TimestampCell'
import { TokenIcon } from '#comps/TokenIcon'
import { useTokenListMembership } from '#comps/TokenListMembership'
import { TransactionCell } from '#comps/TransactionCell'
import {
	TransactionDescription,
	TransactionTimestamp,
} from '#comps/TxTransactionRow'
import { TxEventDescription } from '#comps/TxEventDescription'
import type { KnownEvent } from '#lib/domain/known-events'
import { TransactionFilters } from '#comps/TransactionFilters'
import { cx } from '#lib/css'
import {
	type AssetData,
	balancesQueryOptions,
	calculateTotalHoldings,
	useBalancesData,
} from '#lib/address-balances'
import { normalizeSearchInput } from '#lib/tempo-address'
import { type AccountType, getAccountType } from '#lib/account'
import {
	type ContractSource,
	useContractSourceQueryOptions,
} from '#lib/domain/contract-source'
import {
	type ContractInfo,
	extractContractAbi,
	getContractBytecode,
	getContractInfo,
} from '#lib/domain/contracts'
import * as Tip20 from '#lib/domain/tip20'
import { DateFormatter, HexFormatter, PriceFormatter } from '#lib/formatting'
import { useIsMounted, useMediaQuery } from '#lib/hooks'
import {
	buildAddressDescription,
	buildAddressOgImageUrl,
	buildTokenDescription,
	buildTokenOgImageUrl,
} from '#lib/og'
import { withLoaderTiming } from '#lib/profiling'
import {
	type HistoryResponse,
	historySourcesForAddress,
	historyQueryOptions,
} from '#lib/queries/account'
import { transfersQueryOptions, holdersQueryOptions } from '#lib/queries/tokens'
import { fetchAddressOgMeta } from '#lib/server/tempo-queries'
import { getApiUrl } from '#lib/env.ts'
import { getFeeTokenForChain } from '#lib/tokenlist'
import { getTempoChain, getWagmiConfig } from '#wagmi.config.ts'
import type { EnrichedTransaction } from '#routes/api/address/history/$address.ts'
import ChevronFirst from '~icons/lucide/chevron-first'
import ChevronLast from '~icons/lucide/chevron-last'
import ChevronLeft from '~icons/lucide/chevron-left'
import ChevronRight from '~icons/lucide/chevron-right'
import EyeIcon from '~icons/lucide/eye'
import EyeOffIcon from '~icons/lucide/eye-off'
import XIcon from '~icons/lucide/x'

type TokenMetadata = Actions.token.getMetadata.ReturnValue

const TEMPO_CHAIN_ID = getTempoChain().id
const TEMPO_FEE_TOKEN = getFeeTokenForChain(TEMPO_CHAIN_ID)

const defaultSearchValues = {
	page: 1,
	limit: 10,
	tab: 'transactions',
	live: false,
} as const

const ASSETS_PER_PAGE = 10

const allTabs = [
	'transactions',
	'holdings',
	'transfers',
	'holders',
	'token',
	'contract',
	'interact',
] as const

type TabValue = (typeof allTabs)[number]

const TabSchema = z.prefault(
	z.pipe(
		z.string(),
		z.transform((val): TabValue => {
			if (val === 'history') return 'transactions'
			if (val === 'assets') return 'holdings'
			if (allTabs.includes(val as TabValue)) return val as TabValue
			return 'transactions'
		}),
	),
	defaultSearchValues.tab,
)

export const Route = createFileRoute('/_layout/address/$address')({
	component: RouteComponent,
	beforeLoad: ({ params, search }) => {
		const normalized = normalizeSearchInput(params.address)
		if (normalized !== params.address) {
			throw redirect({
				to: '/address/$address',
				params: { address: normalized },
				search,
			})
		}
	},
	notFoundComponent: ({ data }) => (
		<NotFound
			title="Address Not Found"
			message="The address is invalid or could not be found."
			data={data as NotFound.NotFoundData}
		/>
	),
	validateSearch: z.object({
		page: z.prefault(z.number(), defaultSearchValues.page),
		limit: z.prefault(
			z.pipe(
				z.number(),
				z.transform((val) => Math.min(100, val)),
			),
			defaultSearchValues.limit,
		),
		tab: TabSchema,
		live: z.prefault(z.boolean(), false),
		a: z.optional(z.string()),
		status: z.optional(z.enum(['success', 'reverted'])),
		dir: z.optional(z.enum(['sent', 'received'])),
		period: z.optional(z.enum(['24h', '7d'])),
		voucher: z.optional(
			z.object({
				final_voucher: z.optional(z.string()),
				packet_size: z.optional(z.coerce.number()),
				number: z.optional(z.coerce.number()),
			}),
		),
	}),
	search: {
		middlewares: [stripSearchParams(defaultSearchValues)],
	},
	loaderDeps: ({
		search: { page, limit, live, tab, a, status, dir, period },
	}) => ({
		page,
		limit,
		live,
		tab,
		a,
		status,
		dir,
		period,
	}),
	loader: ({
		deps: { page, limit, live, tab, a, status, dir, period },
		params,
		context,
	}) =>
		withLoaderTiming('/_layout/address/$address', async () => {
			const { address } = params
			// Only throw notFound for truly invalid addresses
			if (!Address.validate(address))
				throw notFound({
					routeId: rootRouteId,
					data: { error: 'Invalid address format' },
				})

			const offset = (page - 1) * limit
			const account =
				a && Address.validate(a) ? (a as Address.Address) : undefined

			// Tab-aware loading: only fetch data needed for the active tab
			const isTransactionsTab = tab === 'transactions'
			const isHoldingsTab = tab === 'holdings'
			const knownContractInfo = getContractInfo(address)
			const isKnownTokenAddress =
				Tip20.isTip20Address(address) || knownContractInfo?.category === 'token'

			// Add timeout to prevent SSR from hanging on slow queries
			const QUERY_TIMEOUT_MS = 3_000
			const timeout = <T,>(
				promise: Promise<T>,
				ms: number,
			): Promise<T | undefined> =>
				Promise.race([
					promise,
					new Promise<undefined>((r) => setTimeout(() => r(undefined), ms)),
				])

			const config = getWagmiConfig()

			// Always fetch bytecode (needed for account type detection)
			const contractBytecodePromise = timeout(
				getContractBytecode(address).catch((error) => {
					console.error('[loader] Failed to get bytecode:', error)
					return undefined
				}),
				QUERY_TIMEOUT_MS,
			)

			// Try to fetch token metadata (non-blocking, used for isToken detection)
			const tokenMetadataPromise = timeout(
				Actions.token
					.getMetadata(config as Config, { token: address })
					.catch(() => null),
				QUERY_TIMEOUT_MS,
			)

			const historySources = historySourcesForAddress(
				address as Address.Address,
			)

			let after: number | undefined
			if (period === '24h') after = Math.floor(Date.now() / 1000) - 86400
			else if (period === '7d')
				after = Math.floor(Date.now() / 1000) - 7 * 86400

			const transactionsQuery = historyQueryOptions({
				address,
				page,
				limit,
				offset,
				sources: historySources,
				status,
				include:
					dir === 'sent' ? 'sent' : dir === 'received' ? 'received' : 'all',
				after,
			})

			// Only block on transactions if transactions tab is active.
			// Select history sources from address type so SSR and client stay aligned.
			const transactionsPromise = isTransactionsTab
				? timeout(
						context.queryClient
							.ensureQueryData(transactionsQuery)
							.catch((error) => {
								console.error('Fetch transactions error:', error)
								context.queryClient.removeQueries({
									queryKey: transactionsQuery.queryKey,
									exact: true,
								})
								return undefined
							}),
						QUERY_TIMEOUT_MS,
					)
				: Promise.resolve(undefined)

			const balancesPromise =
				isHoldingsTab && !isKnownTokenAddress
					? timeout(
							context.queryClient
								.ensureQueryData(balancesQueryOptions(address))
								.catch((error) => {
									console.error('Fetch balances error:', error)
									return undefined
								}),
							QUERY_TIMEOUT_MS,
						)
					: Promise.resolve(undefined)

			// Fetch OG metadata (txCount + timestamps) via direct TIDX query
			const ogMetaPromise = timeout(
				fetchAddressOgMeta(address, TEMPO_CHAIN_ID).catch(() => undefined),
				QUERY_TIMEOUT_MS,
			)

			const [
				contractBytecode,
				transactionsData,
				balancesResult,
				tokenMetadata,
				ogMeta,
			] = await Promise.all([
				contractBytecodePromise,
				transactionsPromise,
				balancesPromise,
				tokenMetadataPromise,
				ogMetaPromise,
			])

			const accountType = getAccountType(contractBytecode)

			// check if it's a known contract from our registry
			const contractInfo = knownContractInfo
			const isKnownToken = isKnownTokenAddress
			const isToken =
				isKnownToken || (tokenMetadata !== null && tokenMetadata !== undefined)
			// Discard balance results for token addresses to avoid stale/misleading data
			const balancesData = isToken ? undefined : balancesResult
			const contractSource: ContractSource | undefined = undefined

			return {
				live,
				address,
				page,
				limit,
				offset,
				account,
				accountType,
				isToken,
				tokenMetadata,
				contractInfo,
				contractSource,
				transactionsData,
				balancesData,
				ogMeta,
			}
		}),
	head: async ({ params, loaderData }) => {
		// Fallback to ogMeta.accountType only for contracts (receipts-proven)
		// since 'empty' is the correct type for regular EOAs
		let accountType = loaderData?.accountType ?? 'empty'
		if (
			accountType === 'empty' &&
			loaderData?.ogMeta?.accountType === 'contract'
		) {
			accountType = 'contract'
		}
		const isToken = loaderData?.isToken ?? false
		const tokenMeta = loaderData?.tokenMetadata

		const label = isToken
			? 'Token'
			: accountType === 'contract'
				? 'Contract'
				: accountType === 'account'
					? 'Account'
					: 'Address'
		const title = `${label} ${HexFormatter.truncate(params.address as Hex.Hex)} ⋅ Tempo Explorer`

		let description: string
		let ogImageUrl: string

		if (isToken && tokenMeta) {
			const decimals = tokenMeta.decimals ?? 18
			const totalSupply = tokenMeta.totalSupply
				? Number.parseFloat(formatUnits(tokenMeta.totalSupply, decimals))
				: 0

			const formatSupply = (n: number): string => {
				if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`
				if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`
				if (n >= 1e3)
					return n.toLocaleString('en-US', { maximumFractionDigits: 0 })
				return n.toFixed(2)
			}

			const supply = formatSupply(totalSupply)
			const chainId = getTempoChain().id

			description = buildTokenDescription({
				name: tokenMeta.name ?? '—',
				symbol: tokenMeta.symbol,
				supply,
			})

			ogImageUrl = buildTokenOgImageUrl({
				address: params.address,
				chainId,
				name: tokenMeta.name,
				symbol: tokenMeta.symbol,
				supply,
			})
		} else {
			const txCount = loaderData?.ogMeta?.txCount ?? 0
			let lastActive: string | undefined
			let created: string | undefined
			let holdings = '—'

			if (loaderData?.balancesData?.balances) {
				const totalValue = calculateTotalHoldings(
					loaderData.balancesData.balances.map((b) => ({
						address: b.token,
						metadata: {
							decimals: b.decimals,
							currency: b.currency,
						},
						balance: BigInt(b.balance),
					})),
				)
				if (totalValue && totalValue > 0) {
					holdings = PriceFormatter.format(totalValue, { format: 'short' })
				}
			}

			if (loaderData?.ogMeta?.lastActivityTimestamp) {
				lastActive = DateFormatter.formatTimestampForOg(
					BigInt(loaderData.ogMeta.lastActivityTimestamp),
				).date
			}

			if (loaderData?.ogMeta?.createdTimestamp) {
				created = DateFormatter.formatTimestampForOg(
					BigInt(loaderData.ogMeta.createdTimestamp),
				).date
			}

			description = buildAddressDescription(
				{ holdings, txCount },
				params.address,
			)

			ogImageUrl = buildAddressOgImageUrl({
				address: params.address,
				holdings,
				txCount,
				accountType,
				lastActive,
				created,
				contractName: loaderData?.contractInfo?.name,
			})
		}

		return {
			title,
			meta: [
				{ title },
				{ property: 'og:title', content: title },
				{ property: 'og:description', content: description },
				{ name: 'twitter:description', content: description },
				{ property: 'og:image', content: ogImageUrl },
				{ property: 'og:image:type', content: 'image/webp' },
				{ property: 'og:image:width', content: '1200' },
				{ property: 'og:image:height', content: '630' },
				{ name: 'twitter:card', content: 'summary_large_image' },
				{ name: 'twitter:image', content: ogImageUrl },
			],
		}
	},
})

function RouteComponent() {
	const navigate = useNavigate()
	const location = useLocation()
	const { address } = Route.useParams()
	const { page, tab, live, limit, status, dir, period } = Route.useSearch()
	const {
		accountType,
		isToken,
		tokenMetadata,
		account,
		contractInfo,
		contractSource,
		transactionsData,
		balancesData,
	} = Route.useLoaderData()

	Address.assert(address)

	const { data: addressMetadata } = useQuery({
		queryKey: ['address-metadata', address],
		queryFn: () => fetchAddressMetadata(address),
		staleTime: 30_000,
	})

	const hash = location.hash

	// Track which hash we've already redirected for (prevents re-redirect when
	// user manually switches tabs, but allows redirect for new hash values)
	const redirectedForHashRef = React.useRef<string | null>(null)

	const resolvedAccountType = addressMetadata?.accountType ?? accountType
	const isContract = resolvedAccountType === 'contract'

	React.useEffect(() => {
		// Only redirect if:
		// 1. We have a hash
		// 2. Address is a contract
		// 3. Haven't already redirected for this specific hash
		if (!hash || !isContract || redirectedForHashRef.current === hash) return

		// Determine which tab the hash should navigate to
		const isSourceFileHash = hash.startsWith('source-file-')
		const targetTab = isSourceFileHash ? 'contract' : 'interact'
		if (tab === targetTab) return

		redirectedForHashRef.current = hash
		navigate({
			to: '.',
			search: { page: 1, tab: targetTab, limit },
			hash,
			replace: true,
			resetScroll: false,
		})
	}, [hash, isContract, tab, navigate, limit])

	// Build visible tabs based on address type
	const isTip20 = Tip20.isTip20Address(address)
	const visibleTabs: TabValue[] = React.useMemo(() => {
		const tabs: TabValue[] = ['transactions']
		if (!isTip20) {
			tabs.push('holdings')
		}
		if (isToken) {
			tabs.push('transfers', 'holders')
		}
		if (isTip20) {
			tabs.push('token')
		}
		if (isContract) {
			tabs.push('contract', 'interact')
		}
		return tabs
	}, [isToken, isTip20, isContract])

	const setActiveSection = React.useCallback(
		(newIndex: number) => {
			const newTab = visibleTabs[newIndex] ?? 'transactions'
			navigate({
				to: '.',
				search: (prev) => ({ ...prev, page: 1, tab: newTab }),
				resetScroll: false,
			})
		},
		[navigate, visibleTabs],
	)

	const setStatus = React.useCallback(
		(newStatus: 'success' | 'reverted' | undefined) => {
			navigate({
				to: '.',
				search: (prev) => ({ ...prev, page: 1, status: newStatus }),
				resetScroll: false,
			})
		},
		[navigate],
	)

	const setPeriod = React.useCallback(
		(newPeriod: '24h' | '7d' | undefined) => {
			navigate({
				to: '.',
				search: (prev) => ({ ...prev, page: 1, period: newPeriod }),
				resetScroll: false,
			})
		},
		[navigate],
	)

	const activeSection =
		visibleTabs.indexOf(tab) !== -1 ? visibleTabs.indexOf(tab) : 0

	const isHoldingsTabActive = tab === 'holdings'

	const { data: assetsData, isLoading: assetsLoading } = useBalancesData(
		address,
		balancesData,
		!isToken && (isHoldingsTabActive || balancesData !== undefined),
	)
	const historySources = React.useMemo(
		() => historySourcesForAddress(address),
		[address],
	)

	// Prefetch non-active tabs' data after a delay to avoid TIDX query storms
	const queryClient = useQueryClient()
	const prefetchedRef = React.useRef<string | null>(null)
	React.useEffect(() => {
		if (prefetchedRef.current === address) return
		prefetchedRef.current = address

		const timer = setTimeout(() => {
			if (tab !== 'transactions') {
				queryClient.prefetchQuery(
					historyQueryOptions({
						address,
						page: 1,
						limit,
						offset: 0,
						sources: historySources,
						status,
						include:
							dir === 'sent' ? 'sent' : dir === 'received' ? 'received' : 'all',
						after:
							period === '24h'
								? Math.floor(Date.now() / 1000) - 86400
								: period === '7d'
									? Math.floor(Date.now() / 1000) - 7 * 86400
									: undefined,
					}),
				)
			}
			if (tab !== 'holdings' && !isToken) {
				queryClient.prefetchQuery(balancesQueryOptions(address))
			}
		}, 2_000)

		return () => clearTimeout(timer)
	}, [
		address,
		tab,
		limit,
		queryClient,
		isToken,
		historySources,
		status,
		dir,
		period,
	])

	return (
		<div
			className={cx(
				'max-[800px]:flex max-[800px]:flex-col max-[800px]:pt-10 max-[800px]:pb-8 w-full',
				'grid w-full pt-20 pb-16 px-4 gap-3.5 min-w-0 grid-cols-[auto_1fr] min-[1240px]:max-w-7xl',
			)}
		>
			<BreadcrumbsSlot className="col-span-full" />
			<AccountCardWithTimestamps
				address={address}
				assetsData={assetsData}
				accountType={accountType}
				addressMetadata={addressMetadata}
				isToken={isToken}
				tokenMetadata={tokenMetadata}
			/>
			<SectionsWrapper
				address={address}
				page={page}
				limit={limit}
				activeSection={activeSection}
				onSectionChange={setActiveSection}
				contractInfo={contractInfo}
				contractSource={contractSource}
				initialData={transactionsData}
				assetsData={assetsData}
				assetsLoading={assetsLoading}
				live={live}
				isContract={isContract}
				isToken={isToken}
				tokenMetadata={tokenMetadata}
				account={account}
				visibleTabs={visibleTabs}
				status={status}
				onStatusChange={setStatus}
				dir={dir}
				period={period}
				onPeriodChange={setPeriod}
			/>
		</div>
	)
}

async function fetchAddressMetadata(address: Address.Address) {
	const response = await fetch(getApiUrl(`/api/address/metadata/${address}`), {
		headers: { 'Content-Type': 'application/json' },
	})
	if (!response.ok) throw new Error('Failed to fetch address metadata')
	return response.json() as Promise<{
		accountType: AccountType
		txCount: number | null
		lastActivityTimestamp: number | null
		createdTimestamp: number | null
	}>
}

type ContractCreationResponse = {
	creation: {
		blockNumber: string
		timestamp: string
		hash: Hex.Hex | null
		from: Address.Address | null
		to: Address.Address | null
		value: string | null
		status: 'success' | 'reverted' | null
		gasUsed: string | null
		effectiveGasPrice: string | null
	} | null
	error: string | null
}

async function fetchContractCreation(
	address: Address.Address,
): Promise<ContractCreationResponse> {
	const response = await fetch(`/api/contract/creation/${address}`)
	return response.json() as Promise<ContractCreationResponse>
}

function buildContractCreationTransaction(params: {
	address: Address.Address
	creation: NonNullable<ContractCreationResponse['creation']>
}): EnrichedTransaction | null {
	const { address, creation } = params

	if (!creation.hash || !creation.from) return null

	const blockNumber = parseOptionalBigInt(creation.blockNumber) ?? 0n
	const timestamp = parseOptionalBigInt(creation.timestamp) ?? 0n
	const value = parseOptionalBigInt(creation.value) ?? 0n
	const gasUsed = parseOptionalBigInt(creation.gasUsed) ?? 0n
	const effectiveGasPrice =
		parseOptionalBigInt(creation.effectiveGasPrice) ?? 0n

	return {
		hash: creation.hash,
		blockNumber: Hex.fromNumber(blockNumber),
		timestamp: Number(timestamp),
		from: Address.checksum(creation.from),
		to: creation.to ? Address.checksum(creation.to) : null,
		value: Hex.fromNumber(value),
		status: creation.status ?? 'success',
		gasUsed: Hex.fromNumber(gasUsed),
		effectiveGasPrice: Hex.fromNumber(effectiveGasPrice),
		knownEvents: [
			{
				type: 'contract creation',
				parts: [
					{ type: 'action', value: 'Deploy Contract' },
					{ type: 'account', value: Address.checksum(address) },
				],
			},
		],
	}
}

function AccountCardWithTimestamps(props: {
	address: Address.Address
	assetsData: AssetData[]
	accountType?: AccountType
	addressMetadata?: Awaited<ReturnType<typeof fetchAddressMetadata>>
	isToken?: boolean
	tokenMetadata?: TokenMetadata | null
}) {
	const {
		address,
		assetsData,
		accountType: initialAccountType,
		addressMetadata,
		isToken,
		tokenMetadata,
	} = props

	const resolvedAccountType = addressMetadata?.accountType ?? initialAccountType
	const isContract = resolvedAccountType === 'contract'
	const missingCreated = !addressMetadata?.createdTimestamp

	// For contracts without a createdTimestamp from metadata (0-tx contracts),
	// fall back to binary-search contract creation lookup
	const { data: contractCreation } = useQuery({
		queryKey: ['contract-creation', address],
		queryFn: () => fetchContractCreation(address),
		enabled: isContract && missingCreated,
		staleTime: 60_000,
	})

	const createdTimestamp = addressMetadata?.createdTimestamp
		? BigInt(addressMetadata.createdTimestamp)
		: contractCreation?.creation?.timestamp
			? BigInt(contractCreation.creation.timestamp)
			: undefined

	const isTip20 = Tip20.isTip20Address(address)
	const { isTokenListed } = useTokenListMembership()
	const totalValue = React.useMemo(
		() =>
			calculateTotalHoldings(assetsData, {
				isTokenListed: (tokenAddress) =>
					isTokenListed(TEMPO_CHAIN_ID, tokenAddress),
			}),
		[assetsData, isTokenListed],
	)

	return (
		<div className="min-[800px]:self-start flex flex-col gap-2">
			<AccountCard
				address={address}
				createdTimestamp={createdTimestamp}
				lastActivityTimestamp={
					addressMetadata?.lastActivityTimestamp
						? BigInt(addressMetadata.lastActivityTimestamp)
						: undefined
				}
				totalValue={totalValue}
				hideHoldings={isTip20}
				accountType={resolvedAccountType}
				isToken={isToken}
				tokenName={tokenMetadata?.name}
			/>
			{isToken && (
				<ClientOnly fallback={null}>
					<WalletActions
						address={address}
						symbol={tokenMetadata?.symbol}
						decimals={tokenMetadata?.decimals}
					/>
				</ClientOnly>
			)}
		</div>
	)
}

function SectionsWrapper(props: {
	address: Address.Address
	page: number
	limit: number
	activeSection: number
	onSectionChange: (index: number) => void
	contractInfo: ContractInfo | undefined
	contractSource?: ContractSource | undefined
	initialData: HistoryResponse | undefined
	assetsData: AssetData[]
	assetsLoading: boolean
	live: boolean
	isContract: boolean
	isToken: boolean
	tokenMetadata?: TokenMetadata | null
	account?: Address.Address
	visibleTabs: TabValue[]
	status?: 'success' | 'reverted' | undefined
	onStatusChange: (status: 'success' | 'reverted' | undefined) => void
	dir?: 'sent' | 'received' | undefined
	period?: '24h' | '7d' | undefined
	onPeriodChange: (period: '24h' | '7d' | undefined) => void
}) {
	const {
		address,
		page,
		limit,
		activeSection,
		onSectionChange,
		contractInfo,
		contractSource,
		initialData,
		assetsData,
		assetsLoading,
		live,
		isContract,
		isToken,
		tokenMetadata,
		account,
		visibleTabs,
		status,
		onStatusChange,
		dir,
		period,
		onPeriodChange,
	} = props
	const { timeFormat, cycleTimeFormat, formatLabel } = useTimeFormat()
	const { voucher } = Route.useSearch()

	const after = React.useMemo(() => {
		if (period === '24h') return Math.floor(Date.now() / 1000) - 86400
		if (period === '7d') return Math.floor(Date.now() / 1000) - 7 * 86400
		return undefined
	}, [period])

	const include =
		dir === 'sent' ? 'sent' : dir === 'received' ? 'received' : ('all' as const)

	// Track hydration to avoid SSR/client mismatch with query data
	const isMounted = useIsMounted()

	const isTransactionsTabActive = visibleTabs[activeSection] === 'transactions'
	const isTransfersTabActive = visibleTabs[activeSection] === 'transfers'
	const isHoldersTabActive = visibleTabs[activeSection] === 'holders'

	// Contract source query - fetch on demand when contract tab is active
	// Keeps initial page load light while still enabling ABI/source in the UI
	const contractSourceQuery = useQuery({
		...useContractSourceQueryOptions({ address }),
		initialData: contractSource,
		enabled: isMounted && isContract,
	})
	// Use SSR data until mounted to avoid hydration mismatch, then use query data
	const resolvedContractSource = isMounted
		? (contractSourceQuery.data ?? undefined)
		: contractSource

	const extractedAbiQuery = useQuery({
		queryKey: ['contract-abi', address],
		queryFn: () => extractContractAbi(address),
		staleTime: Number.POSITIVE_INFINITY,
		enabled:
			isMounted &&
			isContract &&
			!contractInfo?.abi &&
			!contractSourceQuery.data?.abi,
	})

	const resolvedAbi =
		resolvedContractSource?.abi ?? contractInfo?.abi ?? extractedAbiQuery.data

	// Only auto-refresh on page 1 when transactions tab is active and live=true
	const shouldAutoRefresh = page === 1 && isTransactionsTabActive && live
	const historySources = React.useMemo(
		() => historySourcesForAddress(address),
		[address],
	)

	const {
		data: historyQueryData,
		isPending: isHistoryPending,
		isFetching: isHistoryFetching,
		error: historyError,
	} = useQuery({
		...historyQueryOptions({
			address,
			page,
			limit,
			offset: (page - 1) * limit,
			sources: historySources,
			status,
			include,
			after,
		}),
		initialData: page === 1 ? initialData : undefined,
		enabled:
			isMounted && (isTransactionsTabActive || initialData !== undefined),
		refetchInterval: shouldAutoRefresh ? 4_000 : false,
		refetchOnWindowFocus: shouldAutoRefresh,
	})

	const error = isHistoryPending ? null : historyError

	/**
	 * use initialData until mounted to avoid hydration mismatch
	 * (tanstack query may have fresher cached data that differs from SSR)
	 */
	const historyData = isMounted
		? historyQueryData
		: page === 1
			? initialData
			: historyQueryData
	const baseTransactions = historyData?.transactions ?? []
	const hasMore = historyData?.hasMore ?? false
	const total = historyData?.total
	const countCapped = historyData?.countCapped ?? false
	const shouldFetchContractCreation =
		isMounted &&
		isContract &&
		isTransactionsTabActive &&
		historyData !== undefined &&
		!hasMore

	const { data: contractCreationData } = useQuery({
		queryKey: ['contract-creation', address],
		queryFn: () => fetchContractCreation(address),
		enabled: shouldFetchContractCreation,
		staleTime: 60_000,
	})

	const transactions = React.useMemo(() => {
		if (!isTransactionsTabActive || !isContract) return baseTransactions
		if (hasMore) return baseTransactions

		const creation = contractCreationData?.creation
		if (!creation) return baseTransactions

		const creationTransaction = buildContractCreationTransaction({
			address,
			creation,
		})
		if (!creationTransaction) return baseTransactions

		// Don't append if it doesn't match the active status filter
		if (status && creationTransaction.status !== status) return baseTransactions

		if (
			baseTransactions.some(
				(transaction) =>
					transaction.hash.toLowerCase() ===
					creationTransaction.hash.toLowerCase(),
			)
		)
			return baseTransactions

		return [...baseTransactions, creationTransaction]
	}, [
		address,
		baseTransactions,
		contractCreationData?.creation,
		hasMore,
		isContract,
		isTransactionsTabActive,
		status,
	])

	// Token transfers query
	const transfersPage = isTransfersTabActive ? page : 1
	const {
		data: transfersData,
		isPending: isTransfersPending,
		isFetching: isTransfersFetching,
	} = useQuery({
		...transfersQueryOptions({
			address,
			page: transfersPage,
			limit,
			offset: isTransfersTabActive ? (page - 1) * limit : 0,
			account,
		}),
		enabled: isMounted && isToken && isTransfersTabActive,
	})

	const {
		transfers = [],
		total: transfersTotal = 0,
		totalCapped: transfersTotalCapped = false,
	} = transfersData ?? {}

	// Token holders query
	const holdersPage = isHoldersTabActive ? page : 1
	const {
		data: holdersData,
		isPending: isHoldersPending,
		isFetching: isHoldersFetching,
	} = useQuery({
		...holdersQueryOptions({
			address,
			page: holdersPage,
			limit,
			offset: isHoldersTabActive ? (page - 1) * limit : 0,
		}),
		enabled: isMounted && isToken && isHoldersTabActive,
	})

	const {
		holders = [],
		total: holdersTotal = 0,
		totalCapped: holdersTotalCapped = false,
		totalBalance: holdersTotalBalance = '0',
	} = holdersData ?? {}

	// Only use after mount AND when data has loaded to avoid showing 0 during loading
	const totalTrxCount = isMounted && historyData ? total : undefined

	const isTransactionsLoading =
		isTransactionsTabActive && !error && (isHistoryPending || !historyData)
	const isTransactionsFetching =
		isTransactionsTabActive && isHistoryFetching && !isTransactionsLoading
	const isTransfersLoading =
		isTransfersTabActive && (isTransfersPending || !transfersData)
	const isTransfersFetchingNext =
		isTransfersTabActive && isTransfersFetching && !isTransfersLoading
	const isHoldersLoading =
		isHoldersTabActive && (isHoldersPending || !holdersData)
	const isHoldersFetchingNext =
		isHoldersTabActive && isHoldersFetching && !isHoldersLoading

	const queryClient = useQueryClient()

	const prefetchTransactionsNextPage = React.useCallback(() => {
		if (!isTransactionsTabActive) return

		const nextPage = page + 1
		const hasNextPage =
			totalTrxCount === undefined || countCapped
				? hasMore
				: nextPage <= Math.ceil(totalTrxCount / limit)
		if (!hasNextPage) return

		void queryClient
			.prefetchQuery(
				historyQueryOptions({
					address,
					page: nextPage,
					limit,
					offset: (nextPage - 1) * limit,
					sources: historySources,
					status,
					include,
					after,
				}),
			)
			.catch(() => {})
	}, [
		address,
		after,
		countCapped,
		hasMore,
		historySources,
		include,
		isTransactionsTabActive,
		limit,
		page,
		queryClient,
		status,
		totalTrxCount,
	])

	const prefetchTransfersNextPage = React.useCallback(() => {
		if (!isToken || !isTransfersTabActive) return

		const nextPage = page + 1
		const hasNextPage =
			transfersTotalCapped || nextPage <= Math.ceil(transfersTotal / limit)
		if (!hasNextPage) return

		void queryClient
			.prefetchQuery(
				transfersQueryOptions({
					address,
					page: nextPage,
					limit,
					offset: (nextPage - 1) * limit,
					account,
				}),
			)
			.catch(() => {})
	}, [
		account,
		address,
		isToken,
		isTransfersTabActive,
		limit,
		page,
		queryClient,
		transfersTotal,
		transfersTotalCapped,
	])

	const prefetchHoldersNextPage = React.useCallback(() => {
		if (!isToken || !isHoldersTabActive) return

		const nextPage = page + 1
		const hasNextPage =
			holdersTotalCapped || nextPage <= Math.ceil(holdersTotal / limit)
		if (!hasNextPage) return

		void queryClient
			.prefetchQuery(
				holdersQueryOptions({
					address,
					page: nextPage,
					limit,
					offset: (nextPage - 1) * limit,
				}),
			)
			.catch(() => {})
	}, [
		address,
		holdersTotal,
		holdersTotalCapped,
		isHoldersTabActive,
		isToken,
		limit,
		page,
		queryClient,
	])

	const isMobile = useMediaQuery('(max-width: 799px)')
	const mode = isMobile ? 'stacked' : 'tabs'

	// Show error state for API failures (instead of crashing the whole page)
	const transactionsError = error ? (
		<div className="rounded-[10px] bg-card-header p-4.5">
			<p className="text-sm font-medium text-red-400">
				Failed to load transaction history
			</p>
			<p className="text-xs text-tertiary mt-1">
				{error instanceof Error ? error.message : 'Unknown error'}
			</p>
		</div>
	) : null

	const transactionsColumns: DataGrid.Column[] = [
		{
			label: (
				<TimeColumnHeader
					label="Time"
					formatLabel={formatLabel}
					onCycle={cycleTimeFormat}
					className="text-secondary hover:text-accent cursor-pointer transition-colors"
				/>
			),
			align: 'start',
			width: '0.5fr',
		},
		{ label: 'Description', align: 'start', width: '2fr' },
		{ label: 'Hash', align: 'end', width: '1fr' },
		{ label: 'Fee', align: 'end', width: '0.5fr' },
		{ label: 'Total', align: 'end', width: '0.5fr' },
	]

	const transfersColumns: DataGrid.Column[] = [
		{
			label: (
				<TimeColumnHeader
					label="Time"
					formatLabel={formatLabel}
					onCycle={cycleTimeFormat}
					className="text-secondary hover:text-accent cursor-pointer transition-colors"
				/>
			),
			align: 'start',
			minWidth: 100,
		},
		{ label: 'Transaction', align: 'start', minWidth: 120 },
		{ label: 'From', align: 'start', minWidth: 140 },
		{ label: 'To', align: 'start', minWidth: 140 },
		{ label: 'Amount', align: 'end', minWidth: 100 },
	]

	const holdersColumns: DataGrid.Column[] = [
		{ label: 'Address', align: 'start', minWidth: 140 },
		{ label: 'Balance', align: 'end', minWidth: 120 },
		{ label: 'Percentage', align: 'end', minWidth: 100 },
	]

	// Holdings uses local pagination state (decoupled from URL `page` param)
	const [holdingsPage, setHoldingsPage] = React.useState(1)
	const [showAllHoldings, setShowAllHoldings] = React.useState(false)
	const prevAddressRef = React.useRef(address)
	if (prevAddressRef.current !== address) {
		prevAddressRef.current = address
		setHoldingsPage(1)
		setShowAllHoldings(false)
	}

	const { isTokenListed: isHoldingTokenListed } = useTokenListMembership()
	const { listedAssets, unlistedAssets } = React.useMemo(() => {
		const listed: AssetData[] = []
		const unlisted: AssetData[] = []
		for (const asset of assetsData) {
			if (isHoldingTokenListed(TEMPO_CHAIN_ID, asset.address)) {
				listed.push(asset)
			} else {
				unlisted.push(asset)
			}
		}
		return { listedAssets: listed, unlistedAssets: unlisted }
	}, [assetsData, isHoldingTokenListed])

	const visibleAssets = showAllHoldings ? assetsData : listedAssets
	const hasUnlisted = unlistedAssets.length > 0

	// Clamp page when asset count shrinks (e.g. after a refetch or filter toggle)
	const maxHoldingsPage = Math.max(
		1,
		Math.ceil(visibleAssets.length / ASSETS_PER_PAGE),
	)
	if (holdingsPage > maxHoldingsPage) {
		setHoldingsPage(maxHoldingsPage)
	}

	// Build sections based on visible tabs
	const sections = visibleTabs.map((tabName) => {
		switch (tabName) {
			case 'transactions':
				return {
					title: 'Transactions',
					totalItems: totalTrxCount ?? transactions.length,
					itemsLabel: 'transactions',
					contextual: (
						<div className="flex flex-col gap-[10px] min-[800px]:flex-row min-[800px]:items-center min-[800px]:justify-end">
							<TransactionFilters
								status={status}
								period={period}
								onStatusChange={onStatusChange}
								onPeriodChange={onPeriodChange}
							/>
							<AddressCsvExportButton
								address={address}
								kind="transactions"
								status={status}
								include={include}
								after={after}
								sources={historySources}
							/>
						</div>
					),
					content: transactionsError ?? (
						<DataGrid
							columns={{
								stacked: transactionsColumns,
								tabs: transactionsColumns,
							}}
							items={() =>
								transactions.map((transaction) => {
									const isVoucherMatch =
										voucher?.final_voucher &&
										transaction.hash.toLowerCase() ===
											voucher.final_voucher.toLowerCase()
									return {
										cells: [
											<TransactionTimeCell
												key="time"
												timestamp={transaction.timestamp}
												hash={transaction.hash}
												format={timeFormat}
											/>,
											<TransactionDescCell
												key="desc"
												transaction={transaction}
												accountAddress={address}
											/>,
											<Midcut
												key="hash"
												value={transaction.hash}
												prefix="0x"
												align="end"
											/>,
											<TransactionFeeCell
												key="fee"
												gasUsed={transaction.gasUsed}
												effectiveGasPrice={transaction.effectiveGasPrice}
											/>,
											<TransactionTotalCell
												key="total"
												transaction={transaction}
											/>,
										],
										link: {
											href: `/receipt/${transaction.hash}`,
											title: `View receipt ${transaction.hash}`,
										},
										expanded: isVoucherMatch ? (
											<StreamedPaymentReceipt
												transaction={transaction}
												packetSize={voucher.packet_size ?? 0}
												packetCount={voucher.number ?? 0}
											/>
										) : undefined,
									}
								})
							}
							totalItems={totalTrxCount ?? transactions.length}
							pages={
								countCapped || totalTrxCount === undefined
									? { hasMore }
									: undefined
							}
							displayCount={totalTrxCount}
							displayCountCapped={countCapped}
							disableLastPage={countCapped}
							page={page}
							fetching={isTransactionsFetching}
							loading={isTransactionsLoading}
							countLoading={totalTrxCount === undefined}
							itemsLabel="transactions"
							itemsPerPage={limit}
							pagination="simple"
							onPrefetchNextPage={prefetchTransactionsNextPage}
							emptyState={
								status || dir || period
									? 'No matching transactions found.'
									: 'No transactions found.'
							}
						/>
					),
				}
			case 'holdings': {
				const holdingsPages = Math.ceil(visibleAssets.length / ASSETS_PER_PAGE)
				return {
					title: 'Holdings',
					totalItems: visibleAssets.length,
					itemsLabel: 'assets',
					contextual: (
						<div className="flex justify-end">
							<AddressCsvExportButton address={address} kind="balances" />
						</div>
					),
					content: (
						<DataGrid
							columns={{
								stacked: [
									{ label: 'Name', align: 'start', width: '1fr' },
									{ label: 'Contract', align: 'start', width: '1fr' },
									{ label: 'Amount', align: 'end', width: '0.5fr' },
								],
								tabs: [
									{ label: 'Name', align: 'start', width: '1fr' },
									{ label: 'Ticker', align: 'start', width: '0.5fr' },
									{ label: 'Currency', align: 'start', width: '0.5fr' },
									{ label: 'Amount', align: 'end', width: '0.5fr' },
									{ label: 'Value', align: 'end', width: '0.5fr' },
								],
							}}
							items={(mode) =>
								visibleAssets
									.slice(
										(holdingsPage - 1) * ASSETS_PER_PAGE,
										holdingsPage * ASSETS_PER_PAGE,
									)
									.map((asset) => ({
										className: 'text-[13px]',
										cells:
											mode === 'stacked'
												? [
														<AssetName key="name" asset={asset} />,
														<AssetContract key="contract" asset={asset} />,
														<AssetAmount key="amount" asset={asset} />,
													]
												: [
														<AssetName key="name" asset={asset} />,
														<AssetSymbol key="symbol" asset={asset} />,
														<AssetCurrency key="currency" asset={asset} />,
														<AssetAmount key="amount" asset={asset} />,
														<AssetValue key="value" asset={asset} />,
													],
										link: {
											href: `/address/${asset.address}?tab=transfers` as const,
											search: { a: address },
											title: `View token ${asset.address}`,
										},
									}))
							}
							totalItems={visibleAssets.length}
							displayCount={visibleAssets.length}
							page={holdingsPage}
							itemsLabel="assets"
							itemsPerPage={ASSETS_PER_PAGE}
							pagination={
								<HoldingsFooter
									page={holdingsPage}
									pages={holdingsPages}
									totalItems={visibleAssets.length}
									onPageChange={setHoldingsPage}
									hasUnlisted={hasUnlisted}
									showAll={showAllHoldings}
									unlistedCount={unlistedAssets.length}
									onToggleShowAll={() => {
										setShowAllHoldings((prev) => !prev)
										setHoldingsPage(1)
									}}
								/>
							}
							loading={assetsLoading}
							emptyState="No assets found."
						/>
					),
				}
			}
			case 'transfers':
				return {
					title: 'Transfers',
					totalItems:
						transfersData && (transfersTotalCapped ? '100k+' : transfersTotal),
					itemsLabel: 'transfers',
					contextual: account && (
						<FilterIndicator account={account} tokenAddress={address} />
					),
					content: (
						<DataGrid
							columns={{
								stacked: transfersColumns,
								tabs: transfersColumns,
							}}
							items={() => {
								const validTransfers = transfers.flatMap((transfer) => {
									const timestamp = parseTimestampBigInt(transfer.timestamp)
									const value = parseOptionalBigInt(transfer.value)
									if (timestamp === null || value === null) return []

									return [{ transfer, timestamp, value }]
								})

								return validTransfers.map(({ transfer, timestamp, value }) => ({
									cells: [
										<TimestampCell
											key="time"
											timestamp={timestamp}
											link={`/receipt/${transfer.transactionHash}`}
											format={timeFormat}
										/>,
										<TransactionCell
											key="tx"
											hash={transfer.transactionHash}
										/>,
										<AddressCell
											key="from"
											address={transfer.from}
											label="From"
										/>,
										<AddressCell key="to" address={transfer.to} label="To" />,
										<AmountCell
											key="amount"
											value={value}
											decimals={tokenMetadata?.decimals}
											symbol={tokenMetadata?.symbol}
										/>,
									],
									link: {
										href: `/receipt/${transfer.transactionHash}`,
										title: `View receipt ${transfer.transactionHash}`,
									},
								}))
							}}
							totalItems={transfersTotal}
							displayCount={transfersTotal}
							displayCountCapped={transfersTotalCapped}
							page={page}
							fetching={isTransfersFetchingNext}
							loading={isTransfersLoading}
							itemsLabel="transfers"
							itemsPerPage={limit}
							pagination="simple"
							onPrefetchNextPage={prefetchTransfersNextPage}
							emptyState="No transfers found."
						/>
					),
				}
			case 'holders':
				return {
					title: 'Holders',
					totalItems:
						holdersData && (holdersTotalCapped ? '100k+' : holdersTotal),
					itemsLabel: 'holders',
					content: (
						<DataGrid
							columns={{
								stacked: holdersColumns,
								tabs: holdersColumns,
							}}
							items={() => {
								const totalBalanceBn = BigInt(holdersTotalBalance)
								const onChainSupply = tokenMetadata?.totalSupply ?? 0n
								const supplyDenominator =
									totalBalanceBn > onChainSupply
										? totalBalanceBn
										: onChainSupply
								return holders.map((holder) => {
									const percentage =
										supplyDenominator > 0n
											? Number(
													(BigInt(holder.balance) * 10_000n) /
														supplyDenominator,
												) / 100
											: 0
									return {
										cells: [
											<AddressCell key="address" address={holder.address} />,
											<BalanceCell
												key="balance"
												balance={holder.balance}
												decimals={tokenMetadata?.decimals}
											/>,
											<span
												key="percentage"
												className="text-[12px] text-primary"
											>
												{percentage.toFixed(2)}%
											</span>,
										],
										link: {
											href: `/address/${address}?tab=transfers&a=${holder.address}`,
											title: `View transfers for ${holder.address}`,
										},
									}
								})
							}}
							totalItems={holdersTotal}
							displayCount={holdersTotal}
							displayCountCapped={holdersTotalCapped}
							page={page}
							fetching={isHoldersFetchingNext}
							loading={isHoldersLoading}
							itemsLabel="holders"
							itemsPerPage={limit}
							pagination="simple"
							onPrefetchNextPage={prefetchHoldersNextPage}
							emptyState="No holders found."
						/>
					),
				}
			case 'token':
				return {
					title: 'Token',
					totalItems: 0,
					itemsLabel: 'items',
					content: <Tip20TokenTabContent address={address} />,
				}
			case 'contract':
				return {
					title: 'Contract',
					totalItems: 0,
					itemsLabel: 'items',
					content: (
						<ContractTabContent
							address={address}
							abi={resolvedAbi}
							docsUrl={
								resolvedContractSource?.kind === 'native'
									? resolvedContractSource.docsUrl
									: contractInfo?.docsUrl
							}
							source={resolvedContractSource}
						/>
					),
				}
			case 'interact':
				return {
					title: 'Interact',
					totalItems: 0,
					itemsLabel: 'functions',
					content: (
						<InteractTabContent
							address={address}
							abi={resolvedAbi}
							docsUrl={
								resolvedContractSource?.kind === 'native'
									? resolvedContractSource.docsUrl
									: contractInfo?.docsUrl
							}
						/>
					),
				}
			default:
				return {
					title: 'Unknown',
					totalItems: 0,
					itemsLabel: 'items',
					content: null,
				}
		}
	})

	return (
		<Sections
			mode={mode}
			sections={sections}
			activeSection={activeSection}
			onSectionChange={onSectionChange}
		/>
	)
}

function TransactionTimeCell(props: {
	timestamp: number
	hash: Hex.Hex
	format: TimeFormat
}) {
	const { timestamp, hash, format } = props
	const safeTimestamp = Number.isFinite(timestamp) ? Math.trunc(timestamp) : 0
	return (
		<TransactionTimestamp
			timestamp={BigInt(safeTimestamp)}
			link={`/receipt/${hash}`}
			format={format}
		/>
	)
}

function parseOptionalBigInt(
	value: string | number | bigint | null | undefined,
): bigint | null {
	if (value === null || value === undefined) return null
	if (typeof value === 'bigint') return value
	if (typeof value === 'number') {
		if (!Number.isFinite(value)) return null
		return BigInt(Math.trunc(value))
	}
	try {
		return BigInt(value)
	} catch {
		return null
	}
}

function parseTimestampBigInt(value: string | null | undefined): bigint | null {
	if (!value) return null

	const direct = parseOptionalBigInt(value)
	if (direct !== null) return direct

	const parsedDate = Date.parse(value)
	if (Number.isFinite(parsedDate)) {
		return BigInt(Math.floor(parsedDate / 1000))
	}

	return null
}

function TransactionDescCell(props: {
	transaction: EnrichedTransaction
	accountAddress: Address.Address
}) {
	const { transaction, accountAddress } = props
	if (!transaction.knownEvents.length) {
		return <span className="text-secondary">No events</span>
	}
	return (
		<TransactionDescription
			transaction={
				transaction as unknown as Parameters<
					typeof TransactionDescription
				>[0]['transaction']
			}
			knownEvents={transaction.knownEvents}
			transactionReceipt={undefined}
			accountAddress={accountAddress}
		/>
	)
}

function TransactionFeeCell(props: {
	gasUsed: string
	effectiveGasPrice: string
}) {
	const { isTokenListed } = useTokenListMembership()
	const fee =
		Hex.toBigInt(props.gasUsed as Hex.Hex) *
		Hex.toBigInt(props.effectiveGasPrice as Hex.Hex)
	const feeRaw = formatUnits(fee, 18)
	const showUsdPrefix = TEMPO_FEE_TOKEN
		? isTokenListed(TEMPO_CHAIN_ID, TEMPO_FEE_TOKEN)
		: true
	const feeDisplay = showUsdPrefix
		? PriceFormatter.format(fee, { decimals: 18, format: 'short' })
		: PriceFormatter.formatAmountShort(feeRaw)
	return <span className="text-tertiary">{feeDisplay}</span>
}

function TransactionTotalCell(props: { transaction: EnrichedTransaction }) {
	const { transaction } = props
	const { areTokensListed, isTokenListed } = useTokenListMembership()

	const events = React.useMemo(() => {
		return transaction.knownEvents.filter((event) => event.type !== 'approval')
	}, [transaction.knownEvents])
	const eventTokenAddresses = React.useMemo(
		() =>
			events.flatMap((event) =>
				event.parts.flatMap((part) =>
					part.type === 'amount' ? [part.value.token] : [],
				),
			),
		[events],
	)
	const showUsdPrefix =
		eventTokenAddresses.length > 0
			? areTokensListed(TEMPO_CHAIN_ID, eventTokenAddresses)
			: TEMPO_FEE_TOKEN
				? isTokenListed(TEMPO_CHAIN_ID, TEMPO_FEE_TOKEN)
				: true

	const infiniteLabel = <span className="text-secondary">−</span>

	const hasAmounts = events.some((event) =>
		event.parts.some((part) => part.type === 'amount'),
	)
	if (!hasAmounts)
		return (
			<Amount.Base
				value={0n}
				decimals={0}
				prefix={showUsdPrefix ? '$' : undefined}
				short
				infinite={infiniteLabel}
			/>
		)

	// For each event, take the max amount (avoids double-counting swap legs),
	// then sum across events.
	const normalizedDecimals = 18
	const totalValue = events.reduce((sum, event) => {
		let maxAmount = 0n
		for (const part of event.parts) {
			if (part.type !== 'amount') continue
			const decimals = part.value.decimals ?? 6
			const scale = 10n ** BigInt(normalizedDecimals - decimals)
			const value =
				typeof part.value.value === 'bigint'
					? part.value.value
					: BigInt(part.value.value)
			const normalized = value * scale
			if (normalized > maxAmount) maxAmount = normalized
		}
		return sum + maxAmount
	}, 0n)

	if (totalValue === 0n) {
		const value = transaction.value
			? Hex.toBigInt(transaction.value as Hex.Hex)
			: 0n
		if (value === 0n) return <span className="text-tertiary">—</span>
		return (
			<Amount.Base
				value={value}
				decimals={18}
				infinite={infiniteLabel}
				prefix={showUsdPrefix ? '$' : undefined}
				short
			/>
		)
	}

	return (
		<Amount.Base
			value={totalValue}
			decimals={normalizedDecimals}
			infinite={infiniteLabel}
			prefix={showUsdPrefix ? '$' : undefined}
			short
		/>
	)
}

function AssetName(props: { asset: AssetData }) {
	const { asset } = props
	if (!asset.metadata?.name) return <span className="text-tertiary">…</span>
	return (
		<span className="inline-flex items-center gap-2 min-w-0">
			<TokenIcon
				address={asset.address}
				name={asset.metadata?.name}
				className="size-5 shrink-0"
			/>
			<span className="truncate">{asset.metadata.name}</span>
		</span>
	)
}

function AssetSymbol(props: { asset: AssetData }) {
	const { asset } = props
	if (!asset.metadata?.symbol) return <span className="text-tertiary">…</span>
	return (
		<Link
			to="/token/$address"
			params={{ address: asset.address }}
			className="text-accent hover:underline press-down truncate"
		>
			{asset.metadata.symbol}
		</Link>
	)
}

function AssetContract(props: { asset: AssetData }) {
	return (
		<span className="text-accent">
			{HexFormatter.truncate(props.asset.address, 10)}
		</span>
	)
}

function AssetCurrency(props: { asset: AssetData }) {
	const { asset } = props
	if (!asset.metadata?.currency) return <span className="text-tertiary">—</span>
	return <span>{asset.metadata.currency}</span>
}

function AssetAmount(props: { asset: AssetData }) {
	const { asset } = props
	if (asset.metadata?.decimals === undefined || asset.balance === undefined)
		return <span className="text-tertiary">…</span>
	const formatted = formatUnits(asset.balance, asset.metadata.decimals)
	const display = PriceFormatter.formatAmountFull(formatted)
	return (
		<span className="truncate" title={display}>
			{display}
		</span>
	)
}

function AssetValue(props: { asset: AssetData }) {
	const { asset } = props
	const { isTokenListed } = useTokenListMembership()
	if (asset.metadata?.currency !== 'USD')
		return <span className="text-tertiary">—</span>
	if (!isTokenListed(TEMPO_CHAIN_ID, asset.address))
		return <span className="text-tertiary">—</span>
	if (asset.metadata?.decimals === undefined || asset.balance === undefined)
		return <span className="text-tertiary">…</span>
	return (
		<span>
			{PriceFormatter.format(asset.balance, {
				decimals: asset.metadata.decimals,
				format: 'short',
			})}
		</span>
	)
}

function HoldingsFooter(props: {
	page: number
	pages: number
	totalItems: number
	onPageChange: (page: number) => void
	hasUnlisted: boolean
	showAll: boolean
	unlistedCount: number
	onToggleShowAll: () => void
}) {
	const {
		page,
		pages,
		totalItems,
		onPageChange,
		hasUnlisted,
		showAll,
		unlistedCount,
		onToggleShowAll,
	} = props
	const btnClass = cx(
		'rounded-full border border-base-border hover:bg-alt flex items-center justify-center cursor-pointer active:translate-y-[0.5px] disabled:cursor-not-allowed disabled:opacity-50 size-[24px] text-primary',
	)
	return (
		<div className="flex flex-col gap-0 border-t border-dashed border-card-border">
			{pages > 1 && (
				<div className="flex flex-col items-center sm:flex-row gap-[12px] px-[16px] py-[12px] text-[12px] text-tertiary sm:justify-between">
					<div className="flex items-center justify-center sm:justify-start gap-[6px]">
						<button
							type="button"
							onClick={() => onPageChange(1)}
							disabled={page <= 1}
							className={btnClass}
							title="First page"
						>
							<ChevronFirst className="size-[14px]" />
						</button>
						<button
							type="button"
							onClick={() => onPageChange(page - 1)}
							disabled={page <= 1}
							className={btnClass}
							title="Previous page"
						>
							<ChevronLeft className="size-[14px]" />
						</button>
						<span className="text-tertiary font-medium tabular-nums px-[4px] whitespace-nowrap">
							<span className="text-primary">
								{Pagination.numFormat.format(page)}
							</span>
							{' of '}
							{Pagination.numFormat.format(pages)}
						</span>
						<button
							type="button"
							onClick={() => onPageChange(page + 1)}
							disabled={page >= pages}
							className={btnClass}
							title="Next page"
						>
							<ChevronRight className="size-[14px]" />
						</button>
						<button
							type="button"
							onClick={() => onPageChange(pages)}
							disabled={page >= pages}
							className={btnClass}
							title="Last page"
						>
							<ChevronLast className="size-[14px]" />
						</button>
					</div>
					<Pagination.Count
						totalItems={totalItems}
						itemsLabel={Pagination.pluralize(totalItems, 'assets')}
					/>
				</div>
			)}
			{hasUnlisted && (
				<div
					className={cx(
						'flex items-center justify-center px-[16px] py-[10px] text-[12px]',
						pages > 1 && 'border-t border-dashed border-card-border',
					)}
				>
					<button
						type="button"
						onClick={onToggleShowAll}
						className="inline-flex items-center gap-1.5 text-tertiary hover:text-secondary transition-colors cursor-pointer"
					>
						{showAll ? (
							<>
								<EyeOffIcon className="size-[14px]" />
								Hide {unlistedCount} unverified{' '}
								{unlistedCount === 1 ? 'token' : 'tokens'}
							</>
						) : (
							<>
								<EyeIcon className="size-[14px]" />
								Show {unlistedCount} unverified{' '}
								{unlistedCount === 1 ? 'token' : 'tokens'}
							</>
						)}
					</button>
				</div>
			)}
		</div>
	)
}

function FilterIndicator(props: {
	account: Address.Address
	tokenAddress: Address.Address
}) {
	const { account, tokenAddress } = props
	return (
		<div className="flex items-center gap-2 text-[12px]">
			<span className="text-tertiary">Filtered:</span>
			<Link
				to="/address/$address"
				params={{ address: account }}
				className="text-accent press-down font-mono"
				title={account}
			>
				<Midcut value={account} prefix="0x" />
			</Link>
			<Link
				to="/address/$address"
				params={{ address: tokenAddress }}
				search={{ tab: 'transfers' }}
				className="text-tertiary press-down"
				title="Clear filter"
			>
				<XIcon className="size-3.5 translate-y-px" />
			</Link>
		</div>
	)
}

function StreamedPaymentReceipt(props: {
	transaction: EnrichedTransaction
	packetSize: number
	packetCount: number
}) {
	const { transaction, packetSize, packetCount } = props

	// Extract payee from the settlement/close channel event
	const payee = transaction.knownEvents.find(
		(e) => e.type === 'settle channel' || e.type === 'close channel',
	)?.meta?.to

	const packetMicros = BigInt(Math.round(packetSize * 1_000_000))
	const voucherEvent: KnownEvent = {
		type: 'send',
		parts: [
			{ type: 'action', value: 'Pay' },
			...(TEMPO_FEE_TOKEN
				? ([
						{
							type: 'amount',
							value: { value: packetMicros, decimals: 6, token: TEMPO_FEE_TOKEN },
						},
					] as KnownEvent['parts'])
				: []),
			...(payee
				? ([
						{ type: 'text', value: 'to' },
						{ type: 'account', value: payee },
					] as KnownEvent['parts'])
				: []),
		],
	}

	const digits = String(packetCount).length

	return (
		<div className="pb-4 font-mono text-[13px]">
			{/* On-chain settlement — visually part of the main row */}
			<div className="bg-base-alt -mx-[16px] px-[16px] py-[10px] border-b-2 border-base-border flex items-center">
				<span className="text-tertiary tabular-nums text-right shrink-0 mr-[10px]"
					style={{ minWidth: `${digits}ch` }}
				>
					↓
				</span>
				<span className="text-[11px] text-accent shrink-0 w-[64px] italic">on-chain</span>
				{transaction.knownEvents.filter(e => e.type === 'settle channel' || e.type === 'close channel').map((e, i) => (
					<TxEventDescription key={i} event={e} />
				))}
			</div>

			{/* Off-chain section header */}
			<div className="flex items-center gap-[8px] pt-[12px] pb-[6px] text-[11px] text-tertiary uppercase tracking-wider">
				<span>off-chain vouchers</span>
				<span className="flex-1 border-t border-dashed border-distinct" />
				<span>{packetCount.toLocaleString()}</span>
			</div>

			{/* Off-chain voucher rows */}
			{Array.from({ length: packetCount }, (_, i) => (
				<div
					key={i}
					className="flex items-center py-[9px] border-b border-dashed border-distinct"
				>
					<span className="text-tertiary tabular-nums text-right shrink-0 mr-[10px]"
						style={{ minWidth: `${digits}ch` }}
					>
						{i + 1}
					</span>
					<span className="text-[11px] text-tertiary shrink-0 w-[64px]">off-chain</span>
					<div className="flex items-center gap-[10px] ml-auto">
						<TxEventDescription.Part part={{ type: 'action', value: 'Pay' }} />
						{voucherEvent.parts.filter(p => p.type === 'amount').map((p, j) => (
							<TxEventDescription.Part key={j} part={p} />
						))}
					</div>
				</div>
			))}
		</div>
	)
}
