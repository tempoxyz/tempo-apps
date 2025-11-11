import { env } from 'cloudflare:workers'
import puppeteer from '@cloudflare/puppeteer'
import { createFileRoute } from '@tanstack/react-router'
import { Address, Hex, Json } from 'ox'
import * as React from 'react'
import { TokenRole } from 'tempo.ts/ox'
import { Abis } from 'tempo.ts/viem'
import { Actions } from 'tempo.ts/wagmi'
import {
	type AbiEvent,
	type Log,
	parseEventLogs,
	type TransactionReceipt,
} from 'viem'
import { getBlock, getTransaction, getTransactionReceipt } from 'viem/actions'
import { getClient } from 'wagmi/actions'
import * as z from 'zod/mini'
import { Receipt } from '#components/Receipt/Receipt.tsx'
import { DateFormatter, HexFormatter, PriceFormatter } from '#formatting.ts'
import { parseKnownEvents } from '#known-events.ts'
import { config, getConfig } from '#wagmi.config.ts'

async function loader({
	location,
	params,
}: {
	location: { search: { r?: string | undefined } }
	params: unknown
}) {
	const { r: rpcUrl } = location.search
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

	const client = getClient(getConfig({ rpcUrl }))
	const receipt = await getTransactionReceipt(client, {
		hash,
	})
	const [block, transaction, tokenMetadata] = await Promise.all([
		getBlock(client, {
			blockHash: receipt.blockHash,
		}),
		getTransaction(client, {
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
		tokenMetadata,
		transaction,
	}
}

export const Route = createFileRoute('/_layout/receipt/$hash')({
	component: Component,
	headers: () => ({
		...(import.meta.env.PROD
			? {
					'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
				}
			: {}),
	}),
	// @ts-expect-error - TODO: fix
	loader,
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

				if (type === 'text/plain') {
					const data = await loader({
						location: { search: { r: rpcUrl } },
						params,
					})
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
					const { lineItems, receipt } = await loader({
						location: { search: { r: rpcUrl } },
						params,
					})
					return Response.json(
						JSON.parse(Json.stringify({ lineItems, receipt })),
					)
				}

				if (type === 'application/pdf') {
					// @ts-expect-error - TODO: shoudn't error
					const browser = await puppeteer.launch(env.BROWSER)
					const page = await browser.newPage()

					// Get the current URL without .pdf extension
					const htmlUrl = `${url.href.replace(/\.pdf$/, '')}?plain`

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
	validateSearch: z.object({
		r: z.optional(z.string()),
	}).parse,
})

function Component() {
	const { block, lineItems, receipt, transaction } = Route.useLoaderData()

	const fee = lineItems.feeTotals?.[0]?.ui?.right
	const total = lineItems.totals?.[0]?.ui?.right

	const knownEvents = React.useMemo(() => parseKnownEvents(receipt), [receipt])

	return (
		<div className="font-mono text-[13px] flex flex-col items-center justify-center min-h-screen gap-8">
			<Receipt
				blockNumber={receipt.blockNumber}
				sender={transaction.from}
				hash={receipt.transactionHash}
				timestamp={block.timestamp}
				events={knownEvents}
				fee={fee}
				total={total}
			/>
		</div>
	)
}

export namespace TextRenderer {
	const width = 50
	const indent = '  '

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

		////////////////////////////////////////////////////////////

		const preferenceMap = new Map<string, string>()

		for (const event of events) {
			let key: string | undefined

			// `TransferWithMemo` and `Transfer` events are paired with each other,
			// we will need to take preference on `TransferWithMemo` for those instances.
			if (event.eventName === 'TransferWithMemo') {
				const [_, from, to] = event.topics
				key = `${from}${to}`
			}

			// `Mint` and `Transfer` events are paired with each other,
			// we will need to take preference on `Mint` for those instances.
			if (event.eventName === 'Mint') {
				const [_, to] = event.topics
				key = `${event.address}${event.data}${to}`
			}

			// `Burn` and `Transfer` events are paired with each other,
			// we will need to take preference on `Burn` for those instances.
			if (event.eventName === 'Burn') {
				const [_, from] = event.topics
				key = `${event.address}${event.data}${from}`
			}

			if (key) preferenceMap.set(key, event.eventName)
		}

		const dedupedEvents = events.filter((event) => {
			let include = true

			if (event.eventName === 'Transfer') {
				{
					// Check TransferWithMemo dedup
					const [_, from, to] = event.topics
					const key = `${from}${to}`
					if (preferenceMap.get(key)?.includes('TransferWithMemo'))
						include = false
				}

				{
					// Check Mint dedup
					const [_, __, to] = event.topics
					const key = `${event.address}${event.data}${to}`
					if (preferenceMap.get(key)?.includes('Mint')) include = false
				}

				{
					// Check Burn dedup
					const [_, from] = event.topics
					const key = `${event.address}${event.data}${from}`
					if (preferenceMap.get(key)?.includes('Burn')) include = false
				}
			}

			return include
		})

		////////////////////////////////////////////////////////////

		const items: Record<'main' | 'feeTotals' | 'totals', LineItem.LineItem[]> =
			{
				main: [],
				feeTotals: [],
				totals: [],
			}

		// Map log events to receipt line items.
		for (const event of dedupedEvents) {
			switch (event.eventName) {
				case 'Burn': {
					if ('amount' in event.args) {
						const { amount, from } = event.args

						const metadata = tokenMetadata.get(event.address)
						if (!metadata) {
							items.main.push(LineItem.noop(event))
							break
						}

						const { currency, decimals, symbol } = metadata

						const isSelf = Address.isEqual(from, sender)

						items.main.push(
							LineItem.from({
								event,
								price: isSelf
									? {
											amount,
											currency,
											decimals,
											symbol,
											token: event.address,
										}
									: undefined,
								ui: {
									bottom: [
										{
											left: `From: ${HexFormatter.truncate(from)}`,
										},
									],
									left: 'Burn ${symbol}',
									right: decimals
										? PriceFormatter.format(amount, decimals)
										: '-',
								},
							}),
						)
						break
					}

					items.main.push(LineItem.noop(event))
					break
				}

				case 'RoleMembershipUpdated': {
					const { account, hasRole, role } = event.args

					const roleName =
						TokenRole.roles.find((r) => TokenRole.serialize(r) === role) ??
						undefined

					items.main.push(
						LineItem.from({
							event,
							position: 'main',
							ui: {
								bottom: [
									{
										left: `To: ${HexFormatter.truncate(account)}`,
									},
									{
										left: 'Role: ${roleName}',
									},
								],
								left: `${roleName ? `${roleName} ` : ' '}Role ${hasRole ? 'Granted' : 'Revoked'}`,
								right: '-',
							},
						}),
					)
					break
				}

				case 'Mint': {
					if ('amount' in event.args) {
						const metadata = tokenMetadata.get(event.address)
						if (!metadata) {
							items.main.push(LineItem.noop(event))
							break
						}

						const { decimals } = metadata
						const { amount, to } = event.args

						items.main.push(
							LineItem.from({
								event,
								ui: {
									bottom: [
										{
											left: `To: ${HexFormatter.truncate(to)}`,
										},
									],
									left: `Mint ${metadata?.symbol ? ` ${metadata.symbol}` : ''}`,
									right: decimals
										? `(${PriceFormatter.format(amount, decimals)})`
										: '',
								},
							}),
						)
						break
					}

					items.main.push(LineItem.noop(event))
					break
				}

				case 'TokenCreated': {
					const { symbol } = event.args
					items.main.push(
						LineItem.from({
							event,
							ui: {
								left: `Create Token (${symbol})`,
								right: '-',
							},
						}),
					)
					break
				}

				case 'TransferWithMemo':
				case 'Transfer': {
					const { amount, from, to } = event.args
					const token = event.address

					const metadata = tokenMetadata.get(token)
					if (!metadata) {
						items.main.push(LineItem.noop(event))
						break
					}

					const isCredit = Address.isEqual(to, sender)
					const memo =
						'memo' in event.args
							? Hex.toString(Hex.trimLeft(event.args.memo))
							: undefined

					const { currency, decimals, symbol } = metadata

					const isFee = to.toLowerCase().startsWith('0xfeec00000')
					if (isFee) {
						const feePayer = !Address.isEqual(from, sender) ? from : ''
						items.feeTotals.push(
							LineItem.from({
								event,
								isFee,
								price: {
									amount,
									currency,
									decimals,
									symbol,
									token,
								},
								ui: {
									left: `${symbol} ${feePayer ? `(PAID BY ${HexFormatter.truncate(feePayer)})` : ''}`,
									right: decimals
										? PriceFormatter.format(amount, decimals)
										: '-',
								},
							}),
						)
						break
					}

					items.main.push(
						LineItem.from({
							event,
							price: {
								amount: isCredit ? -amount : amount,
								currency,
								decimals,
								symbol,
								token,
							},
							ui: {
								bottom: [...(memo ? [{ left: `Memo: ${memo}` }] : [])],
								left: `Send ${symbol} ${to ? `to ${HexFormatter.truncate(to)}` : ''}`,
								right: decimals
									? PriceFormatter.format(isCredit ? -amount : amount, decimals)
									: '-',
							},
						}),
					)
					break
				}

				default: {
					items.main.push(LineItem.noop(event))
				}
			}
		}

		////////////////////////////////////////////////////////////

		// Calculate fee totals grouped by currency -> symbol
		type Currency = string
		type Symbol = string
		const feeTotals = new Map<
			Currency,
			{
				amount: bigint
				decimals: number
				tokens: Map<Symbol, LineItem.LineItem['price']>
			}
		>()
		for (const item of items.feeTotals) {
			if (!item.isFee) continue

			const { price } = item
			if (!price) continue

			const { amount, currency, decimals, symbol, token } = price
			if (!currency) continue
			if (!decimals) continue
			if (!symbol) continue

			let currencyMap = feeTotals.get(currency)
			currencyMap ??= {
				amount: 0n,
				decimals,
				tokens: new Map(),
			}

			const existing = currencyMap.tokens.get(symbol)
			if (existing) existing.amount += amount
			else currencyMap.tokens.set(symbol, { amount, currency, decimals, token })

			currencyMap.amount += amount

			feeTotals.set(currency, currencyMap)
		}

		// Add fee totals to line items
		for (const [currency, { amount, decimals }] of feeTotals)
			items.feeTotals = [
				LineItem.from({
					position: 'end',
					price: {
						amount,
						decimals,
						currency,
					},
					ui: {
						left: 'Fee',
						right: decimals ? PriceFormatter.format(amount, decimals) : '-',
					},
				}),
			]

		// Calculate totals grouped by currency
		const totals = new Map<string, LineItem.LineItem['price']>()
		for (const item of [...items.main, ...items.feeTotals]) {
			if (!('price' in item)) continue

			const { price } = item
			if (!price) continue

			const existing = totals.get(price.currency)
			if (existing) existing.amount += price.amount
			else totals.set(price.currency, price)
		}

		// Add totals to line items
		for (const [_, price] of totals) {
			if (!price) continue
			const { amount, decimals } = price
			const formatted = decimals ? PriceFormatter.format(amount, decimals) : '-'
			items.totals.push(
				LineItem.from({
					ui: {
						left: 'Total',
						right: formatted,
					},
				}),
			)
		}

		return items
	}
}

export namespace LineItem {
	export type LineItem = {
		/**
		 * Event log emitted.
		 */
		event?: Log<bigint, number, boolean, AbiEvent> | undefined
		/**
		 * Whether the line item is a fee item.
		 */
		isFee?: boolean | undefined
		/**
		 * Grouping key.
		 */
		key?: string | undefined
		/**
		 * Price of the line item.
		 */
		price?:
			| {
					/**
					 * Amount in units of the token.
					 */
					amount: bigint
					/**
					 * Currency of the token.
					 */
					currency: string
					/**
					 * Decimals of the token.
					 */
					decimals: number
					/**
					 * Symbol of the token.
					 */
					symbol?: string | undefined
					/**
					 * Address of the TIP20 token.
					 */
					token?: Address.Address | undefined
			  }
			| undefined
		/**
		 * UI data of the line item.
		 */
		ui: {
			/**
			 * Bottom data of the line item.
			 */
			bottom?:
				| {
						/**
						 * Left text of the line item.
						 */
						left: string
						/**
						 * Right text of the line item.
						 */
						right?: string | undefined
				  }[]
				| undefined
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

	export function from<const item extends LineItem>(
		item: item,
	): item & {
		eventName: item['event'] extends { eventName: infer eventName }
			? eventName
			: undefined
	} {
		return {
			...item,
			eventName: item.event?.eventName,
		} as never
	}

	export function noop(event: Log<bigint, number, boolean, AbiEvent>) {
		return LineItem.from({
			event,
			position: 'main',
			ui: {
				left: event.eventName,
				right: '-',
			},
		})
	}
}
