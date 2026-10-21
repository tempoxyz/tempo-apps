/** Regen's light surface roles, shared by every social card at 1200 × 630. */
export const brand = {
	background: '#fafafa',
	surface: '#ffffff',
	foreground: '#181818',
	secondary: '#6b6b6b',
	border: '#e5e5e5',
	link: '#3b82f6',
} as const

const messages: Record<string, [string, string]> = {
	Token: ['Examine', 'Inspect token transfers, configuration & holders'],
	Block: ['Inspect', 'Explore transactions and activity in this block'],
	Account: ['Discover', 'Explore balances, transfers & activity'],
	Contract: ['Inspect', 'Explore contract activity and source code'],
	'Zone Portal': ['Discover', 'Explore deposits, withdrawals & assets'],
}

export function CardBackground(props: {
	title: string
	logo: string
	artwork: string
}) {
	const [headline, description] = messages[props.title] ?? [
		props.title,
		'Explore activity on Tempo',
	]
	return (
		<ReceiptBackground
			{...props}
			headline={headline}
			description={description}
		/>
	)
}

export function ListingCard(props: {
	title: string
	subtitle: string
	logo: string
	artwork: string
}) {
	return (
		<div
			tw="relative flex w-full h-full items-center justify-center"
			style={{
				backgroundColor: '#f3f3f3',
				color: brand.foreground,
				fontFamily: 'Pilat',
			}}
		>
			<img
				src={props.artwork}
				width={1200}
				height={657}
				tw="absolute"
				style={{ left: 0, top: 0, opacity: 0.65 }}
				alt=""
			/>
			<div
				tw="absolute"
				style={{
					left: 475,
					top: 20,
					width: 255,
					height: 75,
					backgroundColor: '#f3f3f3',
				}}
			/>
			<div
				tw="absolute"
				style={{
					left: 555,
					top: 540,
					width: 85,
					height: 90,
					backgroundColor: '#f3f3f3',
				}}
			/>
			<div tw="flex flex-col items-center" style={{ gap: 20, maxWidth: 860 }}>
				<span style={{ fontSize: 92, lineHeight: 1.1 }}>
					{props.title === 'Search. Explore. Discover.'
						? 'Explore'
						: props.title}
				</span>
				<span style={{ fontSize: 28, color: brand.secondary }}>
					{props.title === 'Search. Explore. Discover.'
						? 'Search. Explore. Discover.'
						: props.subtitle}
				</span>
			</div>
			<img
				src={props.logo}
				width={144}
				height={40}
				tw="absolute"
				style={{ bottom: 44, left: 528 }}
				alt="Tempo"
			/>
		</div>
	)
}

export function ReceiptBackground(props: {
	logo: string
	artwork: string
	headline?: string
	description?: string
}) {
	return (
		<div
			tw="absolute inset-0 flex"
			style={{
				backgroundColor: '#f3f3f3',
				fontFamily: 'Pilat',
				color: brand.foreground,
			}}
		>
			<img
				src={props.artwork}
				width={1200}
				height={657}
				tw="absolute"
				style={{ left: 0, top: 0, opacity: 0.6 }}
				alt=""
			/>
			{/* Cover the template's old network label; keep the original ray artwork. */}
			<div
				tw="absolute"
				style={{
					left: 475,
					top: 20,
					width: 255,
					height: 75,
					backgroundColor: '#f3f3f3',
				}}
			/>
			<div
				tw="absolute"
				style={{
					left: 555,
					top: 540,
					width: 85,
					height: 90,
					backgroundColor: '#f3f3f3',
				}}
			/>
			<div
				tw="absolute flex flex-col items-center"
				style={{ left: 758, top: 188, width: 390, gap: 26 }}
			>
				<span style={{ fontSize: 82, fontWeight: 400 }}>
					{props.headline ?? 'Glance'}
				</span>
				<span
					style={{
						fontSize: 32,
						lineHeight: 1.35,
						textAlign: 'center',
						color: brand.secondary,
					}}
				>
					{props.description ?? 'Fetch a summary of transaction details'}
				</span>
			</div>
			<img
				src={props.logo}
				width={180}
				height={50}
				tw="absolute"
				style={{ right: 62, bottom: 48 }}
				alt="Tempo"
			/>
		</div>
	)
}
