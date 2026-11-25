import { Link } from '@tanstack/react-router'
import * as React from 'react'
import { Address } from '#comps/Address'
import { InfoRow } from '#comps/InfoRow'
import { Midcut } from '#comps/Midcut'
import { cx } from '#lib/css'
import {
	type ConfigurableAccountView,
	isClassical,
	OWNER_KIND_LABELS,
	type OwnerKind,
} from '#lib/domain/configurable-account'

const UPDATE_LABELS = {
	registered: 'Registered',
	updated: 'Config updated',
	upgraded: 'Upgraded from an EOA',
} as const

export function QuantumOnlyBadge(): React.JSX.Element {
	return (
		<span
			className="inline-flex items-center rounded-button px-[8px] py-[2px] label-12 bg-base-content-positive/15 text-base-content-positive"
			title="Every current owner is an SLH-DSA key"
		>
			Quantum-only
		</span>
	)
}

function KindBadge(props: { kind: OwnerKind | undefined }): React.JSX.Element {
	const { kind } = props
	if (!kind)
		return (
			<span
				className="label-12 text-tertiary"
				title="This owner has not signed a transaction the explorer has read"
			>
				key type unknown
			</span>
		)
	return (
		<span
			className={cx(
				'inline-flex items-center rounded-button px-[8px] py-[2px] label-12',
				isClassical(kind)
					? 'bg-accent/10 text-accent'
					: 'bg-base-content-positive/15 text-base-content-positive',
			)}
		>
			{OWNER_KIND_LABELS[kind]}
			{isClassical(kind) ? ' · classical' : ' · post-quantum'}
		</span>
	)
}

export function ConfigurableAccountOwners(
	props: ConfigurableAccountOwners.Props,
): React.JSX.Element {
	const { view } = props
	const { current, owners, history } = view
	const totalWeight = owners.reduce((sum, owner) => sum + owner.weight, 0)
	const classical = owners.filter(
		(owner) => owner.kind !== undefined && isClassical(owner.kind),
	)
	return (
		<div className="flex flex-col">
			<InfoRow label="Account type">
				<span className="flex flex-wrap items-center gap-[8px]">
					<span className="text-primary">Configurable account (TIP-1107)</span>
					{view.quantumOnly && <QuantumOnlyBadge />}
				</span>
			</InfoRow>
			<InfoRow label="Config version">
				<span className="text-primary tabular-nums">
					{current.version.toString()}
				</span>
			</InfoRow>
			<InfoRow label="Threshold">
				<span className="text-primary tabular-nums">
					{current.threshold} of {totalWeight} weight
				</span>
			</InfoRow>
			<InfoRow label={`Owners (${owners.length})`} stackOnMobile>
				<ul className="flex flex-col gap-[8px]">
					{owners.map((owner) => (
						<li
							key={owner.owner}
							className="flex flex-wrap items-center gap-x-[8px] gap-y-[4px]"
						>
							<Address address={owner.owner} />
							<span className="label-12 text-tertiary">
								weight {owner.weight}
							</span>
							<KindBadge kind={owner.kind} />
						</li>
					))}
				</ul>
			</InfoRow>
			<InfoRow label="Quantum safety" stackOnMobile>
				<span className="text-secondary">
					{view.quantumOnly
						? 'Every owner is an SLH-DSA key: no classical key can approve for this account.'
						: classical.length > 0
							? `${classical.length} classical owner${classical.length === 1 ? '' : 's'} can still approve alone or with others.`
							: 'Some owners have unknown key types.'}
				</span>
			</InfoRow>
			<InfoRow label={`History (${history.length})`} stackOnMobile>
				<ol className="flex flex-col gap-[10px]">
					{[...history].reverse().map((update) => (
						<li
							key={`${update.transactionHash}-${update.logIndex}`}
							className="flex flex-col gap-[2px]"
						>
							<span className="flex flex-wrap items-center gap-x-[8px]">
								<span className="text-primary">
									{UPDATE_LABELS[update.kind]}: version{' '}
									{update.version.toString()}
								</span>
								<span className="label-12 text-tertiary">
									block {update.blockNumber.toString()}
								</span>
							</span>
							<span className="label-12 text-secondary">
								threshold {update.threshold}, owners{' '}
								{update.owners
									.map(
										(owner) =>
											`${owner.owner.slice(0, 8)}…${owner.owner.slice(-4)}`,
									)
									.join(', ')}
							</span>
							<Link
								to="/tx/$hash"
								params={{ hash: update.transactionHash }}
								search={{ tab: 'signatures' }}
								className="label-12 text-accent press-down font-mono w-fit"
							>
								<Midcut value={update.transactionHash} prefix="0x" min={6} />
							</Link>
						</li>
					))}
				</ol>
			</InfoRow>
		</div>
	)
}

export declare namespace ConfigurableAccountOwners {
	type Props = { view: ConfigurableAccountView }
}
