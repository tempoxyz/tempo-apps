import { truncateText } from '#params.ts'

// ============ Types ============

export interface AddressData {
	address: string
	holdings: string
	txCount: string
	lastActive: string
	created: string
	feeToken?: string
	tokensHeld: string[] // Array of token symbols
	isContract: boolean // Whether this is a contract address
	methods?: string[] // Contract methods detected
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
}

interface ReceiptEvent {
	action: string
	details: string
	amount?: string
	message?: string
}

// ============ Helpers ============

function truncateHash(hash: string, chars = 4): string {
	if (!hash || hash === '—') return hash
	if (hash.length <= chars * 2 + 2) return hash
	return `${hash.slice(0, chars + 2)}…${hash.slice(-chars)}`
}

// Parse event details into groups for rendering
export function parseEventDetails(
	details: string,
): { text: string; type: 'normal' | 'asset' | 'address' }[] {
	const groups: { text: string; type: 'normal' | 'asset' | 'address' }[] = []

	const words = details.split(' ')
	let i = 0
	while (i < words.length) {
		const word = words[i]

		// Check if this is an address (starts with 0x or contains ...)
		if (
			word?.startsWith('0x') ||
			(word?.includes('...') && word?.match(/[0-9a-fA-F]/))
		) {
			groups.push({ text: word, type: 'address' })
			i++
		}
		// Check if this is a number followed by a token name (asset)
		else if (
			word?.match(/^[\d.]+$/) &&
			words[i + 1] &&
			!['for', 'to', 'from'].includes(words[i + 1] as string)
		) {
			// Asset: "10.00 pathUSD"
			groups.push({ text: `${word} ${words[i + 1]}`, type: 'asset' })
			i += 2
			// Add following connector word (for, to, from) as normal/gray
			const connector = words[i]
			if (connector && ['for', 'to', 'from'].includes(connector)) {
				groups.push({ text: connector, type: 'normal' })
				i++
			}
		}
		// Connector word at start (like "to 0x...")
		else if (['for', 'to', 'from'].includes(word || '')) {
			groups.push({ text: word || '', type: 'normal' })
			i++
		}
		// Regular word
		else {
			groups.push({ text: word || '', type: 'normal' })
			i++
		}
	}

	return groups
}

// ============ Receipt Component ============

export function ReceiptCard({
	data,
	receiptLogo,
}: {
	data: ReceiptData
	receiptLogo: string
}) {
	// Format date to "Dec 1 2025" format
	let formattedDate = data.date
	// Handle "Dec 1, 2025" format - remove comma
	if (data.date.includes(',')) {
		formattedDate = data.date.replace(',', '')
	}
	// Handle "12/01/2025" or "MM/DD/YYYY" format - convert to "Dec 1 2025"
	const dateMatch = data.date.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
	if (dateMatch) {
		const [, monthStr, dayStr, year] = dateMatch
		const month = Number.parseInt(monthStr ?? '1', 10)
		const day = Number.parseInt(dayStr ?? '1', 10)
		const monthNames = [
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
		]
		formattedDate = `${monthNames[month - 1]} ${day} ${year}`
	}

	// Format time to "HH:MM" (24-hour)
	let formattedTime = data.time
	// Handle "1:03 PM" or "10:32 AM GMT-8" format (12-hour with optional timezone)
	const timeMatch12 = data.time.match(
		/^(\d{1,2}):(\d{2})\s*(AM|PM)(?:\s*GMT[+-]\d+)?$/i,
	)
	if (timeMatch12) {
		const hoursStr = timeMatch12[1]
		const minutes = timeMatch12[2]
		const periodRaw = timeMatch12[3]
		if (hoursStr && minutes && periodRaw) {
			let hours = Number.parseInt(hoursStr, 10)
			const period = periodRaw.toUpperCase()
			if (period === 'PM' && hours !== 12) hours += 12
			if (period === 'AM' && hours === 12) hours = 0
			formattedTime = `${hours.toString().padStart(2, '0')}:${minutes}`
		}
	}
	// Handle "10:32:21 GMT-8" format (24-hour) - extract HH:MM
	else {
		const timeMatch24 = data.time.match(
			/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(?:GMT[+-]\d+)?$/i,
		)
		if (timeMatch24) {
			const hours = timeMatch24[1]
			const minutes = timeMatch24[2]
			formattedTime = `${hours?.padStart(2, '0')}:${minutes}`
		}
	}

	// Combine date and time
	const when = data.date !== '—' ? `${formattedDate} ${formattedTime}` : '—'

	return (
		<div
			tw="flex flex-col bg-white"
			style={{
				width: '700px',
				maxWidth: '700px',
				boxShadow:
					'0 4px 6px -1px rgba(0,0,0,0.05), 0 10px 15px -3px rgba(0,0,0,0.05), 0 25px 50px -12px rgba(0,0,0,0.08)',
				borderTopRightRadius: '24px',
				borderBottomRightRadius: '24px',
				borderTopLeftRadius: '0',
				borderBottomLeftRadius: '0',
			}}
		>
			{/* Header */}
			<div
				tw="flex w-full pr-8 pt-10 pb-8"
				style={{ gap: '27px', paddingLeft: '48px' }}
			>
				{/* Tempo Receipt logo */}
				<div tw="flex shrink-0 items-start">
					<img
						src={receiptLogo}
						alt="Tempo Receipt"
						style={{ width: '190px', height: 'auto' }}
					/>
				</div>

				{/* Details - condensed */}
				<div
					tw="flex flex-col flex-1 text-[28px]"
					style={{
						fontFamily: 'GeistMono',
						gap: '20px',
						marginLeft: '16px',
						letterSpacing: '-0.02em',
					}}
				>
					<div tw="flex w-full justify-between">
						<span tw="text-gray-500 shrink-0">Block</span>
						<span tw="text-emerald-600">#{data.blockNumber}</span>
					</div>
					<div tw="flex w-full justify-between">
						<span tw="text-gray-500 shrink-0">Sender</span>
						<span tw="text-blue-500">{truncateHash(data.sender, 6)}</span>
					</div>
					<div tw="flex w-full justify-between">
						<span tw="text-gray-500 shrink-0">Date</span>
						<span>{when}</span>
					</div>
				</div>
			</div>

			{/* Divider */}
			<div
				tw="flex mr-10"
				style={{
					height: '1px',
					backgroundColor: '#d1d5db',
					marginLeft: '56px',
				}}
			/>

			{/* Events - show max 3, then "...and n more" */}
			{data.events.length > 0 &&
				data.events.slice(0, 3).map((event, index) => {
					const parts = parseEventDetails(event.details || '')
					return (
						<div
							key={`event-${event.details}`}
							tw="flex px-12 py-4 text-[28px]"
							style={{
								fontFamily: 'GeistMono',
								letterSpacing: '-0.02em',
								justifyContent: 'space-between',
							}}
						>
							<div tw="flex" style={{ gap: '8px', maxWidth: '85%' }}>
								<span tw="text-gray-500 shrink-0">{index + 1}.</span>
								<div tw="flex flex-wrap" style={{ gap: '8px' }}>
									<span tw="bg-gray-100 px-3 py-1 rounded shrink-0">
										{event.action}
									</span>
									{parts.map((part) => (
										<span
											key={`part-${part.text}`}
											tw={
												part.type === 'asset'
													? 'text-emerald-600'
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
							{event.amount && <span tw="shrink-0">{event.amount}</span>}
						</div>
					)
				})}
			{data.events.length > 3 && (
				<div
					tw="flex justify-center py-3 mx-12 text-gray-500 text-[24px]"
					style={{ fontFamily: 'GeistMono' }}
				>
					...and {data.events.length - 3} more
				</div>
			)}

			{/* Divider */}
			<div
				tw="flex mr-10"
				style={{
					height: '1px',
					backgroundColor: '#d1d5db',
					marginLeft: '56px',
				}}
			/>

			{/* Fee and Total rows */}
			{(data.fee || data.total) && (
				<>
					<div
						tw="flex"
						style={{
							height: '1px',
							backgroundColor: '#d1d5db',
							marginLeft: '48px',
						}}
					/>
					<div
						tw="flex flex-col pr-8 pb-12 text-[28px]"
						style={{
							fontFamily: 'GeistMono',
							gap: '22px',
							width: '100%',
							letterSpacing: '-0.02em',
							paddingTop: '24px',
							paddingBottom: '32px',
						}}
					>
						{data.fee && (
							<div
								tw="flex items-center"
								style={{ width: '100%', justifyContent: 'space-between' }}
							>
								<span tw="text-gray-500">
									Fee{data.feeToken ? ` (${data.feeToken})` : ''}
								</span>
								<span>{data.fee}</span>
							</div>
						)}
						{data.total && (
							<div
								tw="flex items-center"
								style={{ width: '100%', justifyContent: 'space-between' }}
							>
								<span tw="text-gray-500">Total</span>
								<span>{data.total}</span>
							</div>
						)}
					</div>
				</>
			)}
		</div>
	)
}

// ============ Token Card Component ============

export function TokenCard({ data, icon }: { data: TokenData; icon: string }) {
	return (
		<div
			tw="flex flex-col bg-white"
			style={{
				width: '700px',
				boxShadow:
					'0 4px 6px -1px rgba(0,0,0,0.05), 0 10px 15px -3px rgba(0,0,0,0.05), 0 25px 50px -12px rgba(0,0,0,0.08)',
				borderTopRightRadius: '24px',
				borderBottomRightRadius: '24px',
				borderTopLeftRadius: '0',
				borderBottomLeftRadius: '0',
			}}
		>
			{/* Header with icon and name */}
			<div
				tw="flex items-center pr-10 pt-14 pb-12"
				style={{ gap: '20px', paddingLeft: '56px' }}
			>
				{/* Token icon from tokenlist or fallback to null icon */}
				<img
					src={icon}
					alt=""
					tw="rounded-full"
					style={{ width: '80px', height: '80px' }}
				/>
				<div tw="flex flex-col flex-1" style={{ overflow: 'hidden' }}>
					<span tw="text-5xl font-semibold text-gray-900">
						{truncateText(data.name, 18)}
					</span>
				</div>
				{/* Symbol badge */}
				<div tw="flex items-center shrink-0" style={{ gap: '12px' }}>
					<div
						tw="flex items-center px-5 py-3 bg-gray-100 rounded-lg text-gray-600 text-2xl"
						style={{ fontFamily: 'GeistMono' }}
					>
						{truncateText(data.symbol, 12)}
					</div>
					{data.isFeeToken && (
						<div
							tw="flex items-center px-5 py-3 bg-emerald-100 rounded-lg text-emerald-700 text-2xl"
							style={{ fontFamily: 'GeistMono' }}
						>
							Fee Token
						</div>
					)}
				</div>
			</div>

			{/* Divider */}
			<div
				tw="flex mr-10"
				style={{
					height: '1px',
					backgroundColor: '#d1d5db',
					marginLeft: '56px',
				}}
			/>

			{/* Details */}
			<div
				tw="flex flex-col pr-10 py-10 text-[29px]"
				style={{
					fontFamily: 'GeistMono',
					gap: '29px',
					letterSpacing: '-0.02em',
					paddingLeft: '56px',
				}}
			>
				{/* Address - truncated */}
				<div tw="flex w-full justify-between">
					<span tw="text-gray-500">Address</span>
					<span tw="text-blue-500">{truncateHash(data.address, 8)}</span>
				</div>

				{/* Currency */}
				<div tw="flex w-full justify-between">
					<span tw="text-gray-500">Currency</span>
					<span tw="text-gray-900">{truncateText(data.currency, 16)}</span>
				</div>

				{/* Holders */}
				<div tw="flex w-full justify-between">
					<span tw="text-gray-500">Holders</span>
					<span tw="text-gray-900">{truncateText(data.holders, 16)}</span>
				</div>

				{/* Supply */}
				<div tw="flex w-full justify-between">
					<span tw="text-gray-500">Supply</span>
					<span tw="text-gray-900">{truncateText(data.supply, 20)}</span>
				</div>

				{/* Created */}
				<div tw="flex w-full justify-between">
					<span tw="text-gray-500">Created</span>
					<span tw="text-gray-900">{data.created}</span>
				</div>

				{/* Quote Token (if available) */}
				{data.quoteToken && (
					<div tw="flex w-full justify-between">
						<span tw="text-gray-500">Quote Token</span>
						<span tw="text-gray-900">{data.quoteToken}</span>
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
	// Truncate token name if too long
	const truncateToken = (token: string, maxLen = 8) => {
		if (token.length <= maxLen) return token
		return `${token.slice(0, maxLen - 1)}…`
	}

	// Show up to maxTokens tokens
	const displayTokens = tokens.slice(0, maxTokens)
	const remaining = tokens.length - maxTokens

	return (
		<>
			{displayTokens.map((token) => (
				<span
					key={token}
					tw="flex px-4 py-2 bg-gray-100 rounded text-gray-700 text-[23px]"
					style={{
						fontFamily: 'GeistMono',
						marginRight: '12px',
					}}
				>
					{truncateToken(token)}
				</span>
			))}
			{remaining > 0 && (
				<span
					tw="flex px-4 py-2 bg-gray-100 rounded text-gray-500 text-[23px]"
					style={{ fontFamily: 'GeistMono' }}
				>
					+{remaining}
				</span>
			)}
		</>
	)
}

// ============ Method Badges Helper ============

export function MethodBadges({ methods }: { methods: string[] }) {
	// Split methods into rows based on character count (~40 chars per row)
	const maxCharsPerRow = 40
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

	// Truncate method name if too long
	const truncateMethod = (m: string, maxLen = 14) => {
		if (m.length <= maxLen) return m
		return `${m.slice(0, maxLen - 1)}…`
	}

	const renderBadge = (m: string, idx: number) => (
		<span
			key={idx}
			tw="px-4 py-2 bg-gray-100 rounded text-gray-700 text-[23px]"
			style={{ fontFamily: 'GeistMono' }}
		>
			{truncateMethod(m)}
		</span>
	)

	return (
		<div tw="flex flex-col items-end" style={{ gap: '8px' }}>
			{/* Row 1 */}
			<div tw="flex justify-end" style={{ gap: '10px' }}>
				{row1[0] && renderBadge(row1[0], 0)}
				{row1[1] && renderBadge(row1[1], 1)}
				{row1[2] && renderBadge(row1[2], 2)}
				{row1[3] && renderBadge(row1[3], 3)}
			</div>
			{/* Row 2 */}
			{row2.length > 0 && (
				<div tw="flex justify-end" style={{ gap: '10px' }}>
					{row2[0] && renderBadge(row2[0], 10)}
					{row2[1] && renderBadge(row2[1], 11)}
					{row2[2] && renderBadge(row2[2], 12)}
					{row2[3] && renderBadge(row2[3], 13)}
					{remaining > 0 && (
						<span
							tw="px-4 py-2 bg-gray-100 rounded text-gray-500 text-[23px]"
							style={{ fontFamily: 'GeistMono' }}
						>
							+{remaining}
						</span>
					)}
				</div>
			)}
			{/* +remaining if only one row */}
			{row2.length === 0 && remaining > 0 && (
				<div tw="flex justify-end" style={{ gap: '10px' }}>
					<span
						tw="px-4 py-2 bg-gray-100 rounded text-gray-500 text-[23px]"
						style={{ fontFamily: 'GeistMono' }}
					>
						+{remaining}
					</span>
				</div>
			)}
		</div>
	)
}

// ============ Address Card Component ============

export function AddressCard({ data }: { data: AddressData }) {
	// Split address into two lines for display
	const addrLine1 = data.address.slice(0, 22)
	const addrLine2 = data.address.slice(22)

	return (
		<div
			tw="flex flex-col bg-white"
			style={{
				width: '700px',
				boxShadow:
					'0 4px 6px -1px rgba(0,0,0,0.05), 0 10px 15px -3px rgba(0,0,0,0.05), 0 25px 50px -12px rgba(0,0,0,0.08)',
				borderTopRightRadius: '24px',
				borderBottomRightRadius: '24px',
				borderTopLeftRadius: '0',
				borderBottomLeftRadius: '0',
			}}
		>
			{/* Address header */}
			<div
				tw="flex w-full pr-10 pt-10 pb-8 justify-between items-start"
				style={{ paddingLeft: '56px' }}
			>
				<span
					tw="text-gray-500 text-[29px]"
					style={{ fontFamily: 'GeistMono' }}
				>
					{data.isContract ? 'Contract' : 'Address'}
				</span>
				<div
					tw="flex flex-col items-end text-[29px] text-blue-500"
					style={{ fontFamily: 'GeistMono', lineHeight: '1.3' }}
				>
					<span>{addrLine1}</span>
					<span>{addrLine2}</span>
				</div>
			</div>

			{/* Divider - dashed */}
			<div
				tw="flex mr-10"
				style={{
					height: '1px',
					backgroundColor: '#d1d5db',
					borderStyle: 'dashed',
					marginLeft: '56px',
				}}
			/>

			{/* Details */}
			<div
				tw="flex flex-col pr-10 py-8 text-[29px]"
				style={{
					fontFamily: 'GeistMono',
					gap: '22px',
					letterSpacing: '-0.02em',
					paddingLeft: '56px',
				}}
			>
				{/* Holdings - show for EOAs only */}
				{!data.isContract && (
					<div tw="flex w-full justify-between">
						<span tw="text-gray-500">Holdings</span>
						<span tw="text-gray-900">{truncateText(data.holdings, 20)}</span>
					</div>
				)}

				{/* Tokens Held section - show for EOAs only */}
				{data.tokensHeld.length > 0 && !data.isContract && (
					<div tw="flex flex-col w-full items-end" style={{ marginTop: '8px' }}>
						{/* Single row of tokens */}
						<div tw="flex justify-end py-1" style={{ width: '100%' }}>
							<TokenBadges tokens={data.tokensHeld} maxTokens={4} />
						</div>
						{/* Divider - dashed */}
						<div
							tw="flex w-full"
							style={{
								height: '1px',
								backgroundColor: '#d1d5db',
								borderStyle: 'dashed',
								marginTop: '16px',
							}}
						/>
					</div>
				)}

				{/* Divider - dashed (when no tokens and not contract) */}
				{data.tokensHeld.length === 0 && !data.isContract && (
					<div
						tw="flex w-full"
						style={{
							height: '1px',
							backgroundColor: '#d1d5db',
							borderStyle: 'dashed',
						}}
					/>
				)}

				{/* Transactions */}
				<div tw="flex w-full justify-between">
					<span tw="text-gray-500">Transactions</span>
					<span tw="text-gray-900">{data.txCount}</span>
				</div>

				{/* Last Active */}
				<div tw="flex w-full justify-between">
					<span tw="text-gray-500">Last Active</span>
					<span tw="text-gray-900">{data.lastActive}</span>
				</div>

				{/* Created */}
				<div tw="flex w-full justify-between">
					<span tw="text-gray-500">Created</span>
					<span tw="text-gray-900">{data.created}</span>
				</div>

				{/* Contract Methods - show for contracts only, at bottom */}
				{data.isContract && data.methods && data.methods.length > 0 && (
					<div tw="flex flex-col w-full" style={{ marginTop: '4px' }}>
						<span tw="text-gray-500" style={{ marginBottom: '12px' }}>
							Methods
						</span>
						<MethodBadges methods={data.methods || []} />
					</div>
				)}
			</div>
		</div>
	)
}
