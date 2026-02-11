import { env } from 'cloudflare:workers'
import puppeteer from '@cloudflare/puppeteer'
import { queryOptions, useQuery } from '@tanstack/react-query'
import {
	createFileRoute,
	notFound,
	rootRouteId,
	useNavigate,
} from '@tanstack/react-router'
import * as Hex from 'ox/Hex'
import * as Json from 'ox/Json'
import * as Value from 'ox/Value'
import { getPublicClient } from 'wagmi/actions'
import * as z from 'zod/mini'
import { NotFound } from '#comps/NotFound'
import { Receipt } from '#comps/Receipt'
import { apostrophe } from '#lib/chars'
import { decodeKnownCall, parseKnownEvents } from '#lib/domain/known-events'
import { getFeeBreakdown, LineItems } from '#lib/domain/receipt'
import * as Tip20 from '#lib/domain/tip20'
import { DateFormatter, PriceFormatter } from '#lib/formatting'
import { useKeyboardShortcut } from '#lib/hooks'
import {
	buildTxDescription,
	formatEventForOgServer,
	OG_BASE_URL,
} from '#lib/og'
import { withLoaderTiming } from '#lib/profiling'
import { getWagmiConfig } from '#wagmi.config.ts'

function receiptDetailQueryOptions(params: { hash: Hex.Hex; rpcUrl?: string }) {
	return queryOptions({
		queryKey: ['receipt-detail', params.hash, params.rpcUrl],
		queryFn: () => fetchReceiptData(params),
		staleTime: 1000 * 60 * 5, // 5 minutes - receipt data is immutable
	})
}

async function fetchReceiptData(params: { hash: Hex.Hex; rpcUrl?: string }) {
	const config = getWagmiConfig()
	const client = getPublicClient(config)
	if (!client) throw new Error('RPC client unavailable')
	const receipt = await client.getTransactionReceipt({
		hash: params.hash,
	})
	// TODO: investigate & consider batch/multicall
	const [block, transaction, getTokenMetadata] = await Promise.all([
		client.getBlock({ blockHash: receipt.blockHash }),
		client.getTransaction({ hash: receipt.transactionHash }),
		Tip20.metadataFromLogs(receipt.logs),
	])
	const timestampFormatted = DateFormatter.format(block.timestamp)

	const lineItems = LineItems.fromReceipt(receipt, { getTokenMetadata })
	const parsedEvents = parseKnownEvents(receipt, {
		transaction,
		getTokenMetadata,
	})
	const feeBreakdown = getFeeBreakdown(receipt, { getTokenMetadata })

	// Try to decode known contract calls (e.g., validator precompile)
	// Prioritize decoded calls over fee-only events since they're more descriptive
	const knownCall =
		transaction.to && transaction.input && transaction.input !== '0x'
			? decodeKnownCall(transaction.to, transaction.input)
			: null

	const knownEvents = knownCall
		? [knownCall, ...parsedEvents.filter((e) => e.type !== 'fee')]
		: parsedEvents

	return {
		block,
		feeBreakdown,
		knownEvents,
		lineItems,
		receipt,
		timestampFormatted,
		transaction,
	}
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

export const Route = createFileRoute('/_layout/receipt/$hash')({
	component: Component,
	notFoundComponent: ({ data }) => (
		<NotFound
			title="Receipt Not Found"
			message={`The receipt doesn${apostrophe}t exist or hasn${apostrophe}t been processed yet.`}
			data={data as NotFound.NotFoundData}
		/>
	),
	headers: () => ({
		...(import.meta.env.PROD
			? {
					'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
				}
			: {}),
	}),
	// @ts-expect-error - TODO: fix
	loader: ({ params, context }) =>
		withLoaderTiming('/_layout/receipt/$hash', async () => {
			const hash = parseHashFromParams(params)
			if (!hash)
				throw notFound({
					routeId: rootRouteId,
					data: { type: 'hash', value: params.hash },
				})

			try {
				return await context.queryClient.ensureQueryData(
					receiptDetailQueryOptions({ hash }),
				)
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

				const type = (() => {
					if (
						url.pathname.endsWith('.pdf') ||
						accept.includes('application/pdf')
					)
						return 'application/pdf'
					if (
						url.pathname.endsWith('.json') ||
						accept.includes('application/json')
					)
						return 'application/json'
					if (
						url.pathname.endsWith('.txt') ||
						isTerminal ||
						accept.includes('text/plain')
					)
						return 'text/plain'
				})()

				const rpcUrl = url.searchParams.get('r') ?? undefined
				const hash = parseHashFromParams(params)

				if (type === 'text/plain') {
					if (!hash) return new Response('Not found', { status: 404 })
					const data = await fetchReceiptData({ hash, rpcUrl })
					const text = TextRenderer.render(data)
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
					if (!hash)
						return Response.json({ error: 'Not found' }, { status: 404 })
					const { lineItems, receipt } = await fetchReceiptData({
						hash,
						rpcUrl,
					})
					return Response.json(
						JSON.parse(Json.stringify({ lineItems, receipt })),
					)
				}

				if (type === 'application/pdf') {
					const browser = await puppeteer.launch(env.BROWSER)
					const page = await browser.newPage()

					// Pass through authentication if present
					const authHeader = request.headers.get('Authorization')
					if (authHeader)
						await page.setExtraHTTPHeaders({
							Authorization: authHeader,
						})

					// Build the equivalent HTML URL, preserving existing query params
					const htmlUrl = new URL(url.href)
					htmlUrl.pathname = htmlUrl.pathname.replace(/\.pdf$/, '')
					htmlUrl.searchParams.set('plain', '')

					// Navigate to the HTML version of the receipt
					await page.goto(htmlUrl.toString(), { waitUntil: 'domcontentloaded' })

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
	head: ({ params, loaderData }) => {
		const title = `Receipt ${params.hash.slice(0, 10)}…${params.hash.slice(-6)} ⋅ Tempo Explorer`

		const description = buildTxDescription(
			loaderData
				? {
						timestamp: Number(loaderData.block.timestamp) * 1000,
						from: loaderData.receipt.from,
						events: loaderData.knownEvents ?? [],
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

			// Include fee so the OG receipt can render the Fee row.
			const gasUsed = loaderData.receipt.gasUsed ?? 0n
			const gasPrice =
				loaderData.receipt.effectiveGasPrice ??
				loaderData.transaction.gasPrice ??
				0n
			const feeAmount = gasUsed * gasPrice
			const fee = Number(Value.format(feeAmount, 18))
			const feeDisplay = PriceFormatter.format(fee)
			search.set('fee', feeDisplay)

			loaderData.knownEvents?.slice(0, 6).forEach((event, index) => {
				search.set(`ev${index + 1}`, formatEventForOgServer(event))
			})
		}

		const ogImageUrl = `${OG_BASE_URL}/tx/${params.hash}?${search.toString()}`

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

function Component() {
	const { hash } = Route.useParams()
	const navigate = useNavigate()
	const loaderData = Route.useLoaderData() as Awaited<
		ReturnType<typeof fetchReceiptData>
	>

	const { data } = useQuery({
		...receiptDetailQueryOptions({ hash }),
		initialData: loaderData,
	})

	useKeyboardShortcut({
		t: () => navigate({ to: '/tx/$hash', params: { hash } }),
	})

	const { block, feeBreakdown, knownEvents, lineItems, receipt } = data

	const feePrice = lineItems.feeTotals?.[0]?.price
	const previousFee = feePrice
		? Number(Value.format(feePrice.amount, feePrice.decimals))
		: 0

	const totalPrice = lineItems.totals?.[0]?.price
	const previousTotal = totalPrice
		? Number(Value.format(totalPrice.amount, totalPrice.decimals))
		: undefined

	const feeAmount = receipt.effectiveGasPrice * receipt.gasUsed
	// Gas accounting is always in 18-decimal units (wei equivalent), even when the fee token itself
	// has a different number of decimals. Convert using 18 decimals so we get the actual token amount.
	const fee = Number(Value.format(feeAmount, 18))
	const feeDisplay = PriceFormatter.format(fee)

	const total =
		previousTotal !== undefined ? previousTotal - previousFee + fee : fee
	const totalDisplay =
		previousTotal !== undefined
			? PriceFormatter.format(previousTotal)
			: undefined

	return (
		<div className="font-mono text-[13px] flex flex-col items-center justify-center gap-8 pt-16 pb-8 grow print:pt-8 print:pb-0 print:grow-0">
			<Receipt
				blockNumber={receipt.blockNumber}
				events={knownEvents}
				fee={fee}
				feeBreakdown={feeBreakdown}
				feeDisplay={feeDisplay}
				hash={receipt.transactionHash}
				sender={receipt.from}
				status={receipt.status}
				timestamp={block.timestamp}
				total={total}
				totalDisplay={totalDisplay}
			/>
		</div>
	)
}

namespace TextRenderer {
	const width = 76
	const indent = '  '

	export function render(data: Awaited<ReturnType<typeof fetchReceiptData>>) {
		const { lineItems, receipt, timestampFormatted } = data

		const lines: string[] = []

		// Header
		lines.push(center('TEMPO RECEIPT'))
		lines.push('')

		// Transaction details
		lines.push(`Tx Hash: ${receipt.transactionHash}`)
		lines.push(`Date: ${timestampFormatted}`)
		lines.push(`Block: ${receipt.blockNumber.toString()}`)
		lines.push(`Sender: ${receipt.from}`)
		lines.push('')
		lines.push('-'.repeat(width))
		lines.push('')

		// Main line items
		if (lineItems.main) {
			for (const item of lineItems.main) {
				// Render `left` and `right`
				lines.push(leftRight(item.ui.left.toUpperCase(), item.ui.right))

				// Render `bottom`
				if ('bottom' in item.ui && item.ui.bottom) {
					for (const bottom of item.ui.bottom) {
						if (bottom.right)
							lines.push(`${indent}${leftRight(bottom.left, bottom.right)}`)
						else lines.push(`${indent}${bottom.left}`)
					}
				}
			}

			lines.push('')
		}

		// Fee breakdown
		if (lineItems.feeBreakdown?.length) {
			for (const item of lineItems.feeBreakdown) {
				const label = item.symbol ? `Fee (${item.symbol})` : 'Fee'
				const amount = PriceFormatter.format(item.amount, {
					decimals: item.decimals,
					format: 'short',
				})
				lines.push(leftRight(label.toUpperCase(), amount))
				if (item.payer) lines.push(`${indent}Paid by: ${item.payer}`)
			}

			lines.push('')
		}

		// Fee totals
		if (lineItems.feeTotals)
			for (const item of lineItems.feeTotals)
				lines.push(leftRight(item.ui.left.toUpperCase(), item.ui.right))

		// Totals
		if (lineItems.totals)
			for (const item of lineItems.totals)
				lines.push(leftRight(item.ui.left.toUpperCase(), item.ui.right))

		return lines.join('\n')
	}

	function center(text: string): string {
		const padding = Math.max(0, Math.floor((width - text.length) / 2))
		return ' '.repeat(padding) + text
	}

	function leftRight(left: string, right: string): string {
		const spacing = Math.max(1, width - left.length - right.length)
		return left + ' '.repeat(spacing) + right
	}
}
