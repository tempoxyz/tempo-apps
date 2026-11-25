import type * as OxAddress from 'ox/Address'
import * as Hex from 'ox/Hex'
import * as React from 'react'
import type { TransactionReceipt } from 'viem'
import { Address } from '#comps/Address'
import { InfoRow } from '#comps/InfoRow'
import { Midcut } from '#comps/Midcut'
import { cx } from '#lib/css'
import { parseConfigUpdates } from '#lib/domain/configurable-account'
import * as TempoGas from '#lib/domain/tempo-gas'
import * as TempoSignature from '#lib/domain/tempo-signature'
import * as TempoTransaction from '#lib/domain/tempo-transaction'

const fmt = (value: number | bigint) => value.toLocaleString('en-US')

/** Everything the signature view shows, from the raw transaction and receipt. */
export function useTxSignatures(props: {
	raw: Hex.Hex | undefined
	receipt: TransactionReceipt
	senderWasEmpty: boolean | undefined
}) {
	const { raw, receipt, senderWasEmpty } = props
	return React.useMemo(() => {
		if (!raw || !TempoTransaction.isTempoTransaction(raw)) return undefined
		try {
			const tx = TempoTransaction.decode(raw)
			const sender = receipt.from
			const resolved = TempoTransaction.resolveSignatures(tx, sender)
			const registered = parseConfigUpdates(
				receipt.logs.map((log) => ({ ...log, topics: log.topics })),
			).some(
				(update) =>
					update.kind === 'registered' &&
					update.account.toLowerCase() === sender.toLowerCase(),
			)
			const gas = TempoGas.intrinsicGas({
				tx,
				sender,
				registered,
				senderWasEmpty: senderWasEmpty ?? false,
			})
			return { tx, resolved, gas, registered }
		} catch (error) {
			return { error: error instanceof Error ? error.message : String(error) }
		}
	}, [raw, receipt, senderWasEmpty])
}

export function TxSignatures(props: TxSignatures.Props): React.JSX.Element {
	const { data, receipt, loading } = props
	if (loading)
		return <p className="px-[18px] py-[12px] copy-14 text-tertiary">Loading signatures…</p>
	if (!data)
		return (
			<p className="px-[18px] py-[12px] copy-14 text-tertiary">
				Not a Tempo transaction, or its raw bytes are unavailable.
			</p>
		)
	if ('error' in data)
		return (
			<p className="px-[18px] py-[12px] copy-14 text-negative">
				Could not decode the transaction: {data.error}
			</p>
		)
	const { tx, resolved, gas } = data
	const outer = resolved.outer
	return (
		<div className="flex flex-col">
			<InfoRow label="Sender signature" stackOnMobile>
				<div className="flex flex-col gap-[10px]">
					<SignatureHeading signature={outer} />
					{resolved.signer && (
						<SignerLine signer={resolved.signer} sender={receipt.from} />
					)}
					{outer.type === 'keychain' && (
						<Fields>
							<Field label="Access key envelope">
								{outer.version === 1 ? 'Keychain V1 (0x03)' : 'Keychain V2 (0x04)'}
							</Field>
							<Field label="User account">
								<Address address={outer.userAddress} />
							</Field>
							<Field label="Inner signature">
								{TempoSignature.SIGNATURE_LABELS[outer.inner.type]},{' '}
								{fmt(outer.inner.size)} bytes
							</Field>
						</Fields>
					)}
					{outer.type === 'unknown' && (
						<p className="text-negative">{outer.error}</p>
					)}
				</div>
			</InfoRow>
			{resolved.configurable && (
				<ConfigurableRows configurable={resolved.configurable} />
			)}
			<InfoRow label="Fee payer signature" stackOnMobile>
				{tx.feePayerSignature && resolved.feePayer ? (
					<div className="flex flex-col gap-[6px]">
						<span className="text-primary">
							secp256k1 · {fmt(tx.feePayerSignature.size)} bytes (RLP [v, r, s])
						</span>
						<SignerLine signer={resolved.feePayer} />
					</div>
				) : (
					<span className="text-secondary">
						None: the sender pays its own fee
					</span>
				)}
			</InfoRow>
			<GasRows gas={gas} gasUsed={receipt.gasUsed} />
		</div>
	)
}

export declare namespace TxSignatures {
	type Data = ReturnType<typeof useTxSignatures>
	type Props = {
		data: Data
		receipt: TransactionReceipt
		loading?: boolean | undefined
	}
}

function SignatureHeading(props: {
	signature: TempoSignature.TempoSignature
}): React.JSX.Element {
	const { signature } = props
	const typeByte =
		signature.type === 'secp256k1'
			? 'no type byte'
			: `type 0x${Hex.toNumber(Hex.slice(signature.raw, 0, 1)).toString(16).padStart(2, '0')}`
	return (
		<div className="flex flex-wrap items-center gap-[8px]">
			<TypeBadge type={signature.type} />
			<span className="text-secondary tabular-nums">
				{fmt(signature.size)} bytes · {typeByte}
			</span>
		</div>
	)
}

function TypeBadge(props: {
	type: TempoSignature.TempoSignature['type']
}): React.JSX.Element {
	const quantum = props.type === 'slhDsa'
	return (
		<span
			className={cx(
				'inline-flex items-center rounded-button px-[8px] py-[2px] label-12',
				quantum
					? 'bg-base-content-positive/15 text-base-content-positive'
					: props.type === 'unknown'
						? 'bg-negative/15 text-negative'
						: 'bg-accent/10 text-accent',
			)}
		>
			{TempoSignature.SIGNATURE_LABELS[props.type]}
			{quantum ? ' · post-quantum' : ''}
		</span>
	)
}

const STATUS_LABELS: Record<TempoSignature.SignerStatus, string> = {
	verified: 'signature verified here',
	recovered: 'recovered from the signature',
	derived: 'derived from the public key (not verified here)',
	invalid: 'signature does not verify',
}

function SignerLine(props: {
	signer: TempoSignature.ResolvedSigner
	sender?: OxAddress.Address | undefined
}): React.JSX.Element {
	const { signer } = props
	return (
		<span className="flex flex-wrap items-center gap-x-[8px] gap-y-[2px]">
			<span className="text-tertiary">Signer</span>
			{signer.address ? (
				<Address address={signer.address} />
			) : (
				<span className="text-secondary">unknown</span>
			)}
			<span
				className={cx(
					'label-12',
					signer.status === 'invalid' ? 'text-negative' : 'text-tertiary',
				)}
			>
				{STATUS_LABELS[signer.status]}
			</span>
		</span>
	)
}

function Fields(props: { children: React.ReactNode }): React.JSX.Element {
	return (
		<dl className="flex flex-col gap-[8px] border-l border-base-border pl-[10px]">
			{props.children}
		</dl>
	)
}

function Field(props: {
	label: string
	children: React.ReactNode
}): React.JSX.Element {
	return (
		<div className="grid grid-cols-1 gap-[2px]">
			<dt className="label-12 text-tertiary">{props.label}</dt>
			<dd className="min-w-0 break-all text-primary">{props.children}</dd>
		</div>
	)
}

function HexValue(props: { value: Hex.Hex }): React.JSX.Element {
	return (
		<span className="font-mono label-12 text-primary" title={props.value}>
			<Midcut value={props.value} prefix="0x" min={8} />
		</span>
	)
}

function ConfigurableRows(props: {
	configurable: NonNullable<TempoTransaction.ResolvedSignatures['configurable']>
}): React.JSX.Element {
	const { configurable } = props
	const { signature, approvals } = configurable
	const { config } = signature
	const approvedBy = new Set(
		approvals
			.map((approval) => approval.signer.address?.toLowerCase())
			.filter(Boolean),
	)
	return (
		<>
			<InfoRow label="Configurable account" stackOnMobile>
				<div className="flex flex-col gap-[10px]">
					<Address address={signature.account} />
					<Fields>
						<Field label="Config version">{fmt(config.version)}</Field>
						<Field label="Threshold">
							{config.threshold} of {fmt(config.owners.reduce((sum, o) => sum + o.weight, 0))}{' '}
							weight · approvals here: {configurable.weight}
						</Field>
						<Field label={`Owners (${config.owners.length})`}>
							<ul className="flex flex-col gap-[4px]">
								{config.owners.map((owner) => {
									const approval = approvals.find(
										(a) =>
											a.signer.address?.toLowerCase() ===
											owner.owner.toLowerCase(),
									)
									return (
										<li
											key={owner.owner}
											className="flex flex-wrap items-center gap-x-[8px]"
										>
											<Address address={owner.owner} />
											<span className="label-12 text-tertiary">
												weight {owner.weight}
											</span>
											{approvedBy.has(owner.owner.toLowerCase()) && approval && (
												<span className="label-12 text-base-content-positive">
													signed ({TempoSignature.SIGNATURE_LABELS[approval.signature.type]})
												</span>
											)}
										</li>
									)
								})}
							</ul>
						</Field>
						<Field label="Approval digest">
							<HexValue value={configurable.digest} />
						</Field>
					</Fields>
				</div>
			</InfoRow>
			{approvals.map((approval) => (
				<InfoRow
					key={approval.index}
					label={`Approval ${approval.index + 1}`}
					stackOnMobile
				>
					<Approval approval={approval} />
				</InfoRow>
			))}
		</>
	)
}

function Approval(props: {
	approval: TempoTransaction.ResolvedApproval
}): React.JSX.Element {
	const { approval } = props
	const { signature } = approval
	const verify = TempoGas.primitiveVerifyGas(signature)
	const data = TempoGas.primitiveDataGas(signature)
	return (
		<div className="flex flex-col gap-[10px]">
			<SignatureHeading signature={signature} />
			<SignerLine signer={approval.signer} />
			{approval.weight === undefined && (
				<span className="label-12 text-negative">
					Signer is not an owner in the signed config
				</span>
			)}
			<Fields>
				<Field label="Gas">
					<span className="tabular-nums">
						{fmt(verify + data)} = {fmt(verify)} verification
						{data ? ` + ${fmt(data)} signature bytes` : ''}
					</span>
				</Field>
				{signature.type === 'slhDsa' && <SlhDsaFields signature={signature} />}
				{signature.type === 'webAuthn' && (
					<>
						<Field label="Passkey public key (P256)">
							<span className="flex flex-col">
								<HexValue value={signature.x} />
								<HexValue value={signature.y} />
							</span>
						</Field>
						<Field label="WebAuthn data">
							{fmt(Hex.size(signature.authenticatorData))} B authenticator data +{' '}
							{fmt(signature.clientDataJSON.length)} B clientDataJSON
						</Field>
					</>
				)}
				{signature.type === 'p256' && (
					<Field label="Public key (P256)">
						<span className="flex flex-col">
							<HexValue value={signature.x} />
							<HexValue value={signature.y} />
						</span>
					</Field>
				)}
			</Fields>
		</div>
	)
}

const GROUP_STYLES = {
	randomizer: 'bg-warning',
	fors: 'bg-accent',
	hypertree: 'bg-viz-base',
} as const

function SlhDsaFields(props: {
	signature: TempoSignature.SlhDsaSignature
}): React.JSX.Element {
	const { signature } = props
	const paramSet = signature.paramSet
	return (
		<>
			<Field label="Parameter set">
				{paramSet
					? `${paramSet.name} (${paramSet.standard}), param_id 0x${signature.paramId.toString(16).padStart(2, '0')}`
					: `Unknown param_id 0x${signature.paramId.toString(16)}`}
			</Field>
			<Field label="Public key (PK.seed || PK.root, 32 B)">
				<span className="flex flex-col">
					<HexValue value={Hex.slice(signature.publicKey, 0, 16)} />
					<HexValue value={Hex.slice(signature.publicKey, 16, 32)} />
				</span>
			</Field>
			{paramSet && (
				<Field label={`Signature, ${fmt(Hex.size(signature.signature))} B`}>
					<SlhDsaStructure paramSet={paramSet} />
				</Field>
			)}
			<Field label="Size">
				<SizeComparison size={signature.size} />
			</Field>
		</>
	)
}

function SlhDsaStructure(props: {
	paramSet: TempoSignature.SlhDsaParamSet
}): React.JSX.Element {
	const segments = TempoSignature.slhDsaLayout(props.paramSet)
	const total = props.paramSet.signatureBytes
	const [hovered, setHovered] = React.useState<string | undefined>()
	const active = segments.find((segment) => segment.key === hovered)
	const groups = [
		{
			group: 'randomizer' as const,
			label: 'R',
			size: props.paramSet.n,
			detail: 'randomizer',
		},
		{
			group: 'fors' as const,
			label: `FORS, ${props.paramSet.forsTrees} trees`,
			size: segments.filter((s) => s.group === 'fors').reduce((a, s) => a + s.size, 0),
			detail: `each ${props.paramSet.n} B secret key + ${props.paramSet.forsHeight} × ${props.paramSet.n} B auth path`,
		},
		{
			group: 'hypertree' as const,
			label: `Hypertree, ${props.paramSet.layers} layers`,
			size: segments
				.filter((s) => s.group === 'hypertree')
				.reduce((a, s) => a + s.size, 0),
			detail: `each WOTS+ ${props.paramSet.wotsChains} × ${props.paramSet.n} B + ${props.paramSet.layerHeight} × ${props.paramSet.n} B auth path`,
		},
	]
	return (
		<div className="flex flex-col gap-[8px]">
			<div
				className="flex h-[22px] w-full overflow-hidden rounded-[4px] gap-px bg-base-border"
				role="img"
				aria-label="SLH-DSA signature layout"
				onMouseLeave={() => setHovered(undefined)}
			>
				{segments.map((segment) => (
					<div
						key={segment.key}
						title={`${segment.label}: ${fmt(segment.size)} B at offset ${fmt(segment.offset)}`}
						onMouseEnter={() => setHovered(segment.key)}
						className={cx(
							GROUP_STYLES[segment.group],
							'h-full',
							hovered && hovered !== segment.key && 'opacity-50',
						)}
						style={{
							flexGrow: segment.size,
							flexBasis: 0,
							minWidth: segment.group === 'randomizer' ? 3 : 1,
						}}
					/>
				))}
			</div>
			<span className="label-12 text-tertiary min-h-[16px]">
				{active
					? `${active.label}: ${fmt(active.size)} B at offset ${fmt(active.offset)} (${active.parts.map((p) => `${p.label}`).join(' + ')})`
					: 'Hover a segment for its offset and parts'}
			</span>
			<ul className="flex flex-col gap-[4px]">
				{groups.map((group) => (
					<li key={group.group} className="flex items-start gap-[8px]">
						<span
							className={cx(
								GROUP_STYLES[group.group],
								'mt-[4px] size-[10px] shrink-0 rounded-[2px]',
							)}
						/>
						<span>
							<span className="text-primary tabular-nums">
								{group.label}: {fmt(group.size)} B
							</span>{' '}
							<span className="text-tertiary">
								({((group.size / total) * 100).toFixed(1)}%, {group.detail})
							</span>
						</span>
					</li>
				))}
			</ul>
		</div>
	)
}

function SizeComparison(props: { size: number }): React.JSX.Element {
	const rows = [
		{ label: 'secp256k1', size: TempoSignature.SECP256K1_SIGNATURE_BYTES },
		{ label: 'P256 (0x01)', size: TempoSignature.P256_SIGNATURE_BYTES },
		{ label: 'SLH-DSA approval (0x06)', size: props.size },
	]
	const max = Math.max(...rows.map((row) => row.size))
	return (
		<div className="flex flex-col gap-[4px]">
			{rows.map((row) => (
				<div key={row.label} className="grid grid-cols-[150px_1fr] items-center gap-[8px]">
					<span className="label-12 text-secondary tabular-nums">
						{row.label} {fmt(row.size)} B
					</span>
					<div className="h-[8px] rounded-[2px] bg-base-alt">
						<div
							className="h-full rounded-[2px] bg-accent"
							style={{ width: `${Math.max(0.5, (row.size / max) * 100)}%` }}
						/>
					</div>
				</div>
			))}
			<span className="label-12 text-tertiary">
				{(props.size / TempoSignature.P256_SIGNATURE_BYTES).toFixed(1)}× the
				bytes of an encoded P256 signature
			</span>
		</div>
	)
}

function GasRows(props: {
	gas: TempoGas.GasBreakdown
	gasUsed: bigint
}): React.JSX.Element {
	const { gas, gasUsed } = props
	const used = Number(gasUsed)
	const execution = used - gas.intrinsic
	return (
		<InfoRow label="Gas" stackOnMobile>
			<div className="flex flex-col gap-[6px]">
				<table className="w-full label-12">
					<tbody>
						{gas.items.map((item) => (
							<tr key={item.key} className="align-top">
								<td className="py-[3px] pr-[12px] text-secondary whitespace-nowrap">
									{item.label}
								</td>
								<td className="py-[3px] pr-[12px] text-right text-primary tabular-nums whitespace-nowrap">
									{fmt(item.gas)}
								</td>
								<td className="py-[3px] text-tertiary">{item.detail}</td>
							</tr>
						))}
						<tr className="align-top border-t border-base-border">
							<td className="py-[3px] pr-[12px] text-primary">Intrinsic</td>
							<td className="py-[3px] pr-[12px] text-right text-primary tabular-nums">
								{fmt(gas.intrinsic)}
							</td>
							<td className="py-[3px] text-tertiary">
								Charged before any call runs
							</td>
						</tr>
						<tr className="align-top">
							<td className="py-[3px] pr-[12px] text-secondary">Execution</td>
							<td className="py-[3px] pr-[12px] text-right text-primary tabular-nums">
								{fmt(execution)}
							</td>
							<td className="py-[3px] text-tertiary">
								Gas used less intrinsic: the calls, after refunds
							</td>
						</tr>
						<tr className="align-top border-t border-base-border">
							<td className="py-[3px] pr-[12px] text-primary">Gas used</td>
							<td className="py-[3px] pr-[12px] text-right text-primary tabular-nums">
								{fmt(used)}
							</td>
							<td className="py-[3px] text-tertiary">From the receipt</td>
						</tr>
					</tbody>
				</table>
				{used < gas.floor && (
					<span className="label-12 text-warning">
						Gas used is below the calldata floor ({fmt(gas.floor)}): the
						breakdown may be missing a part.
					</span>
				)}
				{gas.unpriced.length > 0 && (
					<span className="label-12 text-tertiary">
						Not priced here: {gas.unpriced.join(', ')}; execution includes them.
					</span>
				)}
			</div>
		</InfoRow>
	)
}
