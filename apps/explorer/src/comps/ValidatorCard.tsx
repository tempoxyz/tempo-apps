import { Link } from '@tanstack/react-router'
import { Hex, style } from '@tempoxyz/ds'
import type * as React from 'react'
import type { Address } from 'viem'
import { Addresses } from 'viem/tempo'
import { useReadContract } from 'wagmi'
import { cx } from 'zyzz'
import { InfoCard } from '#comps/InfoCard'
import { Abis } from '#lib/abis'
import { useIsMounted } from '#lib/hooks'
import { link, linkHover } from '#styles/explorer'

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
				{
					label: <span {...styles.normalCase()}>Fee recipient</span>,
					value: (
						<Hex.Root value={validator.feeRecipient} {...styles.recipient()}>
							<Link
								to="/address/$address"
								params={{ address: validator.feeRecipient }}
								search={{ tab: 'holdings' }}
								{...cx(styles.recipientLink(), link(), linkHover())}
							>
								<Hex.Text />
							</Link>
							<Hex.Copy aria-label="Copy fee recipient" />
						</Hex.Root>
					),
				},
				{
					label: <span {...styles.normalCase()}>Added at height</span>,
					value: <BlockLink height={validator.addedAtHeight} />,
				},
				...(!active
					? [
							{
								label: (
									<span {...styles.normalCase()}>Deactivated at height</span>
								),
								value: <BlockLink height={validator.deactivatedAtHeight} />,
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

/** A block number, digits grouped, linking to the block. */
function BlockLink(props: { height: bigint }): React.JSX.Element {
	const id = props.height.toString()
	return (
		<Link to="/block/$id" params={{ id }} {...cx(link(), linkHover())}>
			{props.height.toLocaleString('en-US')}
		</Link>
	)
}

namespace styles {
	export const card = style({ width: '100% !custom' })

	export const recipient = style({ minWidth: '0 !custom' })

	// The link sits inside `Hex.Root`, so the value truncates to fit.
	export const recipientLink = style({
		display: 'inline-flex',
		maxWidth: '100% !custom',
		minWidth: '0 !custom',
	})

	export const normalCase = style({ textTransform: 'none' })
}
