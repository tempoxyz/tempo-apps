import { env } from 'cloudflare:workers'
import puppeteer from '@cloudflare/puppeteer'
import { queryOptions, useQuery } from '@tanstack/react-query'
import { createFileRoute, notFound, rootRouteId } from '@tanstack/react-router'
import { Hex, Json, Value } from 'ox'
import { getBlock, getTransaction, getTransactionReceipt } from 'wagmi/actions'
import * as z from 'zod/mini'
import { Receipt } from '#components/transaction/receipt/Receipt'
import { NotFound } from '#components/ui/NotFound'
import { parseKnownEvents } from '#lib/domain/known-events'
import { LineItems } from '#lib/domain/receipt'
import * as Tip20 from '#lib/domain/tip20'
import { DateFormatter, HexFormatter, PriceFormatter } from '#lib/formatting'
import { getConfig } from '#wagmi.config'

function receiptDetailQueryOptions(params: { hash: Hex.Hex; rpcUrl?: string }) {
	return queryOptions({
		queryKey: ['receipt-detail', params.hash, params.rpcUrl],
		queryFn: () => fetchReceiptData(params),
	})
}

async function fetchReceiptData(params: { hash: Hex.Hex; rpcUrl?: string }) {
	const config = getConfig({ rpcUrl: params.rpcUrl })
	const receipt = await getTransactionReceipt(config, {
		hash: params.hash,
	})
	const [block, transaction, getTokenMetadata] = await Promise.all([
		getBlock(config, { blockHash: receipt.blockHash }),
		getTransaction(config, { hash: receipt.transactionHash }),
		Tip20.metadataFromLogs(receipt.logs),
	])
	const timestampFormatted = DateFormatter.format(block.timestamp)

	const lineItems = LineItems.fromReceipt(receipt, { getTokenMetadata })
	const knownEvents = parseKnownEvents(receipt, {
		transaction,
		getTokenMetadata,
	})

	return {
		block,
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
	notFoundComponent: NotFound,
	headers: () => ({
		...(import.meta.env.PROD
			? {
					'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
				}
			: {}),
	}),
	// @ts-expect-error - TODO: fix
	loader: async ({ params, context }) => {
		try {
			const hash = parseHashFromParams(params)
			if (!hash) throw notFound()

			return await context.queryClient.ensureQueryData(
				receiptDetailQueryOptions({ hash }),
			)
		} catch (error) {
			console.error(error)
			throw notFound({
				routeId: rootRouteId,
				data: {
					error: error instanceof Error ? error.message : 'Unknown error',
				},
			})
		}
	},
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
})

function Component() {
	const { hash } = Route.useParams()
	const loaderData = Route.useLoaderData() as Awaited<
		ReturnType<typeof fetchReceiptData>
	>

	const { data } = useQuery({
		...receiptDetailQueryOptions({ hash }),
		initialData: loaderData,
	})

	const { block, knownEvents, lineItems, receipt } = data

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
		<div className="font-mono text-[13px] flex flex-col items-center justify-center gap-8 pt-16 pb-8 grow">
			<Receipt
				blockNumber={receipt.blockNumber}
				events={knownEvents}
				fee={fee}
				feeBreakdown={lineItems.feeBreakdown}
				feeDisplay={feeDisplay}
				hash={receipt.transactionHash}
				sender={receipt.from}
				timestamp={block.timestamp}
				total={total}
				totalDisplay={totalDisplay}
			/>
		</div>
	)
}

namespace TextRenderer {
	const width = 50
	const indent = '  '

	export function render(data: Awaited<ReturnType<typeof fetchReceiptData>>) {
		const { lineItems, receipt, timestampFormatted } = data

		const lines: string[] = []

		// Header
		lines.push(center('TEMPO RECEIPT'))
		lines.push('')

		// Transaction details
		lines.push(`Tx Hash: ${HexFormatter.truncate(receipt.transactionHash, 8)}`)
		lines.push(`Date: ${timestampFormatted}`)
		lines.push(`Block: ${receipt.blockNumber.toString()}`)
		lines.push(`Sender: ${HexFormatter.truncate(receipt.from, 6)}`)
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
				if (item.payer)
					lines.push(
						`${indent}Paid by: ${HexFormatter.truncate(item.payer, 6)}`,
					)
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
