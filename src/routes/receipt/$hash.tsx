import { env } from 'cloudflare:workers'
import puppeteer from '@cloudflare/puppeteer'
import { createFileRoute } from '@tanstack/react-router'
import { Address, Hex, Json, Value } from 'ox'
import { Abis } from 'tempo.ts/viem'
import { Actions } from 'tempo.ts/wagmi'
import { type Log, parseEventLogs, type TransactionReceipt } from 'viem'
import { getBlock, getTransaction, getTransactionReceipt } from 'wagmi/actions'
import * as z from 'zod/mini'

import { config } from '../../wagmi.config'

async function loader({ params }: { params: unknown }) {
	const { hash } = z
		.object({
			hash: z
				.pipe(
					z.string(),
					z.transform(
						(val) => val.replace(/(\.json|\.txt|\.pdf)$/, '') as Hex.Hex,
					),
				)
				.check(z.regex(/^0x[a-fA-F0-9]{64}$/)),
		})
		.parse(params)

	const receipt = await getTransactionReceipt(config, {
		hash,
	})
	const [block, transaction, tokenMetadata] = await Promise.all([
		getBlock(config, {
			blockHash: receipt.blockHash,
		}),
		getTransaction(config, {
			hash: receipt.transactionHash,
		}),
		TokenMetadata.fromLogs(receipt.logs),
	])
	const timestampFormatted = DateFormatter.format(block.timestamp)

	const lineItems = LineItems.fromReceipt(receipt, { tokenMetadata })

	return {
		block,
		lineItems,
		receipt,
		timestampFormatted,
		transaction,
	}
}

export const Route = createFileRoute('/receipt/$hash')({
	component: Component,
	headers: () => ({
		'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
	}),
	loader,
	server: {
		handlers: {
			async GET({ params, request, next }) {
				const accept = request.headers.get('accept')?.toLowerCase() || ''

				const userAgent = request.headers.get('user-agent')?.toLowerCase() || ''
				const isTerminal =
					userAgent.includes('curl') ||
					userAgent.includes('wget') ||
					userAgent.includes('httpie')

				const type = (() => {
					if (
						request.url.endsWith('.pdf') ||
						accept.includes('application/pdf')
					)
						return 'application/pdf'
					if (
						request.url.endsWith('.json') ||
						accept.includes('application/json')
					)
						return 'application/json'
					if (
						request.url.endsWith('.txt') ||
						isTerminal ||
						accept.includes('text/plain')
					)
						return 'text/plain'
				})()

				if (type === 'text/plain') {
					const data = await loader({ params })
					const text = TextRenderer.render(data)
					return new Response(text, {
						headers: {
							'Content-Type': 'text/plain; charset=utf-8',
							'Content-Disposition': 'inline',
							'Cache-Control':
								'public, max-age=3600, stale-while-revalidate=86400',
						},
					})
				}

				if (type === 'application/json') {
					const { lineItems, receipt } = await loader({ params })
					return Response.json(
						JSON.parse(Json.stringify({ lineItems, receipt })),
					)
				}

				if (type === 'application/pdf') {
					const browser = await puppeteer.launch(env.BROWSER)
					const page = await browser.newPage()

					// Get the current URL without .pdf extension
					const url = new URL(request.url)
					const htmlUrl = url.href.replace(/\.pdf$/, '')

					// Navigate to the HTML version of the receipt
					await page.goto(htmlUrl, { waitUntil: 'domcontentloaded' })

					// Generate PDF
					const pdf = await page.pdf({
						printBackground: true,
						format: 'A4',
					})

					await browser.close()

					return new Response(Buffer.from(pdf), {
						headers: {
							'Cache-Control':
								'public, max-age=3600, stale-while-revalidate=86400',
							'Content-Type': 'application/pdf',
							'Content-Disposition': 'inline; filename="receipt.pdf"',
						},
					})
				}

				return next()
			},
		},
	},
})

function Component() {
	const { lineItems, receipt, timestampFormatted, transaction } =
		Route.useLoaderData()

	return (
		<div className="font-mono text-[13px] flex items-center justify-center min-h-screen">
			<div className="relative bg-surface p-4 max-w-[360px] w-full before:content-[''] before:absolute before:left-0 before:right-0 before:h-3 before:-top-3 before:bg-[radial-gradient(circle_at_6px_0px,transparent_6px,var(--background-color-surface)_6px)] before:bg-size-[12px_12px] before:bg-repeat-x after:content-[''] after:absolute after:left-0 after:right-0 after:h-3 after:-bottom-3 after:bg-[radial-gradient(circle_at_6px_0px,transparent_6px,var(--background-color-surface)_6px)] after:bg-size-[12px_12px] after:bg-repeat-x after:rotate-180">
				<div className="italic text-center text-[14px]">TEMPO RECEIPT</div>

				<div className="h-4" />

				<div className="truncate">
					Tx Hash: {HexFormatter.truncate(receipt.transactionHash, 8)}
				</div>
				<div>Date: {timestampFormatted}</div>
				<div>Block: {receipt.blockNumber.toString()}</div>
				<div>Sender: {HexFormatter.truncate(transaction.from, 6)}</div>

				<div className="h-4" />
				<div className="w-full border-t border-dashed border-(--text-color-primary)" />
				<div className="h-4" />

				{lineItems.main?.flatMap((item, i) => [
					// `left` + `right` renderer
					<div
						className="flex items-center justify-between uppercase"
						key={i.toString()}
					>
						<div>{item.ui.left}</div>
						<div>{item.ui.right}</div>
					</div>,
					// `bottom` Renderer
					<div key={(i + 1).toString()}>
						{(() => {
							if (item.eventName === 'TransferWithMemo' && 'bottom' in item.ui)
								return (
									<div className="pl-4 uppercase">
										Memo: {item.ui.bottom?.memo}
									</div>
								)
							return null
						})()}
					</div>,
				])}

				<div className="h-4" />

				{lineItems.end?.map((item, i) => (
					<div className="flex items-center justify-between" key={i.toString()}>
						<div className="uppercase">{item.ui.left}</div>
						<div>{item.ui.right}</div>
					</div>
				))}
			</div>
		</div>
	)
}

//////////////////////////////////////////////////////////////////
// Utilities
//
// Note: Feel free to extract out into a separate file if you need
// to reuse elsewhere!

export namespace HexFormatter {
	export function truncate(value: Hex.Hex, chars = 4) {
		return value.length < chars * 2 + 2
			? value
			: `${value.slice(0, chars + 2)}…${value.slice(-chars)}`
	}
}

export namespace DateFormatter {
	/**
	 * Formats a timestamp to a localized date-time string.
	 *
	 * @param timestamp - The timestamp in seconds.
	 * @returns The formatted date-time string.
	 */
	export function format(timestamp: bigint) {
		return new Date(Number(timestamp) * 1000).toLocaleString(undefined, {
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
		})
	}
}

export namespace PriceFormatter {
	/**
	 * Formats a number or bigint to a currency-formatted string.
	 *
	 * @param value - The number or bigint to format.
	 * @returns The formatted string.
	 */
	export function format(value: number | bigint, decimals: number) {
		if (Number(value) > 0 && Number(value) < 0.01) return '<$0.01'
		const value_ = Value.format(BigInt(value), decimals)
		return numberIntl.format(Number(value_))
	}

	/** @internal */
	const numberIntl = new Intl.NumberFormat('en-US', {
		currency: 'USD',
		style: 'currency',
	})
}

export namespace TextRenderer {
	const width = 50

	export function render(data: Awaited<ReturnType<typeof loader>>) {
		const { lineItems, receipt, timestampFormatted, transaction } = data

		const lines: string[] = []

		// Header
		lines.push(center('TEMPO RECEIPT'))
		lines.push('')

		// Transaction details
		lines.push(`Tx Hash: ${HexFormatter.truncate(receipt.transactionHash, 8)}`)
		lines.push(`Date: ${timestampFormatted}`)
		lines.push(`Block: ${receipt.blockNumber.toString()}`)
		lines.push(`Sender: ${HexFormatter.truncate(transaction.from, 6)}`)
		lines.push('')
		lines.push('-'.repeat(width))
		lines.push('')

		// Main line items
		if (lineItems.main) {
			for (const item of lineItems.main) {
				// Render `left` and `right`
				lines.push(leftRight(item.ui.left.toUpperCase(), item.ui.right))

				// Render `bottom`
				if (
					item.eventName === 'TransferWithMemo' &&
					'bottom' in item.ui &&
					item.ui.bottom?.memo
				) {
					lines.push(`  MEMO: ${item.ui.bottom.memo.toString().toUpperCase()}`)
				}
			}
			lines.push('')
		}

		// End line items (fees, totals)
		if (lineItems.end)
			for (const item of lineItems.end)
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

const abi = Object.values(Abis).flat()

export namespace TokenMetadata {
	export type Metadata = Actions.token.getMetadata.ReturnValue
	export type MetadataMap = Map<Address.Address, Metadata>

	export async function fromLogs(logs: Log[]) {
		const events = parseEventLogs({
			abi,
			logs,
		})

		const tip20Addresses = events
			.filter((event) => event.address.toLowerCase().startsWith('0x20c000000'))
			.map((event) => event.address)
		const metadataResults = await Promise.all(
			tip20Addresses.map((token) =>
				Actions.token.getMetadata(config, { token }),
			),
		)
		const tokenMetadata = new Map<Address.Address, Metadata>()
		for (const [index, address] of tip20Addresses.entries())
			tokenMetadata.set(address, metadataResults[index])

		return tokenMetadata
	}
}

export namespace LineItems {
	export function fromReceipt(
		receipt: TransactionReceipt,
		{ tokenMetadata }: { tokenMetadata: TokenMetadata.MetadataMap },
	) {
		const { from: sender, logs } = receipt

		// Extract all of the event logs we can from the receipt.
		const events = parseEventLogs({
			abi,
			logs,
		})

		// `TransferWithMemo` and `Transfer` events are paired with each other,
		// we will need to take preference on `TransferWithMemo` for those instances.
		const keys = new Set<string>()
		for (const event of events) {
			if (event.eventName === 'TransferWithMemo') {
				const [_, from, to] = event.topics
				const key = `${from}${to}`
				keys.add(key)
			}
		}
		const filteredEvents = events.filter((event) => {
			if (event.eventName !== 'Transfer') return true
			const [_, from, to] = event.topics
			const key = `${from}${to}`
			return !keys.has(key)
		})

		// Map log events to receipt line items.
		const items = filteredEvents.map((event) => {
			switch (event.eventName) {
				case 'TokenCreated': {
					const { symbol } = event.args
					return LineItem.from({
						event,
						eventName: event.eventName,
						position: 'main',
						ui: {
							left: `Create Token (${symbol})`,
							right: '-',
						},
					})
				}

				case 'TransferWithMemo':
				case 'Transfer': {
					const { amount, from, to } = event.args
					const memo =
						'memo' in event.args
							? Hex.toString(Hex.trimLeft(event.args.memo))
							: undefined

					const token = event.address
					const metadata = tokenMetadata.get(token)
					const decimals = metadata?.decimals

					const isFee = to.toLowerCase().startsWith('0xfeec00000')
					if (isFee) {
						const feePayer = !Address.isEqual(from, sender) ? from : ''
						return LineItem.from({
							event,
							eventName: event.eventName,
							position: 'end',
							price: {
								amount,
								metadata,
								token,
							},
							ui: {
								left: `Fee ${feePayer ? `(PAID BY ${HexFormatter.truncate(feePayer)})` : ''}`,
								right: decimals ? PriceFormatter.format(amount, decimals) : '-',
							},
						})
					}

					return LineItem.from({
						event,
						eventName: event.eventName,
						position: 'main',
						price: {
							amount,
							metadata,
							token,
						},
						ui: {
							bottom: {
								memo,
							},
							left: `Send${metadata?.symbol ? ` ${metadata.symbol}` : ''} ${to ? `to ${HexFormatter.truncate(to)}` : ''}`,
							right: decimals ? PriceFormatter.format(amount, decimals) : '-',
						},
					})
				}

				default: {
					return LineItem.from({
						event,
						eventName: event.eventName,
						position: 'main',
						ui: {
							left: event.eventName,
							right: '-',
						},
					})
				}
			}
		})

		// Calculate totals grouped by currency
		const totals = new Map<
			string,
			{ amount: bigint; metadata?: TokenMetadata.Metadata }
		>()
		for (const item of items) {
			if (!('price' in item)) continue

			const { price } = item
			if (!price) continue

			const { amount, metadata } = price
			if (!metadata) continue

			const { currency } = metadata
			const existing = totals.get(currency)
			if (existing) existing.amount += amount
			else totals.set(currency, { amount, metadata })
		}

		// Add totals to line items
		for (const [_, { amount, metadata }] of totals) {
			if (!metadata) continue
			const { decimals } = metadata
			const formatted = decimals ? PriceFormatter.format(amount, decimals) : '-'
			items.push(
				LineItem.from({
					position: 'end',
					ui: {
						left: 'Total',
						right: formatted,
					},
				}) as never,
			)
		}

		return Object.groupBy(items, (item) => item.position)
	}
}

export namespace LineItem {
	export type LineItem = {
		/**
		 * Event log emitted.
		 */
		event?: Log | undefined
		/**
		 * Position of where the line item should be rendered.
		 *
		 * - `main`: Main line items.
		 * - `end`: End line items.
		 */
		position: 'main' | 'end'
		/**
		 * Price of the line item.
		 */
		price?:
			| {
					/**
					 * Amount in units of the TIP20 token.
					 */
					amount: bigint
					/**
					 * Metadata of the TIP20 token.
					 */
					metadata?: TokenMetadata.Metadata | undefined
					/**
					 * Address of the TIP20 token.
					 */
					token: Address.Address
			  }
			| undefined
		/**
		 * UI data of the line item.
		 */
		ui: {
			/**
			 * Bottom data of the line item.
			 */
			bottom?: unknown | undefined
			/**
			 * Left text of the line item.
			 */
			left: string
			/**
			 * Right text of the line item.
			 */
			right: string
		}
	}

	export function from<const item extends LineItem>(item: item): item {
		return item
	}
}
