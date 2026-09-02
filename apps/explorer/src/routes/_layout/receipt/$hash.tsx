import { env } from 'cloudflare:workers'
import puppeteer from '@cloudflare/puppeteer'
import { queryOptions, useQuery } from '@tanstack/react-query'
import {
	createFileRoute,
	notFound,
	rootRouteId,
	useLocation,
	useNavigate,
} from '@tanstack/react-router'
import * as Hex from 'ox/Hex'
import * as Json from 'ox/Json'
import { getPublicClient } from 'wagmi/actions'
import * as z from 'zod/mini'
import { NotFound } from '#comps/NotFound'
import { Receipt } from '#comps/Receipt'
import { useTokenListMembership } from '#comps/TokenListMembership'
import { apostrophe } from '#lib/chars'
import { getReceiptResponseType } from '#lib/domain/receipt-export'
import {
	decodeKnownTransactionCall,
	parseKnownEvents,
} from '#lib/domain/known-events'
import { getFeeBreakdown, LineItems } from '#lib/domain/receipt'
import {
	buildReceiptPresentation,
	enrichReceiptEventAmounts,
	type ReceiptPresentation,
	type ReceiptVoucher,
} from '#lib/domain/receipt-presentation'
import { renderReceiptText } from '#lib/domain/receipt-text'
import { buildTxSummary } from '#lib/domain/tx-summary'
import * as Tip20 from '#lib/domain/tip20'
import {
	activitiesToKnownEvents,
	selectTransactionDescriptionEvents,
} from '#lib/domain/transaction-activities'
import { DateFormatter } from '#lib/formatting'
import { useKeyboardShortcut } from '#lib/hooks'
import {
	buildTxDescription,
	formatEventForOgServer,
	OG_BASE_URL,
} from '#lib/og'
import { withLoaderTiming } from '#lib/profiling'
import { getFeeTokenForChain } from '#lib/fee-token'
import { fetchTransactionActivities } from '#lib/server/transaction-activities'
import { getTempoChain, getWagmiConfig } from '#wagmi.config.ts'

const TEMPO_CHAIN_ID = getTempoChain().id
const TEMPO_FEE_TOKEN = getFeeTokenForChain(TEMPO_CHAIN_ID)
function receiptDetailQueryOptions(params: { hash: Hex.Hex; rpcUrl?: string }) {
	return queryOptions({
		queryKey: ['receipt-detail', params.hash, params.rpcUrl],
		queryFn: () => fetchReceiptData(params),
		staleTime: 1000 * 60 * 5, // 5 minutes - receipt data is immutable
	})
}

function stripLineItemEvents(
	lineItems: ReturnType<typeof LineItems.fromReceipt>,
): ReturnType<typeof LineItems.fromReceipt> {
	const omitEvent = <T extends { event?: unknown }>(item: T) => {
		const { event: _event, ...rest } = item
		return rest
	}

	return {
		...lineItems,
		main: lineItems.main.map(omitEvent),
		feeTotals: lineItems.feeTotals.map(omitEvent),
		totals: lineItems.totals.map(omitEvent),
	}
}

async function fetchReceiptData(params: { hash: Hex.Hex; rpcUrl?: string }) {
	const config = getWagmiConfig()
	const client = getPublicClient(config)
	if (!client) throw new Error('RPC client unavailable')
	const receipt = await client.getTransactionReceipt({
		hash: params.hash,
	})
	// TODO: investigate & consider batch/multicall
	const [block, transaction, getTokenMetadata, activities] = await Promise.all([
		client.getBlock({ blockHash: receipt.blockHash }),
		client.getTransaction({ hash: receipt.transactionHash }),
		Tip20.metadataFromLogs(receipt.logs),
		fetchTransactionActivities({ data: { hash: receipt.transactionHash } }),
	])
	const lineItems = stripLineItemEvents(
		LineItems.fromReceipt(receipt, { getTokenMetadata }),
	)
	const parsedEvents = parseKnownEvents(receipt, {
		transaction,
		getTokenMetadata,
	})
	const feeBreakdown = getFeeBreakdown(receipt, { getTokenMetadata })

	// Try to decode known contract calls (e.g., validator precompile)
	// Prioritize decoded calls over fee-only events since they're more descriptive
	const knownCall = decodeKnownTransactionCall(transaction)

	const fallbackEvents = knownCall
		? [knownCall, ...parsedEvents.filter((e) => e.type !== 'fee')]
		: parsedEvents
	const activityEvents = activitiesToKnownEvents(activities, {
		portal: receipt.to,
	})
	const knownEvents = enrichReceiptEventAmounts(
		selectTransactionDescriptionEvents({
			activityEvents,
			fallbackEvents,
			knownCall,
		}),
		getTokenMetadata,
	)

	return {
		block,
		feeBreakdown,
		knownEvents,
		lineItems,
		receipt,
		transaction,
	}
}

function getReceiptPresentation(
	data: Awaited<ReturnType<typeof fetchReceiptData>>,
	voucher: ReceiptVoucher | null,
	isTokenListed: (
		chainId: number,
		address: `0x${string}` | undefined,
	) => boolean,
): ReceiptPresentation {
	return buildReceiptPresentation({
		chainId: TEMPO_CHAIN_ID,
		feeBreakdown: data.feeBreakdown,
		feeToken: TEMPO_FEE_TOKEN,
		isTokenListed,
		knownEvents: data.knownEvents,
		lineItems: data.lineItems,
		receipt: data.receipt,
		voucher,
	})
}

async function getServerReceiptPresentation(
	data: Awaited<ReturnType<typeof fetchReceiptData>>,
	voucher: ReceiptVoucher | null,
): Promise<ReceiptPresentation> {
	const { getVerifiedTokenAddresses } = await import(
		'#lib/server/verified-tokens'
	)
	const verifiedTokens = await getVerifiedTokenAddresses(TEMPO_CHAIN_ID)
	return getReceiptPresentation(data, voucher, (_chainId, address) =>
		address ? verifiedTokens.has(address.toLowerCase()) : true,
	)
}

function parseHashFromParams(params: unknown): Hex.Hex | null {
	const parseResult = z
		.object({
			hash: z.pipe(
				z.string(),
				z.transform(
					(val) => val.replace(/(\.json|\.txt|\.pdf)$/, '') as Hex.Hex,
				),
			),
		})
		.safeParse(params)

	if (!parseResult.success) return null

	const { hash } = parseResult.data
	if (!Hex.validate(hash) || Hex.size(hash) !== 32) return null

	return hash
}

function receiptExportNotFound(
	type: ReturnType<typeof getReceiptResponseType>,
) {
	return type === 'application/json'
		? Response.json({ error: 'Not found' }, { status: 404 })
		: new Response('Not found', {
				status: 404,
				headers: { 'Content-Type': 'text/plain; charset=utf-8' },
			})
}

async function fetchReceiptDataForExport(params: {
	hash: Hex.Hex
	rpcUrl?: string
}): Promise<Awaited<ReturnType<typeof fetchReceiptData>> | null> {
	try {
		return await fetchReceiptData(params)
	} catch {
		return null
	}
}

export const Route = createFileRoute('/_layout/receipt/$hash')({
	component: Component,
	notFoundComponent: ({ data }) => (
		<NotFound
			title="Receipt Not Found"
			message={`The receipt doesn${apostrophe}t exist or hasn${apostrophe}t been processed yet.`}
			data={data as NotFound.NotFoundData}
		/>
	),
	validateSearch: z.object({
		voucher: z.optional(
			z.object({
				final_voucher: z.optional(z.string()),
				packet_size: z.optional(z.coerce.number()),
				number: z.optional(z.coerce.number()),
			}),
		),
	}).parse,
	headers: () => ({
		...(import.meta.env.PROD
			? {
					'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
				}
			: {}),
	}),
	loader: ({ params, context }) =>
		withLoaderTiming('/_layout/receipt/$hash', async () => {
			const hash = parseHashFromParams(params)
			if (!hash)
				throw notFound({
					routeId: rootRouteId,
					data: { type: 'hash', value: params.hash },
				})

			try {
				return (await context.queryClient.ensureQueryData(
					receiptDetailQueryOptions({ hash }),
					// biome-ignore lint/suspicious/noExplicitAny: TanStack loader typing mismatches viem log args shape.
				)) as any
			} catch (error) {
				console.error(error)
				throw notFound({
					routeId: rootRouteId,
					data: { type: 'hash', value: hash },
				})
			}
		}),
	server: {
		handlers: {
			async GET({ params, request, next }) {
				const url = new URL(request.url)

				const accept = request.headers.get('accept')?.toLowerCase() || ''
				const userAgent = request.headers.get('user-agent')?.toLowerCase() || ''
				const isTerminal =
					userAgent.includes('curl') ||
					userAgent.includes('wget') ||
					userAgent.includes('httpie')

				const type = getReceiptResponseType(url.pathname, accept, isTerminal)

				const rpcUrl = url.searchParams.get('r') ?? undefined
				const hash = parseHashFromParams(params)
				if (!hash) return type ? receiptExportNotFound(type) : next()

				if (type === 'text/plain') {
					const data = await fetchReceiptDataForExport({ hash, rpcUrl })
					if (!data) return receiptExportNotFound(type)
					const voucherData = parseVoucherSearchParams(url.searchParams)
					const presentation = await getServerReceiptPresentation(
						data,
						voucherData,
					)
					const summary = buildTxSummary({
						receipt: data.receipt,
						transaction: data.transaction,
						knownEvents: presentation.events,
						trace: null,
					})
					const text = renderReceiptText(data, presentation, {
						summary: summary.headline,
					})
					return new Response(text, {
						headers: {
							'Content-Type': 'text/plain; charset=utf-8',
							'Content-Disposition': 'inline',
							...(import.meta.env.PROD
								? {
										'Cache-Control':
											'public, max-age=3600, stale-while-revalidate=86400',
									}
								: {}),
						},
					})
				}

				if (type === 'application/json') {
					const data = await fetchReceiptDataForExport({
						hash,
						rpcUrl,
					})
					if (!data) return receiptExportNotFound(type)
					const voucherData = parseVoucherSearchParams(url.searchParams)
					const presentation = await getServerReceiptPresentation(
						data,
						voucherData,
					)
					const summary = buildTxSummary({
						receipt: data.receipt,
						transaction: data.transaction,
						knownEvents: presentation.events,
						trace: null,
					})
					return Response.json(
						JSON.parse(
							Json.stringify({
								version: 2,
								summary,
								block: data.block,
								transaction: data.transaction,
								receipt: data.receipt,
								knownEvents: presentation.events,
								feeBreakdown: presentation.feeBreakdown,
								display: {
									fee: presentation.fee,
									feeDisplay: presentation.feeDisplay,
									total: presentation.total,
									totalDisplay: presentation.totalDisplay,
								},
								lineItems: data.lineItems,
							}),
						),
					)
				}

				if (type === 'application/pdf') {
					const data = await fetchReceiptDataForExport({ hash, rpcUrl })
					if (!data) return receiptExportNotFound(type)
					const browser = await puppeteer.launch(env.BROWSER)
					const page = await browser.newPage()

					const forwardedHeaders = Object.fromEntries(
						['authorization', 'cookie', 'accept-language'].flatMap((name) => {
							const value = request.headers.get(name)
							return value ? [[name, value]] : []
						}),
					)
					if (Object.keys(forwardedHeaders).length > 0)
						await page.setExtraHTTPHeaders(forwardedHeaders)

					// Build the equivalent HTML URL, preserving existing query params
					const htmlUrl = new URL(url.href)
					htmlUrl.pathname = htmlUrl.pathname.replace(/\.pdf$/, '')
					htmlUrl.searchParams.set('plain', '')

					// Navigate to the HTML version of the receipt
					await page.goto(htmlUrl.toString(), { waitUntil: 'networkidle0' })

					// Generate PDF
					const pdf = await page.pdf({
						printBackground: true,
						format: 'A4',
					})

					await browser.close()

					return new Response(Buffer.from(pdf), {
						headers: {
							...(import.meta.env.PROD
								? {
										'Cache-Control':
											'public, max-age=3600, stale-while-revalidate=86400',
									}
								: {}),
							'Content-Type': 'application/pdf',
							'Content-Disposition': 'inline; filename="receipt.pdf"',
						},
					})
				}

				return next()
			},
		},
	},
	params: z.object({
		hash: z.pipe(
			z.string(),
			z.transform((val) => val.replace(/(\.json|\.txt|\.pdf)$/, '') as Hex.Hex),
		),
	}),
	head: ({ params, loaderData, match }) => {
		const title = `Receipt ${params.hash.slice(0, 10)}…${params.hash.slice(-6)} ⋅ Tempo Explorer`
		const voucherData = parseVoucherParam(match.search.voucher)
		const presentation = loaderData
			? getReceiptPresentation(loaderData, voucherData, () => true)
			: null

		const description = buildTxDescription(
			loaderData
				? {
						timestamp: Number(loaderData.block.timestamp) * 1000,
						from: loaderData.receipt.from,
						events: presentation?.events ?? [],
					}
				: null,
		)

		const search = new URLSearchParams()
		if (loaderData) {
			search.set('block', loaderData.block.number.toString())
			search.set('sender', loaderData.receipt.from)
			const ogTimestamp = DateFormatter.formatTimestampForOg(
				loaderData.block.timestamp,
			)
			search.set('date', ogTimestamp.date)
			search.set('time', ogTimestamp.time)

			if (presentation) {
				search.set('fee', presentation.feeDisplay)
				if (presentation.totalDisplay)
					search.set('total', presentation.totalDisplay)
			}

			presentation?.events
				?.slice(0, 6)
				.forEach(
					(
						event: Parameters<typeof formatEventForOgServer>[0],
						index: number,
					) => {
						search.set(`ev${index + 1}`, formatEventForOgServer(event))
					},
				)
		}

		const ogImageUrl = `${OG_BASE_URL}/receipt/${params.hash}?${search.toString()}`

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

function parseVoucherParam(
	raw:
		| {
				final_voucher?: string
				packet_size?: number | string
				number?: number | string
		  }
		| undefined,
): { packetSize: number; packetCount: number } | null {
	if (!raw) return null
	const packetSize = Number(raw.packet_size)
	const packetCount = Number(raw.number)
	if (!Number.isFinite(packetSize) || !Number.isFinite(packetCount)) return null
	return { packetSize, packetCount }
}

function parseVoucherSearchParams(
	searchParams: URLSearchParams,
): { packetSize: number; packetCount: number } | null {
	const serializedVoucher = searchParams.get('voucher')
	if (serializedVoucher) {
		try {
			const voucher = JSON.parse(serializedVoucher)
			if (voucher && typeof voucher === 'object')
				return parseVoucherParam(
					voucher as {
						final_voucher?: string
						packet_size?: number | string
						number?: number | string
					},
				)
		} catch {
			// Fall through to bracket-style query parameters.
		}
	}

	return parseVoucherParam({
		packet_size: searchParams.get('voucher[packet_size]') ?? undefined,
		number: searchParams.get('voucher[number]') ?? undefined,
	})
}

function Component() {
	const { hash } = Route.useParams()
	const { voucher: voucherRaw } = Route.useSearch()
	const location = useLocation()
	const navigate = useNavigate()
	const loaderData = Route.useLoaderData() as Awaited<
		ReturnType<typeof fetchReceiptData>
	>

	const voucherData = parseVoucherParam(voucherRaw)

	const { data } = useQuery({
		...receiptDetailQueryOptions({ hash }),
		initialData: loaderData,
	})

	useKeyboardShortcut({
		t: () => navigate({ to: '/tx/$hash', params: { hash } }),
	})

	const { isTokenListed } = useTokenListMembership()

	const { block, receipt } = data
	const presentation = getReceiptPresentation(data, voucherData, isTokenListed)

	return (
		<div className="font-mono text-[13px] flex flex-col items-center justify-center gap-8 pt-16 pb-8 grow print:pt-8 print:pb-0 print:grow-0">
			<Receipt
				blockNumber={receipt.blockNumber}
				events={presentation.events}
				fee={presentation.fee}
				feeBreakdown={presentation.feeBreakdown}
				feeDisplay={presentation.feeDisplay}
				hash={receipt.transactionHash}
				sender={receipt.from}
				status={receipt.status}
				timestamp={block.timestamp}
				total={presentation.total}
				totalDisplay={presentation.totalDisplay}
				exportSearch={location.searchStr}
			/>
		</div>
	)
}
