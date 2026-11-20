import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import type { Address } from 'viem'
import { InfoCard } from '#comps/InfoCard'
import { engineLabels } from '#lib/earn'
import { PriceFormatter } from '#lib/formatting'
import { useIsMounted } from '#lib/hooks'
import { earnVaultsQueryOptions } from '#lib/queries/earn'

/**
 * Links an address that is a Tempo Earn vault, or a vault's engine, to the
 * vault's Earn page. Renders nothing for any other address.
 */
export function EarnVaultCard(
	props: EarnVaultCard.Props,
): React.JSX.Element | null {
	const isMounted = useIsMounted()
	const address = props.address.toLowerCase()
	const { data } = useQuery({
		...earnVaultsQueryOptions(),
		enabled: isMounted,
		refetchInterval: false,
	})
	const vault = data?.vaults.find(
		(item) => item.address === address || item.engineAddress === address,
	)
	if (!vault) return null

	const isEngine = vault.address !== address
	return (
		<InfoCard
			className="w-full!"
			title={
				<InfoCard.Title>
					{isEngine ? 'Tempo Earn engine' : 'Tempo Earn vault'}
				</InfoCard.Title>
			}
			sections={[
				{ label: 'Asset', value: vault.asset.symbol },
				{ label: 'Engine', value: engineLabels[vault.engine] },
				{
					label: 'TVL',
					value:
						vault.tvl === null
							? '—'
							: PriceFormatter.format(vault.tvl, { format: 'short' }),
				},
				<Link
					key="earn"
					to="/earn/$vault"
					params={{ vault: vault.address }}
					className="text-accent hover:underline"
				>
					View vault →
				</Link>,
			]}
		/>
	)
}

export declare namespace EarnVaultCard {
	type Props = {
		address: Address
	}
}
