import { brand, CardBackground } from '#brand.tsx'
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
	contractDescription?: string
	details?: { label: string; value: string }[]
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
	eventCount?: number
	icons?: Record<string, string>
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
	tokenSymbols?: string[]
	tokens?: string[]
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
	width: '720px',
	maxWidth: '720px',
	minHeight: '400px',
	maxHeight: '534px',
	overflow: 'hidden' as const,
	fontFamily: 'Pilat',
	fontWeight: 400,
	lineHeight: 1.45,
	color: brand.foreground,
	fontFeatureSettings: '"tnum"',
	border: `1px solid ${brand.border}`,
	borderRadius: '0px 24px 0px 0px',
}

const MONO = { fontFamily: 'JetBrains Mono', fontWeight: 300 }

const DIVIDER = { height: '1px', flexShrink: 0, backgroundColor: brand.border }

export function ReceiptDetails({
	event,
	icons,
	compact,
}: {
	event: ReceiptEvent
	icons: Record<string, string>
	compact: boolean
}) {
	const words = truncateText(event.details, compact ? 62 : 90).split(' ')
	const symbols = event.tokenSymbols ?? []
	return (
		<div
			tw="flex items-center"
			style={{
				flexWrap: compact ? 'nowrap' : 'wrap',
				paddingLeft: 24,
				gap: 5,
				fontSize: compact ? 25 : 30,
				lineHeight: 1.2,
				maxHeight: compact ? 32 : 84,
				overflow: 'hidden',
			}}
		>
			{words.map((word, index) => {
				const tokenIndex = symbols.indexOf(word)
				const address = event.tokens?.[tokenIndex]
				const icon = address ? icons[address] : undefined
				const asset =
					tokenIndex >= 0 ||
					(symbols.includes(words[index + 1] ?? '') &&
						/^[<>$\d.,]+$/.test(word))
				return (
					<span
						key={index}
						tw="flex items-center"
						style={{ gap: 5, color: asset ? '#009b72' : brand.secondary }}
					>
						{tokenIndex >= 0 && icon && (
							<img
								src={icon}
								width={23}
								height={23}
								style={{ borderRadius: 12 }}
								alt=""
							/>
						)}
						{word}
					</span>
				)
			})}
		</div>
	)
}

// ============ Receipt Component ============

export function ReceiptCard({ data }: { data: ReceiptData }) {
	const events = data.events.slice(0, 3)
	const remaining = Math.max(
		0,
		(data.eventCount ?? data.events.length) - events.length,
	)
	const compact = events.length > 1
	return (
		<div
			tw="flex flex-col"
			style={{
				...CARD_BASE,
				height: 534,
				padding: compact ? 24 : 32,
				borderRadius: '0px 24px 0px 0px',
				backgroundColor: brand.surface,
				gap: compact ? 4 : 8,
				fontSize: compact ? 27 : 30,
				lineHeight: compact ? 1.2 : 1.35,
			}}
		>
			{data.status === 'reverted' && (
				<span style={{ color: '#c52b2b', fontSize: 22 }}>
					Failed transaction
				</span>
			)}
			<div tw="flex justify-between">
				<span style={{ color: brand.secondary }}>Block</span>
				<span style={{ color: brand.link }}>{data.blockNumber}</span>
			</div>
			<div tw="flex justify-between">
				<span style={{ color: brand.secondary }}>Sender</span>
				<span
					style={{
						fontFamily: 'JetBrains Mono',
						fontWeight: 300,
						color: brand.link,
					}}
				>
					{truncateHash(data.sender, 6)}
				</span>
			</div>
			<div tw="flex justify-between">
				<span style={{ color: brand.secondary }}>Time (UTC)</span>
				<span>{formatDateSmart(data.date, data.time)}</span>
			</div>
			<div style={DIVIDER} />
			<div tw="flex flex-col" style={{ gap: compact ? 6 : 18, flex: 1 }}>
				{data.eventsFailed ? (
					<span style={{ color: brand.secondary }}>Summary unavailable</span>
				) : events.length === 0 ? (
					<span style={{ color: brand.secondary }}>Transaction details</span>
				) : (
					events.map((event, index) => (
						<div key={index} tw="flex flex-col" style={{ gap: 4 }}>
							<div tw="flex justify-between" style={{ fontWeight: 400 }}>
								<div tw="flex items-center" style={{ gap: 8 }}>
									<span style={{ color: brand.secondary, fontWeight: 400 }}>
										{index + 1}.
									</span>
									<span>{truncateText(event.action, 24)}</span>
								</div>
								<span>{event.amount}</span>
							</div>
							<ReceiptDetails
								event={event}
								icons={data.icons ?? {}}
								compact={compact}
							/>
						</div>
					))
				)}
				{remaining > 0 && (
					<span style={{ color: brand.secondary, fontSize: 20 }}>
						+{remaining} more steps · open full receipt
					</span>
				)}
			</div>
			<div style={DIVIDER} />
			<div tw="flex justify-between" style={{ fontSize: 30 }}>
				<span style={{ color: brand.secondary }}>
					Fee{data.feeToken ? ` (${data.feeToken})` : ''}
				</span>
				<span>{data.fee || '—'}</span>
			</div>
			{data.total && (
				<div
					tw="flex justify-between"
					style={{ fontSize: 36, fontWeight: 500 }}
				>
					<span>Total</span>
					<span>{data.total}</span>
				</div>
			)}
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
		<div
			tw="flex flex-col bg-white relative"
			style={{ ...CARD_BASE, height: 534 }}
		>
			{/* Header */}
			<div
				tw={`flex ${isLongName ? 'flex-col' : 'items-center'} pr-8 pt-8 pb-6`}
				style={{ gap: isLongName ? '12px' : '20px', paddingLeft: '32px' }}
			>
				<div tw="flex items-center" style={{ gap: '20px' }}>
					<img
						src={icon}
						alt=""
						tw="rounded-full"
						style={{ width: '68px', height: '68px' }}
					/>
					<span
						tw="text-[46px] text-[#181818]"
						style={{ fontWeight: 400, lineHeight: '1.1' }}
					>
						{truncateText(data.name, 28)}
					</span>
				</div>
				<div tw="flex shrink-0 items-end justify-end" style={{ gap: '8px' }}>
					<span
						tw="flex items-center bg-[#f2f2f2] text-[#6b6b6b] text-2xl"
						style={{ ...PILL_STYLE, fontFamily: 'Pilat' }}
					>
						{truncateText(data.symbol, 12)}
					</span>
					{data.isFeeToken && (
						<span
							tw="flex items-center bg-[#eaf5ed] text-[#16803c] text-2xl"
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
				tw="flex flex-col pr-8 pt-6 pb-8 text-[30px]"
				style={{
					fontFamily: 'Pilat',
					fontWeight: 400,
					fontFeatureSettings: '"tnum"',
					gap: '16px',
					letterSpacing: '0em',
					paddingLeft: '32px',
				}}
			>
				<div tw="flex w-full justify-between">
					<span tw="text-[#6b6b6b]">Address</span>
					<span tw="text-blue-500" style={MONO}>
						{truncateHash(data.address, 8)}
					</span>
				</div>
				<div tw="flex w-full justify-between">
					<span tw="text-[#6b6b6b]">Currency</span>
					<div tw="flex items-center" style={{ gap: '8px' }}>
						{currSym && (
							<span
								tw="flex items-center justify-center bg-[#f2f2f2] text-[#181818] text-[22px]"
								style={{ width: '32px', height: '32px', borderRadius: '16px' }}
							>
								{currSym}
							</span>
						)}
						<span tw="text-[#181818]">{data.currency}</span>
					</div>
				</div>
				<div tw="flex w-full justify-between">
					<span tw="text-[#6b6b6b]">Holders</span>
					<span
						style={holdersGrey ? { color: brand.secondary } : undefined}
						tw={holdersGrey ? '' : 'text-[#181818]'}
					>
						{holdersGrey ? '—' : truncateText(data.holders, 16)}
					</span>
				</div>
				<div tw="flex w-full justify-between">
					<span tw="text-[#6b6b6b]">Supply</span>
					<span
						style={supplyGrey ? { color: brand.secondary } : undefined}
						tw={supplyGrey ? '' : 'text-[#181818]'}
					>
						{supplyDisplay}
					</span>
				</div>
				<div tw="flex w-full justify-between">
					<span tw="text-[#6b6b6b]">Created</span>
					<span tw="text-[#181818]">{data.created}</span>
				</div>
				{data.quoteToken && (
					<div tw="flex w-full justify-between">
						<span tw="text-[#6b6b6b]">Quote Token</span>
						<span tw="text-[#181818]">{data.quoteToken}</span>
					</div>
				)}
			</div>
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
					tw="flex bg-[#f2f2f2] text-[#181818] text-[23px]"
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
					tw="flex bg-[#f2f2f2] text-[#6b6b6b] text-[23px]"
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
			tw="bg-[#f2f2f2] text-[#181818] text-[23px]"
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
						tw="bg-[#f2f2f2] text-[#6b6b6b] text-[23px]"
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
				tw="flex w-full pr-8 pt-8 pb-6 items-center justify-between"
				style={{ paddingLeft: '32px' }}
			>
				<span tw="text-[#6b6b6b] text-[28px]" style={{ fontFamily: 'Pilat' }}>
					Block
				</span>
				<span
					tw="text-[40px]"
					style={{ fontFamily: 'Pilat', fontFeatureSettings: '"tnum"' }}
				>
					<span style={{ color: 'rgba(0,0,0,0.15)' }}>
						{'0'.repeat(Math.max(0, 12 - data.number.length))}
					</span>
					<span tw="text-[#181818]">{data.number}</span>
				</span>
			</div>

			<div tw="flex w-full" style={DIVIDER} />

			{/* Details */}
			<div
				tw="flex flex-col pr-8 pt-6 pb-8 text-[28px]"
				style={{
					fontFamily: 'Pilat',
					fontWeight: 400,
					fontFeatureSettings: '"tnum"',
					gap: '16px',
					letterSpacing: '0em',
					paddingLeft: '32px',
				}}
			>
				<div tw="flex w-full justify-between">
					<span tw="text-[#6b6b6b]">UTC</span>
					<span tw="text-[#181818]">{data.timestamp}</span>
				</div>
				<div tw="flex w-full justify-between">
					<span tw="text-[#6b6b6b]">UNIX</span>
					<span tw="text-[#181818]">{data.unixTimestamp}</span>
				</div>

				<div tw="flex w-full justify-between items-end">
					<span tw="text-[#6b6b6b]">Transactions</span>
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
						<span tw="text-[#181818]">{data.txCount}</span>
					</div>
				</div>

				<div tw="flex w-full justify-between items-center">
					<span tw="text-[#6b6b6b]">Gas Usage</span>
					<div tw="flex items-center" style={{ gap: '8px' }}>
						{gasPercent !== undefined && (
							<img
								src={buildGasBarSvg(gasPercent)}
								alt=""
								style={{ height: '24px' }}
							/>
						)}
						<span tw="text-[#181818]">{data.gasUsage}</span>
					</div>
				</div>

				<div tw="flex w-full justify-between">
					<span tw="text-[#6b6b6b]">Miner</span>
					<span tw="text-blue-500" style={MONO}>
						{truncateHash(data.miner, 6)}
					</span>
				</div>
				<div tw="flex w-full justify-between">
					<span tw="text-[#6b6b6b]">Parent</span>
					<span tw="text-blue-500" style={MONO}>
						{truncateHash(data.parentHash, 6)}
					</span>
				</div>
			</div>
		</div>
	)
}

// ============ Address Card Component ============

export function AddressImage({
	artwork,
	logo,
	children,
}: {
	logo: string
	artwork: string
	children: import('hono/jsx').Child
}) {
	return (
		<div tw="flex w-full h-full relative" style={{ fontFamily: 'Pilat' }}>
			<CardBackground title="Zone Portal" logo={logo} artwork={artwork} />
			<div tw="absolute flex items-end" style={{ left: '0px', bottom: '0px' }}>
				{children}
			</div>
		</div>
	)
}

export function AddressCard({ data }: { data: AddressData }) {
	const addrLine1 = data.address.slice(0, 21)
	const addrLine2 = data.address.slice(21)
	const holdingsGrey = isEmptyValue(data.holdings)
	const holdingsDisplay = data.holdings
	const hasValue = (value: string) => Boolean(value && value !== '—')

	return (
		<div tw="flex flex-col bg-white relative" style={CARD_BASE}>
			{/* Header */}
			{data.accountType === 'contract' && data.contractName ? (
				<div
					tw="flex flex-col w-full pr-8 pt-8 pb-6"
					style={{ paddingLeft: '32px' }}
				>
					<div tw="flex w-full justify-between items-center">
						<span
							tw="text-[#6b6b6b] text-[28px]"
							style={{ fontFamily: 'Pilat', fontWeight: 400 }}
						>
							Contract
						</span>
						<span
							tw="text-[#181818] text-[32px]"
							style={{ fontFamily: 'Pilat', fontWeight: 400 }}
						>
							{data.contractName}
						</span>
					</div>
					<div tw="flex justify-end">
						<span
							tw="text-gray-400 text-[22px]"
							style={{
								...MONO,
								fontFeatureSettings: '"tnum"',
							}}
						>
							{truncateHash(data.address, 8)}
						</span>
					</div>
				</div>
			) : (
				<div
					tw="flex w-full pr-8 pt-8 pb-6 justify-between items-start"
					style={{ paddingLeft: '32px' }}
				>
					<span
						tw="text-[#6b6b6b] text-[28px]"
						style={{ fontFamily: 'Pilat', fontWeight: 400 }}
					>
						{data.accountType === 'contract' ? 'Contract' : 'Address'}
					</span>
					<div
						tw="flex flex-col items-end text-[28px] text-blue-500"
						style={{
							...MONO,
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
				tw="flex flex-col pr-8 pt-6 pb-8 text-[28px]"
				style={{
					fontFamily: 'Pilat',
					fontWeight: 400,
					fontFeatureSettings: '"tnum"',
					gap: '14px',
					letterSpacing: '0em',
					paddingLeft: '32px',
				}}
			>
				{data.accountType === 'contract' && data.contractDescription && (
					<div tw="flex text-[#6b6b6b]" style={{ lineHeight: '1.4' }}>
						{data.contractDescription}
					</div>
				)}
				{data.details?.map(({ label, value }) => (
					<div key={label} tw="flex w-full justify-between">
						<span tw="text-[#6b6b6b]">{label}</span>
						<span tw="text-[#181818]">{value}</span>
					</div>
				))}
				{/* Holdings */}
				{data.accountType !== 'contract' && hasValue(data.holdings) && (
					<div
						tw="flex w-full justify-between items-center"
						style={{ paddingTop: '6px', paddingBottom: '6px' }}
					>
						<span tw="text-[#6b6b6b]">Holdings</span>
						<span
							style={holdingsGrey ? { color: brand.secondary } : undefined}
							tw={holdingsGrey ? '' : 'text-[#181818]'}
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
						<span tw="text-[#6b6b6b]">Assets</span>
						<div tw="flex flex-wrap justify-end" style={{ gap: '0px' }}>
							<TokenBadges tokens={data.tokensHeld} maxTokens={4} />
						</div>
					</div>
				)}

				{/* Divider (when not contract) */}
				{data.accountType !== 'contract' && hasValue(data.holdings) && (
					<div
						tw="flex"
						style={{
							height: '1px',
							backgroundColor: brand.border,
							marginLeft: '-32px',
							marginRight: '-32px',
						}}
					/>
				)}

				{/* Transactions/Events */}
				{hasValue(data.txCount) && (
					<div tw="flex w-full justify-between">
						<span tw="text-[#6b6b6b]">
							{data.accountType === 'contract' ? 'Events' : 'Transactions'}
						</span>
						<span tw="text-[#181818]">{data.txCount}</span>
					</div>
				)}

				{/* Last Active - only for non-contracts */}
				{data.accountType !== 'contract' && hasValue(data.lastActive) && (
					<div tw="flex w-full justify-between">
						<span tw="text-[#6b6b6b]">Last Active</span>
						<span tw="text-[#181818]">{data.lastActive}</span>
					</div>
				)}

				{/* Created */}
				{hasValue(data.created) && (
					<div tw="flex w-full justify-between">
						<span tw="text-[#6b6b6b]">Created</span>
						<span tw="text-[#181818]">{data.created}</span>
					</div>
				)}

				{/* Deployer */}
				{data.accountType === 'contract' && data.deployer && (
					<div tw="flex w-full justify-between">
						<span tw="text-[#6b6b6b]">Deployer</span>
						<span tw="text-blue-500" style={MONO}>
							{truncateHash(data.deployer, 6)}
						</span>
					</div>
				)}

				{/* Methods */}
				{data.accountType === 'contract' &&
					data.methods &&
					data.methods.length > 0 && (
						<div tw="flex w-full" style={{ marginTop: '4px' }}>
							<span
								tw="text-[#6b6b6b] shrink-0"
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
										tw="bg-[#f2f2f2] text-[#181818] text-[23px]"
										style={{ ...PILL_STYLE, fontFamily: 'Pilat' }}
									>
										{m.length > 14 ? `${m.slice(0, 13)}…` : m}
									</span>
								))}
								{data.methods.length > 6 && (
									<span
										tw="bg-[#f2f2f2] text-[#6b6b6b] text-[23px]"
										style={{ ...PILL_STYLE, fontFamily: 'Pilat' }}
									>
										+{data.methods.length - 6}
									</span>
								)}
							</div>
						</div>
					)}
			</div>
		</div>
	)
}
