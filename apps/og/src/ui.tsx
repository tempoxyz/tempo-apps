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
	tokensHeld: string[] // Array of token symbols
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

export function ReceiptCard({ data }: { data: ReceiptData }) {
	let formattedDate = data.date
	if (data.date.includes(',')) {
		formattedDate = data.date.replace(/,(\S)/g, ', $1')
	}
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
		formattedDate = `${monthNames[month - 1]} ${day}, ${year}`
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
			tw="flex flex-col bg-white relative"
			style={{
				width: '700px',
				maxWidth: '700px',
				maxHeight: '583px',
				overflow: 'hidden',
				fontFamily: 'Pilat',
				fontWeight: 400,
				fontFeatureSettings: '"tnum"',
				boxShadow:
					'0 4px 6px -1px rgba(0,0,0,0.05), 0 10px 15px -3px rgba(0,0,0,0.05), 0 25px 50px -12px rgba(0,0,0,0.08)',
				borderTopRightRadius: '24px',
				borderTopLeftRadius: '0',
				borderBottomLeftRadius: '0',
				borderBottomRightRadius: '0',
			}}
		>
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
				<div tw="flex w-full justify-between">
					<span tw="text-gray-500 shrink-0">Block</span>
					<span tw="text-gray-900">{data.blockNumber}</span>
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

			{/* Divider */}
			<div
				tw="flex w-full"
				style={{
					height: '1px',
					backgroundColor: '#d1d5db',
				}}
			/>

			{/* Events - show max 3, then "...and n more" */}
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
					<>
						{data.events.slice(0, 3).map((event, index) => {
							const parts = parseEventDetails(event.details || '')
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
									<div tw="flex" style={{ gap: '8px', maxWidth: '85%' }}>
										<span tw="text-gray-500 shrink-0">{index + 1}.</span>
										<div tw="flex flex-wrap" style={{ gap: '8px' }}>
											<span tw="bg-gray-100 px-3 rounded shrink-0">
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
								style={{
									fontFamily: 'Pilat',
									fontFeatureSettings: '"tnum"',
								}}
							>
								...and {data.events.length - 3} more
							</div>
						)}
					</>
				)}
			</div>

			{/* Divider */}
			<div
				tw="flex w-full"
				style={{
					height: '1px',
					backgroundColor: '#d1d5db',
				}}
			/>

			{/* Fee and Total rows */}
			{(data.fee || data.total) && (
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
					{data.fee && (
						<div
							tw="flex items-center w-full"
							style={{ justifyContent: 'space-between' }}
						>
							<span tw="text-gray-500">
								Fee{data.feeToken ? ` (${data.feeToken})` : ''}
							</span>
							<span>{data.fee}</span>
						</div>
					)}
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
			)}
			{/* Bottom fade */}
			<div
				tw="absolute bottom-0 left-0 right-0"
				style={{
					height: '60px',
					background:
						'linear-gradient(to bottom, rgba(255,255,255,0), rgba(255,255,255,1))',
				}}
			/>
		</div>
	)
}

// ============ Token Card Component ============

export function TokenCard({ data, icon }: { data: TokenData; icon: string }) {
	return (
		<div
			tw="flex flex-col bg-white relative"
			style={{
				width: '700px',
				maxHeight: '583px',
				overflow: 'hidden',
				fontFamily: 'Pilat',
				fontWeight: 400,
				fontFeatureSettings: '"tnum"',
				boxShadow:
					'0 4px 6px -1px rgba(0,0,0,0.05), 0 10px 15px -3px rgba(0,0,0,0.05), 0 25px 50px -12px rgba(0,0,0,0.08)',
				borderTopRightRadius: '24px',
				borderTopLeftRadius: '0',
				borderBottomLeftRadius: '0',
				borderBottomRightRadius: '0',
			}}
		>
			{/* Header with icon and name */}
			<div
				tw="flex items-center pr-10 pt-10 pb-8"
				style={{ gap: '20px', paddingLeft: '56px' }}
			>
				<img
					src={icon}
					alt=""
					tw="rounded-full"
					style={{ width: '68px', height: '68px' }}
				/>
				<div tw="flex flex-col flex-1" style={{ overflow: 'hidden' }}>
					<span
						tw="text-[42px] text-gray-900"
						style={{
							fontFamily: 'Pilat',
							whiteSpace: 'nowrap',
							overflow: 'hidden',
							textOverflow: 'ellipsis',
						}}
					>
						{truncateText(data.name, 14)}
					</span>
				</div>
				<div tw="flex flex-col shrink-0 items-end" style={{ gap: '8px' }}>
					<div
						tw="flex items-center px-3 py-1 bg-gray-100 rounded-lg text-gray-600 text-2xl"
						style={{ fontFamily: 'Pilat' }}
					>
						{truncateText(data.symbol, 12)}
					</div>
					{data.isFeeToken && (
						<div
							tw="flex items-center px-3 py-1 bg-emerald-100 rounded-lg text-emerald-700 text-2xl"
							style={{ fontFamily: 'Pilat' }}
						>
							Fee Token
						</div>
					)}
				</div>
			</div>

			{/* Divider */}
			<div
				tw="flex w-full"
				style={{
					height: '1px',
					backgroundColor: '#d1d5db',
				}}
			/>

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
			{/* Bottom fade */}
			<div
				tw="absolute bottom-0 left-0 right-0"
				style={{
					height: '60px',
					background:
						'linear-gradient(to bottom, rgba(255,255,255,0), rgba(255,255,255,1))',
				}}
			/>
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
						fontFamily: 'Pilat',
						marginRight: '12px',
					}}
				>
					{truncateToken(token)}
				</span>
			))}
			{remaining > 0 && (
				<span
					tw="flex px-4 py-2 bg-gray-100 rounded text-gray-500 text-[23px]"
					style={{ fontFamily: 'Pilat' }}
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
			style={{ fontFamily: 'Pilat' }}
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
							style={{ fontFamily: 'Pilat' }}
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
						style={{ fontFamily: 'Pilat' }}
					>
						+{remaining}
					</span>
				</div>
			)}
		</div>
	)
}

// ============ Block Card Component ============

export function BlockCard({ data }: { data: BlockData }) {
	return (
		<div
			tw="flex flex-col bg-white relative"
			style={{
				width: '700px',
				maxWidth: '700px',
				maxHeight: '583px',
				overflow: 'hidden',
				fontFamily: 'Pilat',
				fontWeight: 400,
				fontFeatureSettings: '"tnum"',
				boxShadow:
					'0 4px 6px -1px rgba(0,0,0,0.05), 0 10px 15px -3px rgba(0,0,0,0.05), 0 25px 50px -12px rgba(0,0,0,0.08)',
				borderTopRightRadius: '24px',
				borderTopLeftRadius: '0',
				borderBottomLeftRadius: '0',
				borderBottomRightRadius: '0',
			}}
		>
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

			{/* Divider */}
			<div
				tw="flex w-full"
				style={{
					height: '1px',
					backgroundColor: '#d1d5db',
				}}
			/>

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

				<div tw="flex w-full justify-between">
					<span tw="text-gray-500">Transactions</span>
					<span tw="text-gray-900">{data.txCount}</span>
				</div>

				<div tw="flex w-full justify-between">
					<span tw="text-gray-500">Miner</span>
					<span tw="text-blue-500">{truncateHash(data.miner, 6)}</span>
				</div>

				<div tw="flex w-full justify-between">
					<span tw="text-gray-500">Parent</span>
					<span tw="text-blue-500">{truncateHash(data.parentHash, 6)}</span>
				</div>

				<div tw="flex w-full justify-between">
					<span tw="text-gray-500">Gas Usage</span>
					<span tw="text-gray-900">{data.gasUsage}</span>
				</div>
			</div>
			{/* Bottom fade */}
			<div
				tw="absolute bottom-0 left-0 right-0"
				style={{
					height: '60px',
					background:
						'linear-gradient(to bottom, rgba(255,255,255,0), rgba(255,255,255,1))',
				}}
			/>
		</div>
	)
}

// ============ Address Card Component ============

export function AddressCard({ data }: { data: AddressData }) {
	// Split address into two lines for display
	const addrLine1 = data.address.slice(0, 21)
	const addrLine2 = data.address.slice(21)

	return (
		<div
			tw="flex flex-col bg-white relative"
			style={{
				width: '700px',
				maxHeight: '583px',
				overflow: 'hidden',
				fontFamily: 'Pilat',
				fontWeight: 400,
				fontFeatureSettings: '"tnum"',
				boxShadow:
					'0 4px 6px -1px rgba(0,0,0,0.05), 0 10px 15px -3px rgba(0,0,0,0.05), 0 25px 50px -12px rgba(0,0,0,0.08)',
				borderTopRightRadius: '24px',
				borderTopLeftRadius: '0',
				borderBottomLeftRadius: '0',
				borderBottomRightRadius: '0',
			}}
		>
			{/* Address header */}
			{data.accountType === 'contract' && data.contractName ? (
				<div
					tw="flex flex-col w-full pr-10 pt-10 pb-8"
					style={{ paddingLeft: '56px' }}
				>
					<div tw="flex w-full justify-between items-start">
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

			{/* Divider - dashed */}
			<div
				tw="flex w-full"
				style={{
					height: '1px',
					backgroundColor: '#d1d5db',
				}}
			/>

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
				{/* Holdings - show for non-contracts only */}
				{data.accountType !== 'contract' && (
					<div tw="flex w-full justify-between">
						<span tw="text-gray-500">Holdings</span>
						<span tw="text-gray-900">{truncateText(data.holdings, 20)}</span>
					</div>
				)}

				{/* Tokens Held section - show for non-contracts only */}
				{data.tokensHeld.length > 0 && data.accountType !== 'contract' && (
					<div tw="flex justify-end py-1" style={{ width: '100%' }}>
						<TokenBadges tokens={data.tokensHeld} maxTokens={4} />
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

				{/* Deployer - show for contracts only */}
				{data.accountType === 'contract' && data.deployer && (
					<div tw="flex w-full justify-between">
						<span tw="text-gray-500">Deployer</span>
						<span tw="text-blue-500">{truncateHash(data.deployer, 6)}</span>
					</div>
				)}

				{/* Contract Methods - show for contracts only */}
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
										tw="px-4 py-2 bg-gray-100 rounded text-gray-700 text-[23px]"
										style={{ fontFamily: 'Pilat' }}
									>
										{m.length > 14 ? `${m.slice(0, 13)}…` : m}
									</span>
								))}
								{data.methods.length > 6 && (
									<span
										tw="px-4 py-2 bg-gray-100 rounded text-gray-500 text-[23px]"
										style={{ fontFamily: 'Pilat' }}
									>
										+{data.methods.length - 6}
									</span>
								)}
							</div>
						</div>
					)}
			</div>
			{/* Bottom fade */}
			<div
				tw="absolute bottom-0 left-0 right-0"
				style={{
					height: '60px',
					background:
						'linear-gradient(to bottom, rgba(255,255,255,0), rgba(255,255,255,1))',
				}}
			/>
		</div>
	)
}
