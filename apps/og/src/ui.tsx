import type { Child } from 'hono/jsx'
import {
	CONTENT_WIDTH,
	clip,
	color,
	Eyebrow,
	type Fact,
	Facts,
	type Font,
	fit,
	groupDigits,
	IconChip,
	Identicon,
	measure,
	mono,
	present,
	sans,
	shortHex,
	Tag,
	TokenIcon,
} from '#brand.tsx'

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
	details?: { label: string; value: string; unit?: string }[]
	/** Overrides the card title, such as Zone Portal. */
	kind?: string
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
	/** The block id from the URL, shown when the number is missing. */
	id?: string
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

// ============ Layout ============

const HERO = { max: 112, min: 60, wrapped: 64, gap: 32 }
const SUBTITLE = 36

/** Splits `text` at the space that best balances two lines. */
function balance(text: string): [string, string] | undefined {
	const words = text.split(' ')
	let best: [string, string] | undefined
	let widest = Number.POSITIVE_INFINITY
	for (let index = 1; index < words.length; index++) {
		const lines: [string, string] = [
			words.slice(0, index).join(' '),
			words.slice(index).join(' '),
		]
		const width = Math.max(...lines.map((line) => measure(line, 100)))
		if (width < widest) {
			widest = width
			best = lines
		}
	}
	return best
}

/**
 * The dominant value: one line as large as the width allows, from 112px down
 * to 60px. A name too long for one line at 64px wraps onto two balanced
 * lines; anything still too long is cut. A leading icon or avatar keeps to
 * the line height.
 */
function Hero(props: {
	text: string
	font?: Font
	lead?: (size: number) => Child
	struck?: boolean
	/** The width to fit, when something sits beside the hero. */
	width?: number
}) {
	const font = props.font === 'mono' ? 'mono' : 'display'
	const leadSize = (size: number) => Math.round(size * 0.92)
	const available = (size: number) =>
		(props.width ?? CONTENT_WIDTH) -
		(props.lead ? leadSize(size) + HERO.gap : 0)
	let size = fit(props.text, available(HERO.max), HERO.max, HERO.min, font)
	// The lead icon takes width too, so settle on a size that fits both.
	while (size > HERO.min && measure(props.text, size, font) > available(size))
		size -= 2
	let lines = [clip(props.text, available(size), size, font)]
	let lead = leadSize(size)
	const split =
		font === 'display' &&
		measure(props.text, HERO.wrapped, font) > available(HERO.wrapped)
			? balance(props.text)
			: undefined
	if (split) {
		const width = available(HERO.max)
		const longest = Math.max(
			...split.map((line) => measure(line, 100, font) / 100),
		)
		size = Math.max(44, Math.min(HERO.wrapped, Math.floor(width / longest)))
		lines = split.map((line) => clip(line, width, size, font))
		lead = leadSize(HERO.max)
	}
	return (
		<div
			style={{
				display: 'flex',
				alignItems: 'center',
				gap: HERO.gap,
				marginTop: 16,
				minHeight: Math.round(HERO.max * 1.1),
			}}
		>
			{props.lead?.(lead)}
			<div
				style={{
					display: 'flex',
					flexDirection: 'column',
					...(font === 'mono'
						? { ...mono(size), letterSpacing: `${-0.02 * size}px` }
						: sans(size, 600)),
					lineHeight: lines.length > 1 ? 1.08 : 1.1,
					whiteSpace: 'nowrap',
					color: props.struck ? color.tertiary : color.foreground,
				}}
			>
				{lines.map((line, index) => (
					<span
						key={index}
						// Takumi does not pass decorations down to flex children.
						style={
							props.struck
								? {
										textDecorationLine: 'line-through',
										textDecorationColor: color.tertiary,
									}
								: undefined
						}
					>
						{line}
					</span>
				))}
			</div>
		</div>
	)
}

/** One line under the hero, in secondary text. */
function Subtitle(props: { children: Child }) {
	return (
		<div
			style={{
				display: 'flex',
				alignItems: 'center',
				marginTop: 8,
				height: SUBTITLE * 1.4,
				color: color.secondary,
				whiteSpace: 'nowrap',
				...sans(SUBTITLE),
			}}
		>
			{props.children}
		</div>
	)
}

/** A full address or hash, sized so all of it fits on one line. */
function FullHex(props: { value: string }) {
	const size = fit(props.value, CONTENT_WIDTH, 32, 20, 'mono')
	return (
		<Subtitle>
			<span style={mono(size)}>
				{clip(props.value, CONTENT_WIDTH, size, 'mono')}
			</span>
		</Subtitle>
	)
}

/**
 * A card's content. With facts it rests on the bottom edge, so the hairline
 * sits at one height across cards; without, it centers below the lockup.
 */
function Content(props: { facts?: Fact[]; children: Child }) {
	const facts = Boolean(props.facts?.length)
	return (
		<div
			style={{
				display: 'flex',
				flexDirection: 'column',
				flexGrow: 1,
				justifyContent: facts ? 'flex-end' : 'center',
				paddingBottom: facts ? 0 : 24,
			}}
		>
			{props.children}
			{props.facts && <Facts facts={props.facts} />}
		</div>
	)
}

function fact(
	label: string,
	value: string | undefined,
	options: Omit<Fact, 'label' | 'value'> = {},
): Fact[] {
	return present(value) ? [{ label, value, ...options }] : []
}

// ============ Dates ============

const MONTHS = [
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

/** TDS detail time: Oct 20, 2026, 09:41:07 UTC. */
function formatUtc(date: Date, seconds: boolean): string {
	const pad = (value: number) => String(value).padStart(2, '0')
	const time = `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}${seconds ? `:${pad(date.getUTCSeconds())}` : ''}`
	return `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()}, ${time} UTC`
}

/**
 * Reads the explorer's `date` and `time` (Oct 20, 2026 and 09:41, in UTC),
 * plus older forms such as 03/12/2026 and 7:59 PM, into one TDS timestamp.
 */
export function formatReceiptDate(date: string, time: string): string {
	if (!present(date)) return ''
	let year: number | undefined
	let month: number | undefined
	let day: number | undefined
	const numeric = date.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/)
	const named = date.match(/^([A-Za-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})$/)
	const iso = date.match(/^(\d{4})-(\d{2})-(\d{2})/)
	if (numeric) {
		const [, m = '', d = '', y = ''] = numeric
		month = Number(m) - 1
		day = Number(d)
		year = Number(y.length === 2 ? `20${y}` : y)
	} else if (named) {
		const prefix = (named[1] ?? '').slice(0, 3).toLowerCase()
		month = MONTHS.findIndex((name) => name.toLowerCase() === prefix)
		day = Number(named[2])
		year = Number(named[3])
	} else if (iso) {
		year = Number(iso[1])
		month = Number(iso[2]) - 1
		day = Number(iso[3])
	}
	const clock = (
		present(time)
			? time
			: (date.match(/\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?/i)?.[0] ?? '')
	).match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AP]M)?/i)
	if (year === undefined || month === undefined || month < 0 || !day)
		return [date, present(time) ? time : ''].filter(Boolean).join(' ')
	let hours = clock ? Number(clock[1]) : 0
	const meridiem = clock?.[4]?.toUpperCase()
	if (meridiem === 'PM' && hours < 12) hours += 12
	if (meridiem === 'AM' && hours === 12) hours = 0
	const value = new Date(
		Date.UTC(
			year,
			month,
			day,
			hours,
			clock ? Number(clock[2]) : 0,
			clock?.[3] ? Number(clock[3]) : 0,
		),
	)
	if (Number.isNaN(value.getTime())) return `${date} ${time}`.trim()
	if (!clock)
		return `${MONTHS[value.getUTCMonth()]} ${value.getUTCDate()}, ${value.getUTCFullYear()}`
	return formatUtc(value, Boolean(clock[3]))
}

// ============ Receipt ============

type Segment = {
	text: string
	tone: 'action' | 'asset' | 'text' | 'hex'
	icon?: string | undefined
}

function segments(
	event: ReceiptEvent,
	icons: Record<string, string>,
	withAction: boolean,
): Segment[] {
	const symbols = event.tokenSymbols ?? []
	const words = event.details.split(' ').filter(Boolean)
	const out: Segment[] = withAction
		? [{ text: event.action, tone: 'action' }]
		: []
	words.forEach((word, index) => {
		const tokenIndex = symbols.indexOf(word)
		const address = tokenIndex >= 0 ? event.tokens?.[tokenIndex] : undefined
		const amount =
			/^[<>~$€£¥]*[\d.,]+[KMBT]?$/.test(word) &&
			symbols.includes(words[index + 1] ?? '')
		const hex = /^0x[0-9a-fA-F]+(?:(?:…|\.\.\.)[0-9a-fA-F]+)?$/.test(word)
		out.push({
			text: word,
			tone: tokenIndex >= 0 || amount ? 'asset' : hex ? 'hex' : 'text',
			icon: address ? icons[address] : undefined,
		})
	})
	return out
}

/**
 * One action in a sentence: the action name, then its details with each
 * token's registry logo right before the token name. Amounts and tokens are
 * in the foreground; the words between them are secondary. A long sentence
 * steps down to 30px before its end is cut.
 */
export function ReceiptDetails(props: {
	event: ReceiptEvent
	icons: Record<string, string>
	compact?: boolean
	withAction?: boolean
}) {
	const all = segments(props.event, props.icons, props.withAction ?? false)
	const lineWidth = (size: number) =>
		all.reduce(
			(sum, segment, index) =>
				sum +
				measure(segment.text, size, segment.tone === 'hex' ? 'mono' : 'sans') +
				(segment.icon ? Math.round(size * 0.9) + 10 : 0) +
				(index ? Math.round(size * 0.28) : 0),
			0,
		)
	const base = props.compact ? 30 : SUBTITLE
	const size = Math.max(
		30,
		Math.min(base, Math.floor((base * CONTENT_WIDTH) / lineWidth(base))),
	)
	const iconSize = Math.round(size * 0.9)
	const gap = Math.round(size * 0.28)
	const shown: Segment[] = []
	let width = 0
	for (const [index, segment] of all.entries()) {
		const font: Font = segment.tone === 'hex' ? 'mono' : 'sans'
		const extra = (segment.icon ? iconSize + 10 : 0) + (index ? gap : 0)
		const segmentWidth = measure(segment.text, size, font) + extra
		if (width + segmentWidth <= CONTENT_WIDTH) {
			shown.push(segment)
			width += segmentWidth
			continue
		}
		// Cut the first word that overflows, or end on an ellipsis if too little is left.
		const room = CONTENT_WIDTH - width - extra
		shown.push(
			room > size * 3
				? { ...segment, text: clip(segment.text, room, size, font) }
				: { text: '…', tone: 'text' },
		)
		break
	}
	return (
		<div
			style={{
				display: 'flex',
				alignItems: 'center',
				gap,
				whiteSpace: 'nowrap',
				color: color.secondary,
				...sans(size),
			}}
		>
			{shown.map((segment, index) => (
				<span
					key={index}
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: 10,
						...(segment.tone === 'hex'
							? mono(size - 2)
							: sans(size, segment.tone === 'text' ? 450 : 500)),
						color:
							segment.tone === 'action' || segment.tone === 'asset'
								? color.foreground
								: color.secondary,
					}}
				>
					{segment.icon && (
						<img
							src={segment.icon}
							alt=""
							style={{
								width: iconSize,
								height: iconSize,
								borderRadius: 9999,
							}}
						/>
					)}
					{segment.text}
				</span>
			))}
		</div>
	)
}

/** The first actions as tags, then how many more the transaction has. */
function ActionList(props: { events: ReceiptEvent[]; count: number }) {
	const tags: string[] = []
	let width = 0
	for (const event of props.events.slice(0, 3)) {
		const label = clip(event.action, 360, 26)
		const tagWidth = measure(label, 26) + 40 + 16
		const rest = props.count - tags.length - 1
		const reserve = rest > 0 ? measure(`+${rest} more actions`, 30) + 24 : 0
		if (width + tagWidth + reserve > CONTENT_WIDTH) break
		tags.push(label)
		width += tagWidth
	}
	const remaining = props.count - tags.length
	return (
		<div
			style={{
				display: 'flex',
				alignItems: 'center',
				gap: 16,
				marginTop: 14,
				height: 56,
			}}
		>
			{tags.map((label, index) => (
				<div
					key={index}
					style={{
						display: 'flex',
						alignItems: 'center',
						height: 56,
						paddingLeft: 20,
						paddingRight: 20,
						borderRadius: 9999,
						backgroundColor: color.fill,
						color: color.foreground,
						...sans(26, 500),
					}}
				>
					{label}
				</div>
			))}
			{remaining > 0 && (
				<span style={{ marginLeft: 8, color: color.tertiary, ...sans(30) }}>
					+{remaining} more {remaining === 1 ? 'action' : 'actions'}
				</span>
			)}
		</div>
	)
}

/**
 * A transaction as a TDS receipt: the title with its status, the amount as
 * the hero (one payment's amount, else the total), one line on what happened,
 * then the sender, block, time and network fee.
 */
export function ReceiptCard(props: { data: ReceiptData; title?: string }) {
	const { data } = props
	const events = data.eventsFailed ? [] : data.events
	const count = data.eventsFailed
		? 0
		: Math.max(data.eventCount ?? events.length, events.length)
	const single = count === 1 ? events[0] : undefined
	const failed = data.status === 'reverted'

	const hero: { text: string; font?: Font; kind: 'amount' | 'text' | 'hash' } =
		single?.amount
			? { text: single.amount, kind: 'amount' }
			: present(data.total)
				? { text: data.total, kind: 'amount' }
				: single
					? { text: single.action, kind: 'text' }
					: count > 1
						? { text: `${count} actions`, kind: 'text' }
						: { text: shortHex(data.hash), font: 'mono', kind: 'hash' }

	const feeUnit =
		data.feeToken && !data.fee?.includes(data.feeToken)
			? data.feeToken
			: undefined
	const facts: Fact[] = [
		...fact('From', data.sender, {
			font: /^0x/.test(data.sender) ? 'mono' : 'sans',
		}),
		...fact('Block', groupDigits(data.blockNumber)),
		...fact('Date', formatReceiptDate(data.date, data.time)),
		...fact('Network fee', data.fee, { unit: feeUnit }),
		...(hero.text === data.total ? [] : fact('Total', data.total)),
	]

	return (
		<Content facts={facts}>
			<Eyebrow
				title={props.title ?? 'Receipt'}
				tags={
					data.status && (
						<Tag intent={failed ? 'negative' : 'positive'}>
							{failed ? 'Failed' : 'Confirmed'}
						</Tag>
					)
				}
			/>
			<Hero
				text={hero.text}
				font={hero.font}
				struck={failed && hero.kind === 'amount'}
			/>
			{data.eventsFailed ? (
				<Subtitle>Summary unavailable</Subtitle>
			) : single ? (
				<Subtitle>
					<ReceiptDetails
						event={single}
						icons={data.icons ?? {}}
						withAction={hero.kind !== 'text'}
					/>
				</Subtitle>
			) : count > 1 ? (
				<ActionList events={events} count={count} />
			) : (
				<FullHex value={data.hash} />
			)}
		</Content>
	)
}

// ============ Token ============

/** A token by name and logo, its full contract address, then supply and holders. */
export function TokenCard({
	data,
	icon,
}: {
	data: TokenData
	icon?: string | null
}) {
	const named = present(data.name)
	const symbol = present(data.symbol) ? data.symbol : undefined
	const facts: Fact[] = [
		...(symbol && symbol !== data.name ? fact('Symbol', symbol) : []),
		...fact('Supply', groupDigits(data.supply), { unit: symbol }),
		...fact('Currency', data.currency),
		...fact('Holders', groupDigits(data.holders)),
		...fact('Created', data.created),
		...fact('Quote token', data.quoteToken),
	]
	return (
		<Content facts={facts}>
			<Eyebrow
				title="Token"
				tags={data.isFeeToken && <Tag intent="positive">Fee token</Tag>}
			/>
			<Hero
				text={named ? data.name : shortHex(data.address)}
				font={named ? 'sans' : 'mono'}
				lead={(size) => <TokenIcon src={icon} size={size} />}
			/>
			<FullHex value={data.address} />
		</Content>
	)
}

// ============ Block ============

const BAR = { width: 14, gap: 8, height: 96 }

const histogramWidth = (bars: number) => bars * BAR.width + (bars - 1) * BAR.gap

/** Previous blocks' transaction counts as bars, ending with this block's. */
function Histogram(props: { counts: number[]; current: number }) {
	const all = [...props.counts, props.current]
	const max = Math.max(...all, 1)
	return (
		<div
			style={{
				display: 'flex',
				alignItems: 'flex-end',
				gap: BAR.gap,
				height: BAR.height,
				flexShrink: 0,
			}}
		>
			{all.map((count, index) => (
				<div
					key={index}
					style={{
						width: BAR.width,
						height: Math.max(6, Math.round((count / max) * BAR.height)),
						borderRadius: 4,
						backgroundColor:
							index === all.length - 1 ? color.foreground : color.faint,
					}}
				/>
			))}
		</div>
	)
}

/** A block by number, its time, then transactions, gas, miner and parent. */
export function BlockCard({ data }: { data: BlockData }) {
	const number = present(data.number)
		? data.number
		: data.id && /^\d+$/.test(data.id)
			? data.id
			: undefined
	const unix = Number(data.unixTimestamp)
	const time =
		present(data.unixTimestamp) && Number.isFinite(unix) && unix > 0
			? formatUtc(new Date(unix * 1000), true)
			: present(data.timestamp)
				? formatReceiptDate(
						data.timestamp.split(' ')[0] ?? '',
						data.timestamp.split(' ')[1] ?? '',
					)
				: undefined
	const gas = present(data.gasUsage)
		? /^[\d.]+$/.test(data.gasUsage)
			? `${data.gasUsage}%`
			: data.gasUsage
		: undefined
	const txCount = Number.parseInt(data.txCount.replace(/,/g, ''), 10)
	const history =
		data.prevBlockTxCounts?.some((count) => count >= 0) &&
		Number.isFinite(txCount)
			? data.prevBlockTxCounts
			: undefined
	const hero = number ? groupDigits(number) : shortHex(data.id ?? '—')
	const facts = [
		...fact('Transactions', groupDigits(data.txCount)),
		...fact('Gas used', gas),
		...fact('Miner', data.miner, { font: 'mono' }),
		...fact('Parent', data.parentHash, { font: 'mono' }),
	]
	return (
		<Content facts={facts}>
			<Eyebrow title="Block" />
			<div
				style={{
					display: 'flex',
					alignItems: 'flex-end',
					justifyContent: 'space-between',
				}}
			>
				<div style={{ display: 'flex', flexDirection: 'column' }}>
					<Hero
						text={hero}
						font={number ? 'sans' : 'mono'}
						width={
							history
								? CONTENT_WIDTH - histogramWidth(history.length + 1) - 64
								: CONTENT_WIDTH
						}
					/>
					{time && <Subtitle>{time}</Subtitle>}
				</div>
				{history && (
					<div style={{ display: 'flex', paddingBottom: time ? 18 : 0 }}>
						<Histogram counts={history} current={txCount} />
					</div>
				)}
			</div>
		</Content>
	)
}

// ============ Address ============

function tokenList(tokens: string[]): string | undefined {
	if (tokens.length === 0) return undefined
	const shown = tokens.slice(0, 2).join(', ')
	return tokens.length > 2 ? `${shown} +${tokens.length - 2}` : shown
}

function methodList(methods: string[] | undefined): string | undefined {
	if (!methods?.length) return undefined
	const shown = methods.slice(0, 2).join(', ')
	return methods.length > 2 ? `${shown} +${methods.length - 2}` : shown
}

/**
 * An account, contract or Zone Portal: the identicon and name (or the short
 * address) as the hero, the full address or description below, then
 * activity. Missing data is left out, never shown as zero.
 */
export function AddressCard({ data }: { data: AddressData }) {
	const contract = data.accountType === 'contract'
	const name =
		contract && present(data.contractName) ? data.contractName : undefined
	const description =
		contract && present(data.contractDescription)
			? data.contractDescription
			: undefined
	const title =
		data.kind ??
		(contract
			? 'Contract'
			: data.accountType === 'account'
				? 'Account'
				: 'Address')
	const facts: Fact[] = [
		...(data.details ?? []),
		...(description ? fact('Address', data.address, { font: 'mono' }) : []),
		...(contract
			? [
					...fact('Deployer', data.deployer, { font: 'mono' }),
					...fact('Events', data.txCount),
					...fact('Created', data.created),
					...fact('Methods', methodList(data.methods)),
				]
			: [
					...fact('Holdings', data.holdings),
					...fact('Assets', tokenList(data.tokensHeld)),
					...fact('Transactions', data.txCount),
					...fact('Last active', data.lastActive),
					...fact('Created', data.created),
				]),
	]
	const lines = description ? descriptionLines(description) : []
	return (
		<Content facts={facts}>
			<Eyebrow title={title} />
			<Hero
				text={name ?? shortHex(data.address)}
				font={name ? 'sans' : 'mono'}
				lead={(size) => <Identicon address={data.address} size={size} />}
			/>
			{description ? (
				<div
					style={{
						display: 'flex',
						flexDirection: 'column',
						marginTop: 8,
						color: color.secondary,
						...sans(DESCRIPTION),
						lineHeight: 1.3,
					}}
				>
					{lines.map((line, index) => (
						<span key={index}>{line}</span>
					))}
				</div>
			) : (
				<FullHex value={data.address} />
			)}
		</Content>
	)
}

const DESCRIPTION = 32

/** Wraps a description onto at most two lines, ending in an ellipsis if cut. */
function descriptionLines(text: string): string[] {
	const lines = ['']
	for (const word of text.split(' ')) {
		const last = lines.length - 1
		const next = lines[last] ? `${lines[last]} ${word}` : word
		if (!lines[last] || measure(next, DESCRIPTION) <= CONTENT_WIDTH)
			lines[last] = next
		else if (lines.length < 2) lines.push(word)
		else {
			// One word past the end, so the cut below shows an ellipsis.
			lines[last] = next
			break
		}
	}
	return lines.map((line) => clip(line, CONTENT_WIDTH, DESCRIPTION))
}

// ============ Listings ============

/** A listing page: the section icon and name with one line on what it holds. */
export function ListingCard(props: {
	title: string
	subtitle: string
	icon: string
}) {
	return (
		<Content>
			<IconChip icon={props.icon} size={112} />
			<span
				style={{
					marginTop: 40,
					...sans(HERO.max, 600),
					lineHeight: 1.12,
				}}
			>
				{props.title}
			</span>
			<Subtitle>{props.subtitle}</Subtitle>
		</Content>
	)
}

/** The explorer's landing page: the wordmark over its search field. */
export function HomeCard(props: { logo: string; search: string }) {
	const pills = ['Accounts', 'Contracts', 'Receipts', 'Blocks', 'Tokens']
	return (
		<div
			style={{
				display: 'flex',
				flexDirection: 'column',
				alignItems: 'center',
				justifyContent: 'center',
				width: 1200,
				height: 630,
				backgroundColor: color.background,
				color: color.foreground,
				...sans(28),
			}}
		>
			<div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
				<img src={props.logo} alt="Tempo" style={{ width: 296, height: 66 }} />
				<span style={{ color: color.secondary, ...sans(66, 500) }}>
					Explorer
				</span>
			</div>
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: 20,
					marginTop: 56,
					width: 800,
					height: 104,
					paddingLeft: 40,
					paddingRight: 40,
					borderRadius: 9999,
					backgroundColor: color.surface,
					border: `2px solid ${color.border}`,
				}}
			>
				<img src={props.search} alt="" style={{ width: 40, height: 40 }} />
				<span style={{ color: color.tertiary, ...sans(34) }}>
					Search address, hash, block, token
				</span>
			</div>
			<div style={{ display: 'flex', gap: 16, marginTop: 32 }}>
				{pills.map((pill) => (
					<div
						key={pill}
						style={{
							display: 'flex',
							alignItems: 'center',
							height: 60,
							paddingLeft: 26,
							paddingRight: 26,
							borderRadius: 9999,
							backgroundColor: color.fill,
							color: color.secondary,
							...sans(26, 500),
						}}
					>
						{pill}
					</div>
				))}
			</div>
		</div>
	)
}
