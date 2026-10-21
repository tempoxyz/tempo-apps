import type { Child } from 'hono/jsx'

/**
 * Tempo Design System 0.2.2, dark scheme. Every card renders at 1200 × 630 and
 * is read at roughly half that size in a feed, so type, spacing and radii use
 * twice the TDS pixel values.
 */
export const color = {
	background: '#100f0f', // color.background.primary
	surface: '#1a1919', // color.background.surface
	foreground: '#fff', // color.foreground
	secondary: '#bcbbbb', // gray.900
	tertiary: '#8f8e8e', // gray.700
	faint: '#484747', // gray.500
	fill: '#ffffff12', // grayAlpha.100
	border: '#ffffff1a', // grayAlpha.200
	chip: '#ffffff21', // grayAlpha.300
	accent: '#4471ed', // blue.700
	positive: { background: '#052315', foreground: '#59e5a4' }, // green.100, green.900
	negative: { background: '#2a1410', foreground: '#f55c45' }, // red.100, red.900
	warning: { background: '#2d1504', foreground: '#fa8e36' }, // amber.100, amber.900
} as const

export const CARD = { width: 1200, height: 630, paddingX: 64, paddingY: 56 }
export const CONTENT_WIDTH = CARD.width - CARD.paddingX * 2

// ============ Typography ============

/**
 * Inter tracking from TDS (`-0.0223 + 0.185 * e^(-0.1745 * size)` em), taken
 * at the size a reader sees, which is half the rendered size.
 */
export function tracking(size: number): string {
	const em = -0.0223 + 0.185 * Math.exp(-0.1745 * (size / 2))
	return `${Math.round(em * size * 100) / 100}px`
}

/** Inter at `size` with TDS tracking: 450 copy, 500 label, 550 strong, 600 heading. */
export function sans(size: number, weight: 450 | 500 | 550 | 600 = 450) {
	return {
		fontFamily: 'Inter',
		fontSize: size,
		fontWeight: weight,
		letterSpacing: tracking(size),
		// Takumi ignores `font-variant-numeric`; the feature tag sets tabular figures.
		fontFeatureSettings: '"tnum"',
	} as const
}

/** Geist Mono for addresses and hashes. */
export function mono(size: number) {
	return {
		fontFamily: 'Geist Mono',
		fontSize: size,
		fontWeight: 400,
		letterSpacing: '0px',
	} as const
}

/** `display` is Inter Semi Bold (heroes and titles); `sans` is lighter text. */
export type Font = 'sans' | 'display' | 'mono'

// Inter Semi Bold advance widths in em with tabular figures, measured with
// Takumi. Estimates run up to 2% under for display text and 6% over for 450
// and 500, so `measure` scales them to err slightly wide.
const ADVANCE = new Map<string, number>()
for (const [chars, width] of [
	['ijl', 0.27],
	[' ', 0.26],
	['I', 0.28],
	[".,:;·!|'", 0.33],
	['ft()/[]', 0.4],
	['r', 0.4],
	['-"', 0.5],
	['?s', 0.55],
	['cxzkL', 0.58],
	['aevy¥FJ', 0.59],
	['nugbdpqoE$€£<>+−#&', 0.66],
	['0123456789', 0.65],
	['PRBSTZ', 0.67],
	['AKVXY', 0.73],
	['CDGHNOQU', 0.76],
	['mM…', 0.94],
	['wW—%', 1.03],
] as const)
	for (const char of chars) ADVANCE.set(char, width)

/** Estimated rendered width of `text` in pixels, with TDS tracking applied. */
export function measure(text: string, size: number, font: Font = 'sans') {
	if (font === 'mono') return [...text].length * 0.6 * size
	let em = 0
	for (const char of text)
		em += ADVANCE.get(char) ?? ((char.codePointAt(0) ?? 0) > 0x2e80 ? 1 : 0.68)
	const width = em * size + Number.parseFloat(tracking(size)) * [...text].length
	return width * (font === 'display' ? 1.02 : 0.97)
}

/** The largest size from `max` down to `min` at which `text` fits `width`. */
export function fit(
	text: string,
	width: number,
	max: number,
	min: number,
	font: Font = 'sans',
): number {
	const natural = measure(text, 100, font) / 100
	return Math.max(min, Math.min(max, Math.floor(width / natural)))
}

/** Cuts `text` at the end so it fits `width` at `size`. */
export function clip(
	text: string,
	width: number,
	size: number,
	font: Font = 'sans',
): string {
	// Half a pixel absorbs rounding when a width is derived from this text.
	if (measure(text, size, font) <= width + 0.5) return text
	const chars = [...text]
	while (chars.length > 1 && measure(`${chars.join('')}…`, size, font) > width)
		chars.pop()
	return `${chars.join('').trimEnd()}…`
}

// ============ Values ============

/** TDS `formatHex`: four characters each side of an ellipsis, as 0xd8dA…6045. */
export function shortHex(value: string, chars = 4): string {
	if (!/^0x[0-9a-fA-F]+$/.test(value) || value.length <= chars * 2 + 3)
		return value
	return `${value.slice(0, chars + 2)}…${value.slice(-chars)}`
}

/** Groups plain digits with the en-US separator, as 18,204,551. */
export function groupDigits(value: string): string {
	return /^\d+$/.test(value)
		? value.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
		: value
}

/** Missing values arrive as an empty string or an em dash. */
export function present(value: string | undefined): value is string {
	return Boolean(value && value !== '—')
}

export type Network = 'Mainnet' | 'Testnet' | 'Devnet' | 'Nextfork'

const CHAIN_NETWORKS: Record<number, Network> = {
	4217: 'Mainnet',
	42431: 'Testnet',
}

export function networkOf(chainId: number | undefined): Network | undefined {
	return chainId === undefined ? undefined : CHAIN_NETWORKS[chainId]
}

// ============ Primitives ============

export type Intent = 'positive' | 'negative' | 'neutral'

/** TDS Tag with a leading dot, at twice its medium size. */
export function Tag(props: {
	intent?: Intent
	dot?: boolean
	children: Child
}) {
	const intent = props.intent ?? 'neutral'
	const tone =
		intent === 'neutral'
			? { background: color.fill, foreground: color.secondary }
			: color[intent]
	return (
		<div
			style={{
				display: 'flex',
				alignItems: 'center',
				flexShrink: 0,
				gap: 12,
				height: 48,
				paddingLeft: props.dot === false ? 20 : 18,
				paddingRight: 20,
				borderRadius: 9999,
				backgroundColor: tone.background,
				color: tone.foreground,
				...sans(24, 500),
			}}
		>
			{props.dot !== false && (
				<div
					style={{
						width: 12,
						height: 12,
						borderRadius: 9999,
						backgroundColor: tone.foreground,
					}}
				/>
			)}
			<span>{props.children}</span>
		</div>
	)
}

/** The explorer header's network label: a plain tag, green on mainnet and amber elsewhere. */
export function NetworkTag(props: { network: Network }) {
	return (
		<div
			style={{
				display: 'flex',
				alignItems: 'center',
				gap: 14,
				color: color.secondary,
				...sans(28, 500),
			}}
		>
			<div
				style={{
					width: 14,
					height: 14,
					borderRadius: 9999,
					backgroundColor:
						props.network === 'Mainnet'
							? color.positive.foreground
							: color.warning.foreground,
				}}
			/>
			<span>{props.network}</span>
		</div>
	)
}

/** The Tempo wordmark beside the product name. */
export function Lockup(props: { logo: string; height?: number }) {
	const height = props.height ?? 30
	return (
		<div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
			<img
				src={props.logo}
				alt="Tempo"
				style={{ width: Math.round((height * 830) / 185), height }}
			/>
			<span style={{ color: color.secondary, ...sans(height, 500) }}>
				Explorer
			</span>
		</div>
	)
}

/** TDS IconChip at twice its 48px size. */
export function IconChip(props: { icon: string; size?: number }) {
	const size = props.size ?? 96
	return (
		<div
			style={{
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				width: size,
				height: size,
				flexShrink: 0,
				borderRadius: size / 4,
				backgroundColor: color.chip,
			}}
		>
			<img
				src={props.icon}
				alt=""
				style={{ width: size * 0.42, height: size * 0.42 }}
			/>
		</div>
	)
}

/** A round token logo, or the TDS gray circle when the registry has none. */
export function TokenIcon(props: { src?: string | null; size: number }) {
	return props.src ? (
		<img
			src={props.src}
			alt=""
			style={{
				width: props.size,
				height: props.size,
				flexShrink: 0,
				borderRadius: 9999,
			}}
		/>
	) : (
		<div
			style={{
				width: props.size,
				height: props.size,
				flexShrink: 0,
				borderRadius: 9999,
				backgroundColor: color.chip,
			}}
		/>
	)
}

// Steps 500 (light), 700 and 500 (dark) of each TDS ramp, as in TDS Identicon.
const IDENTICON_TONES = [
	['#ffc4a2', '#e06f12', '#703d15'],
	['#afc8fd', '#4471ed', '#304170'],
	['#82eaaa', '#13a963', '#046340'],
	['#f8b8c4', '#cc055b', '#6b1f3f'],
	['#deacf1', '#ba59dd', '#68297d'],
	['#feb8aa', '#eb3417', '#832416'],
	['#87e4ff', '#00aacb', '#055b69'],
] as const

/**
 * The TDS Identicon for `address` as an SVG data URL: the same cyrb128 seed,
 * mulberry32 draws and gradient, so the card matches the explorer's avatar.
 */
export function identicon(address: string): string {
	let a = 1779033703
	let b = 3144134277
	let c = 1013904242
	let d = 2773480762
	for (const char of address.toLowerCase()) {
		const code = char.charCodeAt(0)
		a = b ^ Math.imul(a ^ code, 597399067)
		b = c ^ Math.imul(b ^ code, 2869860233)
		c = d ^ Math.imul(c ^ code, 951274213)
		d = a ^ Math.imul(d ^ code, 2716044179)
	}
	let state = (a ^ b ^ c ^ d) >>> 0
	const next = () => {
		state = (state + 0x6d2b79f5) >>> 0
		let t = state
		t = Math.imul(t ^ (t >>> 15), t | 1)
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
	const position = () => Math.round((0.15 + next() * 0.7) * 100) / 100
	const angle = Math.floor(next() * 360)
	const glow = [position(), position()]
	const [light, mid, deep] =
		IDENTICON_TONES[Math.floor(next() * IDENTICON_TONES.length)] ??
		IDENTICON_TONES[0]
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1" width="256" height="256"><defs><linearGradient id="t" gradientTransform="rotate(${angle} 0.5 0.5)"><stop offset="0" stop-color="${light}"/><stop offset="0.5" stop-color="${mid}"/><stop offset="1" stop-color="${deep}"/></linearGradient><radialGradient id="g" cx="${glow[0]}" cy="${glow[1]}" r="0.6"><stop offset="0" stop-color="${light}" stop-opacity="0.7"/><stop offset="1" stop-color="${light}" stop-opacity="0"/></radialGradient></defs><rect fill="url(#t)" width="1" height="1"/><rect fill="url(#g)" width="1" height="1"/></svg>`
	return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

export function Identicon(props: { address: string; size: number }) {
	return (
		<img
			src={identicon(props.address)}
			alt=""
			style={{
				width: props.size,
				height: props.size,
				flexShrink: 0,
				borderRadius: 9999,
			}}
		/>
	)
}

// ============ Card frame ============

/**
 * The shared 1200 × 630 frame: the TDS primary background, the Tempo lockup
 * and the network along the top, and the card's content anchored to the
 * bottom edge so every family shares one baseline.
 */
export function Card(props: {
	logo: string
	network?: Network | undefined
	children: Child
}) {
	return (
		<div
			style={{
				display: 'flex',
				flexDirection: 'column',
				width: CARD.width,
				height: CARD.height,
				paddingTop: CARD.paddingY,
				paddingBottom: CARD.paddingY,
				paddingLeft: CARD.paddingX,
				paddingRight: CARD.paddingX,
				backgroundColor: color.background,
				color: color.foreground,
				...sans(28),
			}}
		>
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'space-between',
					height: 40,
					flexShrink: 0,
				}}
			>
				<Lockup logo={props.logo} />
				{props.network && <NetworkTag network={props.network} />}
			</div>
			<div
				style={{
					display: 'flex',
					flexDirection: 'column',
					justifyContent: 'flex-end',
					flexGrow: 1,
					minHeight: 0,
					paddingTop: 32,
				}}
			>
				{props.children}
			</div>
		</div>
	)
}

/** The card heading: a small title with an optional status tag beside it. */
export function Eyebrow(props: { title: string; tags?: Child }) {
	return (
		<div style={{ display: 'flex', alignItems: 'center', gap: 20, height: 48 }}>
			<span style={{ color: color.secondary, ...sans(32, 500) }}>
				{props.title}
			</span>
			{props.tags}
		</div>
	)
}

export type Fact = {
	label: string
	value: string
	/** Muted text after the value, such as a token symbol. */
	unit?: string | undefined
	font?: Font | undefined
}

const FACT_GAP = { max: 72, min: 48 }
const FACT_LABEL = 24
const FACT_VALUE = 30
const UNIT_GAP = 9

/** A fact's value size: mono runs 2px smaller to match Inter's x-height. */
const valueSize = (fact: Fact) =>
	fact.font === 'mono' ? FACT_VALUE - 2 : FACT_VALUE

const valueWidth = (fact: Fact) =>
	measure(fact.value, valueSize(fact), fact.font) +
	(fact.unit ? UNIT_GAP + measure(fact.unit, valueSize(fact)) : 0)

/**
 * Fits up to four facts on one row. Hashes beside other facts take the TDS
 * short form. Still too wide, the facts drop their units, then trailing
 * facts (keeping two), then the gap narrows from 72px to 48px, and only then
 * the widest values are cut, so a number is rarely cut.
 */
function layoutFacts(input: Fact[]) {
	let facts = input
		.slice(0, 4)
		.map((fact, _, list) =>
			fact.font === 'mono' && list.length > 1
				? { ...fact, value: shortHex(fact.value) }
				: fact,
		)
	const total = (list: Fact[]) =>
		list.reduce(
			(sum, fact) =>
				sum + Math.max(measure(fact.label, FACT_LABEL), valueWidth(fact)),
			0,
		) +
		FACT_GAP.min * (list.length - 1)
	if (total(facts) > CONTENT_WIDTH)
		facts = facts.map((fact) => ({ ...fact, unit: undefined }))
	while (facts.length > 2 && total(facts) > CONTENT_WIDTH)
		facts = facts.slice(0, -1)
	const widths = facts.map((fact) =>
		Math.max(measure(fact.label, FACT_LABEL), valueWidth(fact)),
	)
	const natural = widths.reduce((sum, width) => sum + width, 0)
	const gap =
		facts.length > 1
			? Math.max(
					FACT_GAP.min,
					Math.min(
						FACT_GAP.max,
						(CONTENT_WIDTH - natural) / (facts.length - 1),
					),
				)
			: 0
	// Water-fill: columns under an equal share keep their width; the rest split
	// what remains.
	const limits = [...widths]
	let spare = CONTENT_WIDTH - gap * (facts.length - 1)
	let open = facts.length
	for (const { width, index } of widths
		.map((width, index) => ({ width, index }))
		.sort((a, b) => a.width - b.width)) {
		const limit = Math.min(width, spare / open)
		limits[index] = limit
		spare -= limit
		open -= 1
	}
	return {
		facts: facts.map((fact, index) => ({ fact, limit: limits[index] ?? 0 })),
		gap,
	}
}

/**
 * Up to four supporting facts below a hairline: a label above each value,
 * columns sized to their content.
 */
export function Facts(props: { facts: Fact[] }) {
	if (props.facts.length === 0) return null
	const { facts, gap } = layoutFacts(props.facts)
	return (
		<div
			style={{
				display: 'flex',
				flexDirection: 'column',
				flexShrink: 0,
				marginTop: 44,
			}}
		>
			<div style={{ height: 2, backgroundColor: color.border }} />
			<div style={{ display: 'flex', gap, paddingTop: 28 }}>
				{facts.map(({ fact, limit }) => {
					const size = valueSize(fact)
					const unitWidth = fact.unit ? UNIT_GAP + measure(fact.unit, size) : 0
					const value =
						fact.font === 'mono' && measure(fact.value, size, 'mono') > limit
							? shortHex(fact.value)
							: clip(fact.value, limit - unitWidth, size, fact.font)
					return (
						<div
							key={fact.label}
							style={{
								display: 'flex',
								flexDirection: 'column',
								gap: 8,
								flexShrink: 0,
							}}
						>
							<span style={{ color: color.tertiary, ...sans(FACT_LABEL) }}>
								{clip(fact.label, limit, FACT_LABEL)}
							</span>
							<div
								style={{
									display: 'flex',
									gap: UNIT_GAP,
									whiteSpace: 'nowrap',
									color: color.foreground,
									...(fact.font === 'mono' ? mono(size) : sans(size, 500)),
								}}
							>
								<span>{value}</span>
								{fact.unit && (
									<span style={{ color: color.secondary, ...sans(size, 500) }}>
										{fact.unit}
									</span>
								)}
							</div>
						</div>
					)
				})}
			</div>
		</div>
	)
}
