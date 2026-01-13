import { Link } from '@tanstack/react-router'
import * as React from 'react'
import type { Hex } from 'viem'
import { cx } from '#lib/css'
import { getContractInfo } from '#lib/domain/contracts'
import { useCopy } from '#lib/hooks'
import type { PrestateDiff } from '#lib/queries'
import CopyIcon from '~icons/lucide/copy'
import WrapIcon from '~icons/lucide/corner-down-left'

export function TxStateDiff(props: TxStateDiff.Props) {
	const { prestate } = props
	const [wrap, setWrap] = React.useState(true)
	const copy = useCopy()

	const data = React.useMemo(() => {
		if (!prestate) return null
		return TxStateDiff.buildData(prestate)
	}, [prestate])

	const hasData = data && data.accounts.length > 0

	return (
		<div className="flex flex-col">
			<div className="flex items-center justify-between pl-[16px] pr-[12px] h-[40px] border-y border-dashed border-distinct">
				<span className="text-[13px] text-tertiary">State Changes</span>
				{hasData && (
					<div className="flex items-center gap-[8px] text-tertiary">
						{copy.notifying && (
							<span className="text-[11px] select-none">copied</span>
						)}
						<button
							type="button"
							className="press-down cursor-pointer hover:text-secondary p-[4px]"
							onClick={() => copy.copy(TxStateDiff.toAscii(data))}
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
						/>
					))}
				</div>
			)}
		</div>
	)
}

export namespace TxStateDiff {
	export interface Props {
		prestate: PrestateDiff | null
	}

	export interface Data {
		accounts: AccountData[]
	}

	export interface AccountData {
		address: Hex
		contractName?: string
		nonceChange?: { before: number; after: number }
		storageChanges: Array<{ slot: string; before: string; after: string }>
	}

	export function buildData(prestate: PrestateDiff): Data {
		const addresses = Array.from(
			new Set([...Object.keys(prestate.pre), ...Object.keys(prestate.post)]),
		).sort() as Hex[]

		const accounts: AccountData[] = []

		for (const address of addresses) {
			const pre = prestate.pre[address]
			const post = prestate.post[address]

			const contractInfo = getContractInfo(address)

			const nonceChanged =
				pre?.nonce !== post?.nonce &&
				(pre?.nonce !== undefined || post?.nonce !== undefined)

			const storageSlots = Array.from(
				new Set([
					...Object.keys(pre?.storage ?? {}),
					...Object.keys(post?.storage ?? {}),
				]),
			).sort() as Hex[]

			const storageChanges = storageSlots
				.filter((slot) => pre?.storage?.[slot] !== post?.storage?.[slot])
				.map((slot) => ({
					slot,
					before: pre?.storage?.[slot] ?? '0x0',
					after: post?.storage?.[slot] ?? '0x0',
				}))

			const hasChanges = nonceChanged || storageChanges.length > 0
			if (!hasChanges) continue

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
		const { account, wrap } = props
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
						{storageChanges.map((change) => (
							<React.Fragment key={change.slot}>
								<CopyCell
									value={change.slot}
									className="text-secondary border-t border-card-border"
									wrap={wrap}
								/>
								<CopyCell
									value={change.before}
									className="text-tertiary border-t border-card-border"
									wrap={wrap}
								/>
								<CopyCell
									value={change.after}
									className="text-primary border-t border-card-border"
									wrap={wrap}
								/>
							</React.Fragment>
						))}
					</div>
				</div>
			</div>
		)
	}

	export namespace AccountView {
		export interface Props {
			account: AccountData
			wrap: boolean
		}
	}

	export function CopyCell(props: CopyCell.Props) {
		const { value, className, wrap } = props
		const copy = useCopy()

		return (
			<button
				type="button"
				className={cx(
					'flex items-start text-left px-[12px] py-[8px] cursor-pointer hover:bg-base-alt/50 press-down relative',
					wrap ? 'break-all' : 'whitespace-nowrap',
					className,
				)}
				onClick={() => copy.copy(value)}
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
			className?: string
			wrap: boolean
		}
	}

	export function toAscii(data: Data): string {
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
				lines.push(`  ${change.slot}:`)
				lines.push(`       ${change.before}`)
				lines.push(`    => ${change.after}`)
			}

			lines.push('')
		}

		return lines.join('\n').trim()
	}
}
