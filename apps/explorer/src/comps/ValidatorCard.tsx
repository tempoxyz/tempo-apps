import { Link } from '@tanstack/react-router'
import { style } from '@tempoxyz/ds/platform'
import type { Address } from 'viem'
import { Addresses } from 'viem/tempo'
import { useReadContract } from 'wagmi'
import { cx } from 'zyzz'
import { CopyButton } from '#comps/CopyButton'
import { InfoCard } from '#comps/InfoCard'
import { Abis } from '#lib/abis'
import { useIsMounted } from '#lib/hooks'
import { linkHover } from '#styles/explorer'

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
			className={styles.card().className}
			title={<InfoCard.Title>Validator</InfoCard.Title>}
			sections={[
				{ label: 'Active', value: active ? 'Yes' : 'No' },
				<div key="recipient" {...styles.recipient()}>
					<div {...styles.recipientHeader()}>
						<span>Fee recipient</span>
						<CopyButton
							value={validator.feeRecipient}
							ariaLabel="Copy fee recipient"
						/>
					</div>
					<Link
						to="/address/$address"
						params={{ address: validator.feeRecipient }}
						search={{ tab: 'holdings' }}
						{...cx(styles.recipientLink(), linkHover())}
					>
						{validator.feeRecipient}
					</Link>
				</div>,
				{
					label: <span {...styles.normalCase()}>Added at height</span>,
					value: (
						<Link
							to="/block/$id"
							params={{ id: validator.addedAtHeight.toString() }}
							{...cx(styles.height(), linkHover())}
						>
							{validator.addedAtHeight.toString()}
						</Link>
					),
				},
				...(!active
					? [
							{
								label: (
									<span {...styles.normalCase()}>Deactivated at height</span>
								),
								value: (
									<Link
										to="/block/$id"
										params={{ id: validator.deactivatedAtHeight.toString() }}
										{...cx(styles.height(), linkHover())}
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

namespace styles {
	export const card = style({ width: '100% !custom' })

	export const recipient = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '8',
		minWidth: '0 !custom',
	})

	export const recipientHeader = style({
		alignItems: 'center',
		color: 'content.secondary',
		display: 'flex',
		gap: '8',
	})

	export const recipientLink = style({
		color: 'content.primary',
		maxWidth: '32ch !custom',
		typography: 'mono.inline',
		wordBreak: 'break-all',
	})

	export const normalCase = style({ textTransform: 'none' })

	export const height = style({ wordBreak: 'break-all' })
}
