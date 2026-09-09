import {
	formatPortalBalance,
	portalId,
	type PortalNetwork,
	type PortalOverview,
} from '#zone-portal.ts'

export function ZonePortalCard({
	address,
	network,
	overview,
	updated,
}: {
	address: string
	network: PortalNetwork
	overview?: PortalOverview
	updated: string
}) {
	const number = new Intl.NumberFormat('en-US')
	return (
		<div
			tw="flex flex-col w-full h-full bg-white"
			style={{ padding: '48px 56px', fontFamily: 'Pilat', color: '#111827' }}
		>
			<div tw="flex w-full justify-between items-center">
				<span style={{ fontSize: 48 }}>
					Zone Portal #{String(portalId(address))}
				</span>
				<span
					style={{
						fontSize: 24,
						backgroundColor: '#f3f4f6',
						padding: '10px 20px',
						borderRadius: 8,
					}}
				>
					{network === 'mainnet'
						? 'Mainnet'
						: network === 'testnet'
							? 'Testnet'
							: network === 'devnet'
								? 'Devnet'
								: 'Nextfork'}
				</span>
			</div>
			<div
				style={{
					fontFamily: 'GeistMono',
					fontSize: 22,
					color: '#6b7280',
					marginTop: 12,
				}}
			>
				{address}
			</div>
			<div tw="flex w-full" style={{ gap: 20, marginTop: 36 }}>
				{(['deposits', 'withdrawals', 'batches'] as const).map((key) => (
					<div
						key={key}
						tw="flex flex-col"
						style={{
							width: 349,
							backgroundColor: '#f3f4f6',
							borderRadius: 12,
							padding: '22px 24px',
							gap: 10,
						}}
					>
						<span style={{ color: '#6b7280', fontSize: 25 }}>
							{key === 'deposits'
								? 'Deposits'
								: key === 'withdrawals'
									? 'Withdrawals'
									: 'Batches'}
						</span>
						<span style={{ fontSize: 44 }}>
							{overview ? number.format(overview.counts[key]) : '—'}
						</span>
					</div>
				))}
			</div>
			<div
				tw="flex w-full justify-between"
				style={{ marginTop: 28, fontSize: 24, color: '#6b7280' }}
			>
				<span>Portal balances</span>
				<span>
					{overview
						? `${overview.assets.length} enabled assets`
						: 'Data temporarily unavailable'}
				</span>
			</div>
			{overview?.assets.slice(0, 3).map((asset) => (
				<div
					key={asset.address}
					tw="flex w-full justify-between"
					style={{ fontSize: 25, marginTop: 12 }}
				>
					<span>{asset.symbol.slice(0, 24)}</span>
					<span>{formatPortalBalance(asset.balance, asset.decimals)}</span>
				</div>
			))}
			{overview && overview.assets.length > 3 && (
				<div style={{ color: '#6b7280', fontSize: 20, marginTop: 8 }}>
					+{overview.assets.length - 3} more assets
				</div>
			)}
			<div
				tw="absolute flex justify-between"
				style={{
					left: 56,
					right: 56,
					bottom: 32,
					fontSize: 20,
					color: '#6b7280',
				}}
			>
				<span>
					{overview
						? `Indexed activity · ${updated} UTC`
						: 'Activity and balances could not be loaded'}
				</span>
				<span style={{ color: '#111827', fontSize: 24 }}>Tempo Explorer</span>
			</div>
		</div>
	)
}
