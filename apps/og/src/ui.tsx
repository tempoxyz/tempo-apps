import { truncateText } from '#params.ts'

// ============ Types ============

export type AccountType = 'empty' | 'account' | 'contract'

export interface AddressData {
	address: string
	holdings: string
	txCount: string
	lastActive: string
	created: string
	feeToken?: string
	tokensHeld: string[]
	accountType?: AccountType
	methods?: string[]
	deployer?: string
	contractName?: string
}

export interface TokenData {
	address: string
	name: string
	symbol: string
	currency: string
	holders: string
	supply: string
	created: string
	quoteToken?: string
	isFeeToken?: boolean
}

export interface BlockData {
	number: string
	timestamp: string
	unixTimestamp: string
	txCount: string
	miner: string
	parentHash: string
	gasUsage: string
	prevBlockTxCounts?: number[]
}

export interface ReceiptData {
	hash: string
	blockNumber: string
	sender: string
	date: string
	time: string
	fee?: string
	feeToken?: string
	feePayer?: string
	total?: string
	events: ReceiptEvent[]
	eventsFailed?: boolean
	status?: 'success' | 'reverted'
}

interface ReceiptEvent {
	action: string
	details: string
	amount?: string
	message?: string
}

// ============ Helpers ============

const PILL_STYLE = {
	borderRadius: '8px',
	paddingLeft: '10px',
	paddingRight: '10px',
	paddingTop: '5px',
	paddingBottom: '5px',
}

function truncateHash(hash: string, chars = 4): string {
	if (!hash || hash === '—') return hash
	if (hash.length <= chars * 2 + 2) return hash
	return `${hash.slice(0, chars + 2)}…${hash.slice(-chars)}`
}

function formatDateSmart(date: string, time: string): string {
	if (date === '—') return '—'

	const monthsFull = [
		'January',
		'February',
		'March',
		'April',
		'May',
		'June',
		'July',
		'August',
		'September',
		'October',
		'November',
		'December',
	]

	let month = ''
	let day = ''
	let year = ''
	let timeStr = time

	const dateMatch1 = date.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
	if (dateMatch1) {
		const m = Number.parseInt(dateMatch1[1] ?? '1', 10)
		day = dateMatch1[2] ?? '1'
		year = dateMatch1[3] ?? ''
		month = monthsFull[m - 1] ?? ''
	}

	const dateMatch2 = date.match(/^(\w+)\s+(\d{1,2}),?\s+(\d{4})$/)
	if (dateMatch2) {
		month = dateMatch2[1] ?? ''
		day = dateMatch2[2] ?? ''
		year = dateMatch2[3] ?? ''
		if (month.length <= 3) {
			const idx = [
				'Jan',
				'Feb',
				'Mar',
				'Apr',
				'May',
				'Jun',
				'Jul',
				'Aug',
				'Sep',
				'Oct',
				'Nov',
				'Dec',
			].indexOf(month)
			if (idx >= 0) month = monthsFull[idx] ?? month
		}
	}

	const dateMatch3 = date.match(
		/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}:\d{2}(?::\d{2})?)\s*UTC$/,
	)
	if (dateMatch3) {
		year = dateMatch3[1] ?? ''
		const m = Number.parseInt(dateMatch3[2] ?? '1', 10)
		day = String(Number.parseInt(dateMatch3[3] ?? '1', 10))
		month = monthsFull[m - 1] ?? ''
		timeStr = dateMatch3[4] ?? time
	}

	if (!month || !day) return `${date} ${time}`

	let formattedTime = timeStr
	const t12 = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)(?:\s*GMT[+-]\d+)?$/i)
	if (t12?.[1] && t12[2] && t12[3]) {
		let h = Number.parseInt(t12[1], 10)
		const p = t12[3].toUpperCase()
		if (p === 'PM' && h !== 12) h += 12
		if (p === 'AM' && h === 12) h = 0
		formattedTime = `${h.toString().padStart(2, '0')}:${t12[2]}:00`
	} else {
		const t24 = timeStr.match(
			/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(?:GMT[+-]\d+)?$/i,
		)
		if (t24?.[1] && t24[2]) {
			formattedTime = `${t24[1].padStart(2, '0')}:${t24[2]}:${t24[3] ?? '00'}`
		}
	}

	const currentYear = new Date().getFullYear().toString()
	const datePart =
		year === currentYear ? `${month} ${day}` : `${month} ${day}, ${year}`

	return `${datePart} · ${formattedTime}`
}

function isEmptyValue(val: string): boolean {
	return (
		!val ||
		val === '—' ||
		val === '$0' ||
		val === '$0.00' ||
		val === '0' ||
		val === '0.00'
	)
}

function isHexSelector(text: string): boolean {
	return /^0x[0-9a-fA-F]{8}$/.test(text)
}

const CURRENCY_SYMBOLS: Record<string, string> = {
	USD: '$',
	EUR: '\u20AC',
	GBP: '\u00A3',
	JPY: '\u00A5',
}

export function parseEventDetails(
	details: string,
): { text: string; type: 'normal' | 'asset' | 'address' | 'selector' }[] {
	const groups: {
		text: string
		type: 'normal' | 'asset' | 'address' | 'selector'
	}[] = []

	const words = details.split(' ')
	let i = 0
	while (i < words.length) {
		const word = words[i]

		if (word && isHexSelector(word)) {
			groups.push({ text: word, type: 'selector' })
			i++
		} else if (
			word?.startsWith('0x') ||
			(word?.includes('...') && word?.match(/[0-9a-fA-F]/))
		) {
			groups.push({ text: word, type: 'address' })
			i++
		} else if (
			word?.match(/^[\d.]+$/) &&
			words[i + 1] &&
			!['for', 'to', 'from', 'on'].includes(words[i + 1] as string)
		) {
			groups.push({ text: `${word} ${words[i + 1]}`, type: 'asset' })
			i += 2
			const connector = words[i]
			if (connector && ['for', 'to', 'from', 'on'].includes(connector)) {
				groups.push({ text: connector, type: 'normal' })
				i++
			}
		} else if (['for', 'to', 'from', 'on'].includes(word || '')) {
			groups.push({ text: word || '', type: 'normal' })
			i++
		} else {
			groups.push({ text: word || '', type: 'normal' })
			i++
		}
	}

	return groups
}

// ============ Shared card styles ============

const CARD_BASE = {
	width: '700px',
	maxWidth: '700px',
	minHeight: '400px',
	maxHeight: '583px',
	overflow: 'hidden' as const,
	fontFamily: 'Pilat',
	fontWeight: 400,
	fontFeatureSettings: '"tnum"',
	boxShadow:
		'0 4px 6px -1px rgba(0,0,0,0.05), 0 10px 15px -3px rgba(0,0,0,0.05), 0 25px 50px -12px rgba(0,0,0,0.08)',
	borderTopRightRadius: '24px',
	borderTopLeftRadius: '0',
	borderBottomLeftRadius: '0',
	borderBottomRightRadius: '0',
}

const GRADIENT = {
	height: '100px',
	background:
		'linear-gradient(to bottom, rgba(255,255,255,0), rgba(255,255,255,1))',
}

const DIVIDER = { height: '1px', backgroundColor: '#d1d5db' }

// ============ Receipt Component ============

export function ReceiptCard({ data }: { data: ReceiptData }) {
	const when = formatDateSmart(data.date, data.time)
	const feeTokenLabel = data.feeToken || 'pathUSD'

	return (
		<div tw="flex flex-col bg-white relative" style={CARD_BASE}>
			{/* Header */}
			<div
				tw="flex flex-col w-full pr-12 pt-10 pb-8 text-[28px]"
				style={{
					fontFamily: 'Pilat',
					fontWeight: 400,
					fontFeatureSettings: '"tnum"',
					gap: '18px',
					paddingLeft: '48px',
					letterSpacing: '0em',
				}}
			>
				<div tw="flex w-full justify-between items-center">
					<span tw="text-gray-500 shrink-0">Block</span>
					<div tw="flex items-center" style={{ gap: '10px' }}>
						<span tw="text-gray-900">{data.blockNumber}</span>
						{data.status && (
							<span
								tw={`text-[20px] ${data.status === 'success' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}
								style={{
									borderRadius: '6px',
									paddingLeft: '8px',
									paddingRight: '8px',
									paddingTop: '3px',
									paddingBottom: '3px',
								}}
							>
								{data.status === 'success' ? 'Success' : 'Failed'}
							</span>
						)}
					</div>
				</div>
				<div tw="flex w-full justify-between">
					<span tw="text-gray-500 shrink-0">Sender</span>
					<span tw="text-blue-500">{truncateHash(data.sender, 6)}</span>
				</div>
				<div tw="flex w-full justify-between">
					<span tw="text-gray-500 shrink-0">Time (UTC)</span>
					<span>{when}</span>
				</div>
			</div>

			{/* Divider */}
			<div tw="flex w-full" style={DIVIDER} />

			{/* Events */}
			<div
				tw="flex flex-col"
				style={{ paddingTop: '12px', paddingBottom: '12px' }}
			>
				{data.eventsFailed ? (
					<div
						tw="flex px-12 py-6 text-[28px] text-gray-400"
						style={{ fontFamily: 'Pilat', letterSpacing: '0em' }}
					>
						Failed to render summary.
					</div>
				) : data.events.length === 0 ? (
					<div
						tw="flex px-12 py-6 text-[28px] text-gray-400"
						style={{ fontFamily: 'Pilat', letterSpacing: '0em' }}
					>
						No events to display.
					</div>
				) : (
					<div tw="flex flex-col">
						{data.events.slice(0, 3).map((event, index) => {
							const parts = parseEventDetails(event.details || '')
							const showAmount = event.amount && event.amount !== '$0'
							return (
								<div
									key={`event-${event.details}`}
									tw="flex px-12 py-4 text-[28px]"
									style={{
										fontFamily: 'Pilat',
										fontWeight: 400,
										fontFeatureSettings: '"tnum"',
										letterSpacing: '0em',
										justifyContent: 'space-between',
									}}
								>
									<div
										tw="flex"
										style={{
											gap: '8px',
											maxWidth: showAmount ? '85%' : '100%',
										}}
									>
										<span tw="text-gray-500 shrink-0">{index + 1}.</span>
										<div tw="flex flex-wrap" style={{ gap: '8px' }}>
											<span
												tw="bg-gray-100 text-gray-800 shrink-0"
												style={PILL_STYLE}
											>
												{event.action}
											</span>
											{parts.map((part) => (
												<span
													key={`part-${part.text}`}
													tw={
														part.type === 'asset'
															? 'text-emerald-600'
															: part.type === 'selector'
																? 'text-purple-600'
																: part.type === 'address'
																	? 'text-blue-600'
																	: 'text-gray-500'
													}
												>
													{part.text}
												</span>
											))}
										</div>
									</div>
									{showAmount && <span tw="shrink-0">{event.amount}</span>}
								</div>
							)
						})}
						{data.events.length > 3 && (
							<div
								tw="flex justify-center py-3 mx-12 text-gray-500 text-[24px]"
								style={{ fontFamily: 'Pilat', fontFeatureSettings: '"tnum"' }}
							>
								...and {data.events.length - 3} more
							</div>
						)}
					</div>
				)}
			</div>

			{/* Divider */}
			<div tw="flex w-full" style={DIVIDER} />

			{/* Fee and Total */}
			<div
				tw="flex flex-col px-12 text-[28px]"
				style={{
					fontFamily: 'Pilat',
					fontWeight: 400,
					fontFeatureSettings: '"tnum"',
					gap: '22px',
					width: '100%',
					letterSpacing: '0em',
					paddingTop: '24px',
					paddingBottom: '48px',
				}}
			>
				<div
					tw="flex items-center w-full"
					style={{ justifyContent: 'space-between' }}
				>
					<span tw="text-gray-500">Fee ({feeTokenLabel})</span>
					<span style={!data.fee ? { color: '#9ca3af' } : undefined}>
						{data.fee || '$0.00'}
					</span>
				</div>
				{data.total && (
					<div
						tw="flex items-center w-full"
						style={{ justifyContent: 'space-between' }}
					>
						<span tw="text-gray-500">Total</span>
						<span>{data.total}</span>
					</div>
				)}
			</div>
			<div tw="absolute bottom-0 left-0 right-0" style={GRADIENT} />
		</div>
	)
}

// ============ Token Card Component ============

export function TokenCard({ data, icon }: { data: TokenData; icon: string }) {
	const isLongName = data.name.length > 20
	const holdersGrey = isEmptyValue(data.holders)
	const supplyGrey = isEmptyValue(data.supply)
	const supplyDisplay = supplyGrey ? '0.00' : data.supply
	const currSym = CURRENCY_SYMBOLS[data.currency] || ''

	return (
		<div tw="flex flex-col bg-white relative" style={CARD_BASE}>
			{/* Header */}
			<div
				tw={`flex ${isLongName ? 'flex-col' : 'items-center'} pr-10 pt-10 pb-8`}
				style={{ gap: isLongName ? '12px' : '20px', paddingLeft: '56px' }}
			>
				<div tw="flex items-center" style={{ gap: '20px' }}>
					<img
						src={icon}
						alt=""
						tw="rounded-full"
						style={{ width: '68px', height: '68px' }}
					/>
					<span
						tw="text-[42px] text-gray-900"
						style={{ fontWeight: 400, lineHeight: '1.1' }}
					>
						{truncateText(data.name, 28)}
					</span>
				</div>
				<div tw="flex shrink-0 items-end justify-end" style={{ gap: '8px' }}>
					<span
						tw="flex items-center bg-gray-100 text-gray-600 text-2xl"
						style={{ ...PILL_STYLE, fontFamily: 'Pilat' }}
					>
						{truncateText(data.symbol, 12)}
					</span>
					{data.isFeeToken && (
						<span
							tw="flex items-center bg-emerald-100 text-emerald-700 text-2xl"
							style={{ ...PILL_STYLE, fontFamily: 'Pilat' }}
						>
							Fee Token
						</span>
					)}
				</div>
			</div>

			<div tw="flex w-full" style={DIVIDER} />

			{/* Details */}
			<div
				tw="flex flex-col pr-10 pt-10 pb-14 text-[29px]"
				style={{
					fontFamily: 'Pilat',
					fontWeight: 400,
					fontFeatureSettings: '"tnum"',
					gap: '29px',
					letterSpacing: '0em',
					paddingLeft: '56px',
				}}
			>
				<div tw="flex w-full justify-between">
					<span tw="text-gray-500">Address</span>
					<span tw="text-blue-500">{truncateHash(data.address, 8)}</span>
				</div>
				<div tw="flex w-full justify-between">
					<span tw="text-gray-500">Currency</span>
					<div tw="flex items-center" style={{ gap: '8px' }}>
						{currSym && (
							<span
								tw="flex items-center justify-center bg-gray-100 text-gray-700 text-[22px]"
								style={{ width: '32px', height: '32px', borderRadius: '16px' }}
							>
								{currSym}
							</span>
						)}
						<span tw="text-gray-900">{data.currency}</span>
					</div>
				</div>
				<div tw="flex w-full justify-between">
					<span tw="text-gray-500">Holders</span>
					<span
						style={holdersGrey ? { color: '#9ca3af' } : undefined}
						tw={holdersGrey ? '' : 'text-gray-900'}
					>
						{holdersGrey ? '0' : truncateText(data.holders, 16)}
					</span>
				</div>
				<div tw="flex w-full justify-between">
					<span tw="text-gray-500">Supply</span>
					<span
						style={supplyGrey ? { color: '#9ca3af' } : undefined}
						tw={supplyGrey ? '' : 'text-gray-900'}
					>
						{supplyDisplay}
					</span>
				</div>
				<div tw="flex w-full justify-between">
					<span tw="text-gray-500">Created</span>
					<span tw="text-gray-900">{data.created}</span>
				</div>
				{data.quoteToken && (
					<div tw="flex w-full justify-between">
						<span tw="text-gray-500">Quote Token</span>
						<span tw="text-gray-900">{data.quoteToken}</span>
					</div>
				)}
			</div>
			<div tw="absolute bottom-0 left-0 right-0" style={GRADIENT} />
		</div>
	)
}

// ============ Token Badges Helper ============

export function TokenBadges({
	tokens,
	maxTokens = 4,
}: {
	tokens: string[]
	maxTokens?: number
}) {
	const truncateToken = (token: string, maxLen = 8) => {
		if (token.length <= maxLen) return token
		return `${token.slice(0, maxLen - 1)}…`
	}
	const displayTokens = tokens.slice(0, maxTokens)
	const remaining = tokens.length - maxTokens

	return (
		<>
			{displayTokens.map((token, idx) => (
				<span
					key={token}
					tw="flex bg-gray-100 text-gray-700 text-[23px]"
					style={{
						...PILL_STYLE,
						fontFamily: 'Pilat',
						marginLeft: idx > 0 ? '8px' : '0',
					}}
				>
					{truncateToken(token)}
				</span>
			))}
			{remaining > 0 && (
				<span
					tw="flex bg-gray-100 text-gray-500 text-[23px]"
					style={{ ...PILL_STYLE, fontFamily: 'Pilat', marginLeft: '8px' }}
				>
					+{remaining}
				</span>
			)}
		</>
	)
}

// ============ Method Badges Helper ============

export function MethodBadges({ methods }: { methods: string[] }) {
	const maxCharsPerRow = 48
	const row1: string[] = []
	const row2: string[] = []
	let row1Chars = 0
	let row2Chars = 0

	for (const m of methods) {
		if (row1Chars + m.length <= maxCharsPerRow || row1.length === 0) {
			row1.push(m)
			row1Chars += m.length + 2
		} else if (row2Chars + m.length <= maxCharsPerRow || row2.length === 0) {
			row2.push(m)
			row2Chars += m.length + 2
		} else {
			break
		}
	}

	const displayed = row1.length + row2.length
	const remaining = methods.length - displayed

	const truncateMethod = (m: string, maxLen = 14) => {
		if (m.length <= maxLen) return m
		return `${m.slice(0, maxLen - 1)}…`
	}

	const renderBadge = (m: string, idx: number) => (
		<span
			key={idx}
			tw="bg-gray-100 text-gray-700 text-[23px]"
			style={{ ...PILL_STYLE, fontFamily: 'Pilat' }}
		>
			{truncateMethod(m)}
		</span>
	)

	return (
		<div tw="flex flex-col items-end" style={{ gap: '8px' }}>
			<div tw="flex justify-end flex-wrap" style={{ gap: '8px' }}>
				{row1.map((m, i) => renderBadge(m, i))}
				{row2.map((m, i) => renderBadge(m, i + 10))}
				{remaining > 0 && (
					<span
						tw="bg-gray-100 text-gray-500 text-[23px]"
						style={{ ...PILL_STYLE, fontFamily: 'Pilat' }}
					>
						+{remaining}
					</span>
				)}
			</div>
		</div>
	)
}

// ============ Block Card Component ============

function buildHistogramSvg(counts: number[], currentCount: number): string {
	const allCounts = [...counts, currentCount]
	const maxCount = Math.max(...allCounts, 1)
	const barW = 8
	const gap = 2
	const maxH = 24
	const totalBars = allCounts.length
	const svgW = totalBars * barW + (totalBars - 1) * gap
	let rects = ''
	for (let i = 0; i < allCounts.length; i++) {
		const count = allCounts[i] ?? 0
		const h = count === 0 ? 3 : Math.max(4, (count / maxCount) * maxH)
		const x = i * (barW + gap)
		const y = maxH - h
		const fill = i === allCounts.length - 1 ? '#3b82f6' : '#e5e7eb'
		rects += `<rect x="${x}" y="${y}" width="${barW}" height="${h}" rx="2" fill="${fill}"/>`
	}
	return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${maxH}" viewBox="0 0 ${svgW} ${maxH}">${rects}</svg>`)}`
}

function buildGasBarSvg(percentage: number): string {
	const segments = 20
	const filled = Math.round((percentage / 100) * segments)
	const segW = 4
	const segH = 24
	const gap = 2
	const svgW = segments * segW + (segments - 1) * gap
	let rects = ''
	for (let i = 0; i < segments; i++) {
		const x = i * (segW + gap)
		const fill = i < filled ? '#3b82f6' : '#f3f4f6'
		rects += `<rect x="${x}" y="0" width="${segW}" height="${segH}" rx="1" fill="${fill}"/>`
	}
	return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${segH}" viewBox="0 0 ${svgW} ${segH}">${rects}</svg>`)}`
}

export function BlockCard({ data }: { data: BlockData }) {
	const gasPercentMatch = data.gasUsage.match(/([\d.]+)%/)
	const gasPercent = gasPercentMatch
		? Number.parseFloat(gasPercentMatch[1] ?? '0')
		: undefined
	const currentTxCount =
		Number.parseInt(data.txCount.replace(/,/g, ''), 10) || 0

	return (
		<div tw="flex flex-col bg-white relative" style={CARD_BASE}>
			{/* Header */}
			<div
				tw="flex w-full pr-10 pt-10 pb-8 items-center justify-between"
				style={{ paddingLeft: '56px' }}
			>
				<span tw="text-gray-500 text-[29px]" style={{ fontFamily: 'Pilat' }}>
					Block
				</span>
				<span
					tw="text-[40px]"
					style={{ fontFamily: 'Pilat', fontFeatureSettings: '"tnum"' }}
				>
					<span style={{ color: 'rgba(0,0,0,0.15)' }}>
						{'0'.repeat(Math.max(0, 12 - data.number.length))}
					</span>
					<span tw="text-gray-900">{data.number}</span>
				</span>
			</div>

			<div tw="flex w-full" style={DIVIDER} />

			{/* Details */}
			<div
				tw="flex flex-col pr-10 pt-10 pb-14 text-[29px]"
				style={{
					fontFamily: 'Pilat',
					fontWeight: 400,
					fontFeatureSettings: '"tnum"',
					gap: '29px',
					letterSpacing: '0em',
					paddingLeft: '56px',
				}}
			>
				<div tw="flex w-full justify-between">
					<span tw="text-gray-500">UTC</span>
					<span tw="text-gray-900" style={{ opacity: 0.5 }}>
						{data.timestamp}
					</span>
				</div>
				<div tw="flex w-full justify-between">
					<span tw="text-gray-500">UNIX</span>
					<span tw="text-gray-900" style={{ opacity: 0.5 }}>
						{data.unixTimestamp}
					</span>
				</div>

				<div tw="flex w-full justify-between items-end">
					<span tw="text-gray-500">Transactions</span>
					<div tw="flex items-end" style={{ gap: '8px' }}>
						{data.prevBlockTxCounts &&
							data.prevBlockTxCounts.length > 0 &&
							data.prevBlockTxCounts.some((c) => c >= 0) && (
								<img
									src={buildHistogramSvg(
										data.prevBlockTxCounts,
										currentTxCount,
									)}
									alt=""
									style={{ height: '24px' }}
								/>
							)}
						<span tw="text-gray-900">{data.txCount}</span>
					</div>
				</div>

				<div tw="flex w-full justify-between items-center">
					<span tw="text-gray-500">Gas Usage</span>
					<div tw="flex items-center" style={{ gap: '8px' }}>
						{gasPercent !== undefined && (
							<img
								src={buildGasBarSvg(gasPercent)}
								alt=""
								style={{ height: '24px' }}
							/>
						)}
						<span tw="text-gray-900">{data.gasUsage}</span>
					</div>
				</div>

				<div tw="flex w-full justify-between">
					<span tw="text-gray-500">Miner</span>
					<span tw="text-blue-500">{truncateHash(data.miner, 6)}</span>
				</div>
				<div tw="flex w-full justify-between">
					<span tw="text-gray-500">Parent</span>
					<span tw="text-blue-500">{truncateHash(data.parentHash, 6)}</span>
				</div>
			</div>
			<div tw="absolute bottom-0 left-0 right-0" style={GRADIENT} />
		</div>
	)
}

// ============ Address Card Component ============

export function AddressCard({ data }: { data: AddressData }) {
	const addrLine1 = data.address.slice(0, 21)
	const addrLine2 = data.address.slice(21)
	const holdingsGrey = isEmptyValue(data.holdings)
	const holdingsDisplay = holdingsGrey ? '$0.00' : data.holdings

	return (
		<div tw="flex flex-col bg-white relative" style={CARD_BASE}>
			{/* Header */}
			{data.accountType === 'contract' && data.contractName ? (
				<div
					tw="flex flex-col w-full pr-10 pt-10 pb-8"
					style={{ paddingLeft: '56px' }}
				>
					<div tw="flex w-full justify-between items-center">
						<span
							tw="text-gray-500 text-[29px]"
							style={{ fontFamily: 'Pilat', fontWeight: 400 }}
						>
							Contract
						</span>
						<span
							tw="text-gray-900 text-[36px]"
							style={{ fontFamily: 'Pilat', fontWeight: 400 }}
						>
							{data.contractName}
						</span>
					</div>
					<div tw="flex justify-end">
						<span
							tw="text-gray-400 text-[22px]"
							style={{
								fontFamily: 'Pilat',
								fontWeight: 400,
								fontFeatureSettings: '"tnum"',
							}}
						>
							{truncateHash(data.address, 8)}
						</span>
					</div>
				</div>
			) : (
				<div
					tw="flex w-full pr-10 pt-10 pb-8 justify-between items-start"
					style={{ paddingLeft: '56px' }}
				>
					<span
						tw="text-gray-500 text-[29px]"
						style={{ fontFamily: 'Pilat', fontWeight: 400 }}
					>
						{data.accountType === 'contract' ? 'Contract' : 'Address'}
					</span>
					<div
						tw="flex flex-col items-end text-[29px] text-blue-500"
						style={{
							fontFamily: 'Pilat',
							fontWeight: 400,
							fontFeatureSettings: '"tnum"',
							lineHeight: '1.3',
						}}
					>
						<span>{addrLine1}</span>
						<span>{addrLine2}</span>
					</div>
				</div>
			)}

			<div tw="flex w-full" style={DIVIDER} />

			{/* Details */}
			<div
				tw="flex flex-col pr-10 pt-8 pb-14 text-[29px]"
				style={{
					fontFamily: 'Pilat',
					fontWeight: 400,
					fontFeatureSettings: '"tnum"',
					gap: '22px',
					letterSpacing: '0em',
					paddingLeft: '56px',
				}}
			>
				{/* Holdings */}
				{data.accountType !== 'contract' && (
					<div
						tw="flex w-full justify-between items-center"
						style={{ paddingTop: '6px', paddingBottom: '6px' }}
					>
						<span tw="text-gray-500">Holdings</span>
						<span
							style={holdingsGrey ? { color: '#9ca3af' } : undefined}
							tw={holdingsGrey ? '' : 'text-gray-900'}
						>
							{holdingsDisplay}
						</span>
					</div>
				)}

				{/* Assets */}
				{data.tokensHeld.length > 0 && data.accountType !== 'contract' && (
					<div
						tw="flex w-full justify-between items-center"
						style={{ paddingTop: '2px', paddingBottom: '2px' }}
					>
						<span tw="text-gray-500">Assets</span>
						<div tw="flex flex-wrap justify-end" style={{ gap: '0px' }}>
							<TokenBadges tokens={data.tokensHeld} maxTokens={4} />
						</div>
					</div>
				)}

				{/* Divider (when not contract) */}
				{data.accountType !== 'contract' && (
					<div
						tw="flex"
						style={{
							height: '1px',
							backgroundColor: '#d1d5db',
							marginLeft: '-56px',
							marginRight: '-40px',
						}}
					/>
				)}

				{/* Transactions/Events */}
				<div tw="flex w-full justify-between">
					<span tw="text-gray-500">
						{data.accountType === 'contract' ? 'Events' : 'Transactions'}
					</span>
					<span tw="text-gray-900">{data.txCount}</span>
				</div>

				{/* Last Active - only for non-contracts */}
				{data.accountType !== 'contract' && (
					<div tw="flex w-full justify-between">
						<span tw="text-gray-500">Last Active</span>
						<span tw="text-gray-900">{data.lastActive}</span>
					</div>
				)}

				{/* Created */}
				<div tw="flex w-full justify-between">
					<span tw="text-gray-500">Created</span>
					<span tw="text-gray-900">{data.created}</span>
				</div>

				{/* Deployer */}
				{data.accountType === 'contract' && data.deployer && (
					<div tw="flex w-full justify-between">
						<span tw="text-gray-500">Deployer</span>
						<span tw="text-blue-500">{truncateHash(data.deployer, 6)}</span>
					</div>
				)}

				{/* Methods */}
				{data.accountType === 'contract' &&
					data.methods &&
					data.methods.length > 0 && (
						<div tw="flex w-full" style={{ marginTop: '4px' }}>
							<span
								tw="text-gray-500 shrink-0"
								style={{ marginRight: '16px', paddingTop: '4px' }}
							>
								Methods
							</span>
							<div
								tw="flex flex-wrap flex-1 justify-end"
								style={{ gap: '8px' }}
							>
								{data.methods.slice(0, 6).map((m) => (
									<span
										key={m}
										tw="bg-gray-100 text-gray-700 text-[23px]"
										style={{ ...PILL_STYLE, fontFamily: 'Pilat' }}
									>
										{m.length > 14 ? `${m.slice(0, 13)}…` : m}
									</span>
								))}
								{data.methods.length > 6 && (
									<span
										tw="bg-gray-100 text-gray-500 text-[23px]"
										style={{ ...PILL_STYLE, fontFamily: 'Pilat' }}
									>
										+{data.methods.length - 6}
									</span>
								)}
							</div>
						</div>
					)}
			</div>
			<div tw="absolute bottom-0 left-0 right-0" style={GRADIENT} />
		</div>
	)
}
