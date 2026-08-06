import { Link } from '@tanstack/react-router'
import * as React from 'react'
import type { Hex } from 'viem'
import { cx } from '#lib/css'
import { getContractInfo } from '#lib/domain/contracts'
import {
	decodeStorageChange,
	extractCandidateAddresses,
	type DecodedStorageChange,
	type StorageDecodeContext,
} from '#lib/domain/storage-decode'
import { useCopy } from '#lib/hooks'
import type { CallTrace, PrestateDiff } from '#lib/queries'
import CopyIcon from '~icons/lucide/copy'
import WrapIcon from '~icons/lucide/corner-down-left'

export function TxStateDiff(props: TxStateDiff.Props) {
	const {
		prestate,
		trace,
		receipt,
		logs,
		tokenMetadata,
		label = 'State Changes',
	} = props
	const [wrap, setWrap] = React.useState(true)
	const [raw, setRaw] = React.useState(false)
	const copy = useCopy()

	const candidateAddresses = React.useMemo(() => {
		const fromTrace = extractCandidateAddresses(
			trace ?? null,
			receipt ?? { from: '0x' as Hex, to: null },
			logs,
		)
		// Also include addresses from prestate diff (tokens, contracts with state changes)
		const fromPrestate = prestate
			? ([...Object.keys(prestate.pre), ...Object.keys(prestate.post)] as Hex[])
			: []
		return [
			...new Set([...fromTrace, ...fromPrestate.map((a) => a.toLowerCase())]),
		] as Hex[]
	}, [trace, receipt, logs, prestate])

	const data = React.useMemo(() => {
		if (!prestate) return null
		return TxStateDiff.buildData(prestate, candidateAddresses, tokenMetadata, {
			omitNonceOnlyFor: props.omitSenderNonceFor,
		})
	}, [prestate, candidateAddresses, tokenMetadata, props.omitSenderNonceFor])

	const hasData = data && data.accounts.length > 0

	return (
		<div className="flex flex-col">
			<div className="flex items-center justify-between pl-[16px] pr-[12px] h-[40px] border-y border-dashed border-distinct">
				<span className="text-[13px]">
					{label && (
						<>
							<span className="text-tertiary">{label} </span>
							{hasData && <RawToggle raw={raw} onToggle={() => setRaw(!raw)} />}
						</>
					)}
				</span>
				{hasData && (
					<div className="flex items-center gap-[8px] text-tertiary">
						{copy.notifying && (
							<span className="text-[11px] select-none">copied</span>
						)}
						{!label && <RawToggle raw={raw} onToggle={() => setRaw(!raw)} />}
						<button
							type="button"
							className="press-down cursor-pointer hover:text-secondary p-[4px]"
							onClick={() => copy.copy(TxStateDiff.toAscii(data, { raw }))}
							title="Copy state changes"
						>
							<CopyIcon className="size-[14px]" />
						</button>
						<button
							type="button"
							onClick={() => setWrap(!wrap)}
							className="press-down cursor-pointer hover:text-secondary p-[4px]"
							title={wrap ? 'Disable line wrap' : 'Enable line wrap'}
						>
							<WrapIcon className={cx('size-[14px]', wrap && 'text-primary')} />
						</button>
					</div>
				)}
			</div>
			{!prestate || !data ? (
				<div className="px-[18px] py-[24px] text-[13px] text-tertiary text-center">
					No state diff available.
				</div>
			) : data.accounts.length === 0 ? (
				<div className="px-[18px] py-[24px] text-[13px] text-tertiary text-center">
					No state changes.
				</div>
			) : (
				<div className="flex flex-col">
					{data.accounts.map((account) => (
						<TxStateDiff.AccountView
							key={account.address}
							account={account}
							wrap={wrap}
							raw={raw}
						/>
					))}
				</div>
			)}
		</div>
	)
}

function RawToggle(props: {
	raw: boolean
	onToggle: () => void
}): React.JSX.Element {
	return (
		<button
			type="button"
			onClick={props.onToggle}
			className="text-[13px] text-accent hover:underline cursor-pointer press-down"
		>
			{props.raw ? '(raw)' : '(decoded)'}
		</button>
	)
}

export namespace TxStateDiff {
	export interface Props {
		prestate: PrestateDiff | null
		trace?: CallTrace | null
		receipt?: { from: Hex; to: Hex | null }
		logs?: Array<{ address: Hex; topics?: Hex[] }>
		tokenMetadata?: Record<string, { symbol?: string; decimals?: number }>
		/** Header label. Pass `null` when an enclosing section already names it. */
		label?: string | null | undefined
		/**
		 * Drop this account's nonce-only change. Simulations run through the
		 * transaction path, so the caller's nonce ticks even on a `view` call.
		 */
		omitSenderNonceFor?: Hex | undefined
	}

	export interface Data {
		accounts: AccountData[]
	}

	export interface StorageChangeData {
		slot: string
		before: string
		after: string
		decoded?: DecodedStorageChange
	}

	export interface AccountData {
		address: Hex
		contractName?: string
		nonceChange?: { before: number; after: number }
		storageChanges: StorageChangeData[]
	}

	export function buildData(
		prestate: PrestateDiff,
		candidateAddresses: Hex[] = [],
		tokenMetadata?: Record<string, { symbol?: string; decimals?: number }>,
		options?: {
			/**
			 * Sender whose nonce-only change should be dropped. `debug_traceCall`
			 * runs the call down the transaction path, so the caller's nonce ticks
			 * even for a pure `view` — that is the harness, not the contract, and
			 * reporting it makes a read look state-mutating.
			 */
			omitNonceOnlyFor?: Hex | undefined
		},
	): Data {
		const omitNonceOnlyFor = options?.omitNonceOnlyFor?.toLowerCase()
		const addresses = Array.from(
			new Set([...Object.keys(prestate.pre), ...Object.keys(prestate.post)]),
		).sort() as Hex[]

		const accounts: AccountData[] = []

		for (const address of addresses) {
			const pre = prestate.pre[address]
			const post = prestate.post[address]

			const contractInfo = getContractInfo(address)
			const tokenMeta = tokenMetadata?.[address.toLowerCase()]

			const ctx: StorageDecodeContext = {
				account: address,
				contractInfo,
				candidateAddresses,
				token: tokenMeta,
				allTokenMetadata: tokenMetadata,
			}

			const nonceChanged =
				pre?.nonce !== post?.nonce &&
				(pre?.nonce !== undefined || post?.nonce !== undefined)

			const storageSlots = Array.from(
				new Set([
					...Object.keys(pre?.storage ?? {}),
					...Object.keys(post?.storage ?? {}),
				]),
			).sort() as Hex[]

			const storageChanges: StorageChangeData[] = storageSlots
				.filter((slot) => pre?.storage?.[slot] !== post?.storage?.[slot])
				.map((slot) => {
					const change = {
						slot,
						before: (pre?.storage?.[slot] ?? '0x0') as Hex,
						after: (post?.storage?.[slot] ?? '0x0') as Hex,
					}
					const decoded = decodeStorageChange(change, ctx)
					return {
						slot,
						before: change.before,
						after: change.after,
						decoded: decoded ?? undefined,
					}
				})

			const hasChanges = nonceChanged || storageChanges.length > 0
			if (!hasChanges) continue

			const senderNonceOnly =
				nonceChanged &&
				storageChanges.length === 0 &&
				address.toLowerCase() === omitNonceOnlyFor
			if (senderNonceOnly) continue

			accounts.push({
				address,
				contractName: contractInfo?.name,
				nonceChange: nonceChanged
					? { before: pre?.nonce ?? 0, after: post?.nonce ?? 0 }
					: undefined,
				storageChanges,
			})
		}

		return { accounts }
	}

	export function AccountView(props: AccountView.Props) {
		const { account, wrap, raw } = props
		const { address, contractName, nonceChange, storageChanges } = account

		return (
			<div className="flex flex-col">
				<div className="flex items-center gap-[8px] px-[16px] py-[12px]">
					<Link
						to="/address/$address"
						params={{ address }}
						className="text-accent hover:underline font-mono text-[12px] press-down"
					>
						{contractName ? `${contractName} (${address})` : address}
					</Link>
					<span className="text-[11px] text-tertiary ml-auto">
						{nonceChange && 'nonce'}
						{nonceChange && storageChanges.length > 0 && ' + '}
						{storageChanges.length > 0 &&
							`${storageChanges.length} slot${storageChanges.length > 1 ? 's' : ''}`}
					</span>
				</div>

				<div className="px-[16px] pb-[12px] overflow-x-auto">
					<div
						className={cx(
							'bg-distinct border border-card-border rounded-[6px] overflow-hidden text-[12px] font-mono grid',
							wrap
								? 'grid-cols-3'
								: 'grid-cols-[auto_auto_auto] w-fit min-w-full',
						)}
					>
						<div className="px-[12px] py-[8px] font-medium text-tertiary">
							Slot
						</div>
						<div className="px-[12px] py-[8px] font-medium text-tertiary">
							Before
						</div>
						<div className="px-[12px] py-[8px] font-medium text-tertiary">
							After
						</div>
						{nonceChange && (
							<>
								<CopyCell
									value="nonce"
									className="text-secondary border-t border-card-border"
									wrap={wrap}
								/>
								<CopyCell
									value={String(nonceChange.before)}
									className="text-tertiary border-t border-card-border"
									wrap={wrap}
								/>
								<CopyCell
									value={String(nonceChange.after)}
									className="text-primary border-t border-card-border"
									wrap={wrap}
								/>
							</>
						)}
						{storageChanges.map((change) => {
							const decoded = !raw ? change.decoded : undefined
							return (
								<React.Fragment key={change.slot}>
									<CopyCell
										value={decoded?.slotLabel ?? change.slot}
										copyValue={change.slot}
										className="text-secondary border-t border-card-border"
										wrap={wrap}
										isDecoded={Boolean(decoded?.slotLabel)}
									/>
									<CopyCell
										value={decoded?.beforeDisplay ?? change.before}
										copyValue={decoded?.beforeRaw ?? change.before}
										className="text-tertiary border-t border-card-border"
										wrap={wrap}
										isDecoded={Boolean(decoded?.beforeDisplay)}
									/>
									<DiffCell
										value={decoded?.afterDisplay ?? change.after}
										copyValue={decoded?.afterRaw ?? change.after}
										diff={decoded?.diff}
										wrap={wrap}
										isDecoded={Boolean(decoded?.afterDisplay)}
									/>
								</React.Fragment>
							)
						})}
					</div>
				</div>
			</div>
		)
	}

	export namespace AccountView {
		export interface Props {
			account: AccountData
			wrap: boolean
			raw: boolean
		}
	}

	export function CopyCell(props: CopyCell.Props) {
		const { value, copyValue, className, wrap, isDecoded } = props
		const copy = useCopy()
		const valueToCopy = copyValue ?? value

		return (
			<button
				type="button"
				className={cx(
					'flex items-start text-left px-[12px] py-[8px] cursor-pointer hover:bg-base-alt/50 press-down relative group',
					wrap ? 'break-all' : 'whitespace-nowrap',
					className,
				)}
				onClick={() => copy.copy(valueToCopy)}
				title={isDecoded ? valueToCopy : undefined}
			>
				{value}
				{copy.notifying && (
					<div className="absolute bottom-[2px] right-[2px] bg-base-alt px-[8px] py-[2px] rounded text-secondary">
						<div className="translate-y-[-2px]">copied</div>
					</div>
				)}
			</button>
		)
	}

	export namespace CopyCell {
		export interface Props {
			value: string
			copyValue?: string
			className?: string
			wrap: boolean
			isDecoded?: boolean
		}
	}

	export function DiffCell(props: DiffCell.Props) {
		const { value, copyValue, diff, wrap, isDecoded } = props
		const copy = useCopy()
		const valueToCopy = copyValue ?? value

		return (
			<button
				type="button"
				className={cx(
					'flex flex-col items-start text-left px-[12px] py-[8px] cursor-pointer hover:bg-base-alt/50 press-down relative group border-t border-card-border',
					wrap ? 'break-all' : 'whitespace-nowrap',
				)}
				onClick={() => copy.copy(valueToCopy)}
				title={isDecoded ? valueToCopy : undefined}
			>
				<span className="text-primary">{value}</span>
				{diff && (
					<span
						className={cx(
							'text-[11px]',
							diff.isPositive ? 'text-positive' : 'text-negative',
						)}
					>
						{diff.display}
					</span>
				)}
				{copy.notifying && (
					<div className="absolute bottom-[2px] right-[2px] bg-base-alt px-[8px] py-[2px] rounded text-secondary">
						<div className="translate-y-[-2px]">copied</div>
					</div>
				)}
			</button>
		)
	}

	export namespace DiffCell {
		export interface Props {
			value: string
			copyValue?: string
			diff?: { display: string; isPositive: boolean }
			wrap: boolean
			isDecoded?: boolean
		}
	}

	export function toAscii(data: Data, options?: { raw?: boolean }): string {
		const raw = options?.raw ?? false
		const lines: string[] = []

		for (const account of data.accounts) {
			const addressDisplay = account.contractName
				? `${account.contractName} (${account.address})`
				: account.address

			lines.push(addressDisplay)

			if (account.nonceChange) {
				lines.push(
					`  nonce: ${account.nonceChange.before} => ${account.nonceChange.after}`,
				)
			}

			for (const change of account.storageChanges) {
				const decoded = !raw ? change.decoded : undefined
				const slotDisplay = decoded?.slotLabel ?? change.slot
				const beforeDisplay = decoded?.beforeDisplay ?? change.before
				const afterDisplay = decoded?.afterDisplay ?? change.after

				if (decoded) {
					lines.push(`  ${slotDisplay}: ${beforeDisplay} => ${afterDisplay}`)
					lines.push(`    (slot: ${change.slot})`)
				} else {
					lines.push(`  ${slotDisplay}:`)
					lines.push(`       ${beforeDisplay}`)
					lines.push(`    => ${afterDisplay}`)
				}
			}

			lines.push('')
		}

		return lines.join('\n').trim()
	}
}
