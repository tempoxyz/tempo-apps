import { useQuery } from '@tanstack/react-query'
import type * as React from 'react'
import { BentoTile } from '#comps/bento/BentoTile'
import { getTempoEnv, type TempoEnv } from '#lib/env'
import { landingChainVitalsQueryOptions } from '#lib/queries'

const ENV_OPTIONS: ReadonlyArray<{
	value: TempoEnv
	label: string
	host: string
}> = [
	{
		value: 'testnet',
		label: 'Testnet',
		host: 'https://explore.testnet.tempo.xyz',
	},
	{
		value: 'mainnet',
		label: 'Mainnet',
		host: 'https://explore.mainnet.tempo.xyz',
	},
	{
		value: 'devnet',
		label: 'Devnet',
		host: 'https://explore.devnet.tempo.xyz',
	},
]

function navigateToEnv(next: TempoEnv) {
	if (typeof window === 'undefined') return
	const target = ENV_OPTIONS.find((o) => o.value === next)
	if (!target) return
	if (next === getTempoEnv()) return
	window.location.assign(
		`${target.host}${window.location.pathname}${window.location.search}`,
	)
}

export function ChainIdTile(): React.JSX.Element {
	const { data, isPending } = useQuery(landingChainVitalsQueryOptions())
	const env = getTempoEnv()

	return (
		<BentoTile
			title="Chain ID"
			action={
				<BentoTile.SelectAction<TempoEnv>
					value={env}
					options={ENV_OPTIONS.map(({ value, label }) => ({ value, label }))}
					onChange={navigateToEnv}
					ariaLabel="switch network"
				/>
			}
			span={{ base: 1, sm: 1, lg: 1 }}
			rowSpan={{ base: 1, lg: 1 }}
			status={isPending ? 'loading' : 'ready'}
			contentClassName="justify-end"
		>
			<BentoTile.PrimaryValue
				value={data?.chainId ?? '—'}
				className="text-[40px] tracking-[-0.025em]"
			/>
		</BentoTile>
	)
}
