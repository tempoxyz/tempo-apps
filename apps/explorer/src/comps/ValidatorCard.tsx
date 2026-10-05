import { Link } from '@tanstack/react-router'
import type { Address } from 'viem'
import { Addresses } from 'viem/tempo'
import { useReadContract } from 'wagmi'
import { InfoCard } from '#comps/InfoCard'
import { Abis } from '#lib/abis'
import { useIsMounted } from '#lib/hooks'

export function ValidatorCard(
	props: ValidatorCard.Props,
): React.JSX.Element | null {
	const isMounted = useIsMounted()
	const { data: validator } = useReadContract({
		address: Addresses.validatorV2,
		abi: Abis.validatorConfigV2,
		functionName: 'validatorByAddress',
		args: [props.address],
		query: { enabled: isMounted, staleTime: 30_000, retry: false },
	})

	// Ordinary addresses revert with ValidatorNotFound. Only render known validators.
	if (!validator) return null

	const active = validator.deactivatedAtHeight === 0n
	return (
		<InfoCard
			className="w-full!"
			title={<InfoCard.Title>Validator</InfoCard.Title>}
			sections={[
				{ label: 'Active', value: active ? 'Yes' : 'No' },
				<div key="recipient" className="flex flex-col gap-2 min-w-0">
					<span className="text-tertiary">Fee recipient</span>
					<Link
						to="/address/$address"
						params={{ address: validator.feeRecipient }}
						search={{ tab: 'holdings' }}
						className="font-mono copy-13 text-primary break-all leading-relaxed max-w-[32ch] hover:underline"
					>
						{validator.feeRecipient}
					</Link>
				</div>,
				{
					label: <span className="normal-case">Added at height</span>,
					value: (
						<Link
							to="/block/$id"
							params={{ id: validator.addedAtHeight.toString() }}
							className="hover:underline break-all"
						>
							{validator.addedAtHeight.toString()}
						</Link>
					),
				},
				...(!active
					? [
							{
								label: (
									<span className="normal-case">Deactivated at height</span>
								),
								value: (
									<Link
										to="/block/$id"
										params={{ id: validator.deactivatedAtHeight.toString() }}
										className="hover:underline break-all"
									>
										{validator.deactivatedAtHeight.toString()}
									</Link>
								),
							},
						]
					: []),
			]}
		/>
	)
}

export declare namespace ValidatorCard {
	type Props = { address: Address }
}
