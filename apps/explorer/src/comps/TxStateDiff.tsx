import { Link } from '@tanstack/react-router'
import { style } from '@tempoxyz/ds/platform'
import * as React from 'react'
import type { Hex } from 'viem'
import { cx } from 'zyzz'
import { getContractInfo } from '#lib/domain/contracts'
import {
	decodeStorageChange,
	extractCandidateAddresses,
	type DecodedStorageChange,
	type StorageDecodeContext,
} from '#lib/domain/storage-decode'
import { useCopy } from '#lib/hooks'
import { PanelToolbar, SegmentedControl } from './PanelToolbar'
import type { CallTrace, PrestateDiff } from '#lib/queries'
import { link, linkHover, pressDown, truncate } from '#styles/explorer'
import CheckIcon from '~icons/lucide/check'
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
		<div {...styles.root()}>
			{/* With a label this is a section header on the transaction page. Without
			    one — the simulator, where the tab already names the panel — it is the
			    same toolbar the trace uses, so the two panels are visibly siblings
			    instead of an empty band with a stray `(decoded)` link in it. */}
			{label === null ? (
				hasData &&
				data && (
					<PanelToolbar
						summary={`${data.accounts.length} account${data.accounts.length === 1 ? '' : 's'} changed`}
					>
						<PanelToolbar.IconButton
							onClick={() => setWrap(!wrap)}
							active={wrap}
							title={wrap ? 'Disable line wrap' : 'Enable line wrap'}
						>
							<WrapIcon />
						</PanelToolbar.IconButton>
						<PanelToolbar.IconButton
							onClick={() => copy.copy(TxStateDiff.toAscii(data, { raw }))}
							title="Copy state changes"
						>
							{copy.notifying ? <CheckIcon /> : <CopyIcon />}
						</PanelToolbar.IconButton>
						<SegmentedControl
							size="sm"
							value={raw ? 'raw' : 'decoded'}
							options={[
								{ value: 'decoded', label: 'Decoded' },
								{ value: 'raw', label: 'Raw' },
							]}
							onChange={(value) => setRaw(value === 'raw')}
						/>
					</PanelToolbar>
				)
			) : (
				<div {...styles.header()}>
					<span {...styles.headerLabel()}>
						{label && (
							<>
								<span {...styles.tertiary()}>{label} </span>
								{hasData && (
									<RawToggle raw={raw} onToggle={() => setRaw(!raw)} />
								)}
							</>
						)}
					</span>
					{hasData && (
						<div {...styles.headerActions()}>
							{copy.notifying && <span {...styles.copied()}>copied</span>}
							<PanelToolbar.IconButton
								onClick={() => copy.copy(TxStateDiff.toAscii(data, { raw }))}
								title="Copy state changes"
							>
								<CopyIcon />
							</PanelToolbar.IconButton>
							<PanelToolbar.IconButton
								onClick={() => setWrap(!wrap)}
								active={wrap}
								title={wrap ? 'Disable line wrap' : 'Enable line wrap'}
							>
								<WrapIcon />
							</PanelToolbar.IconButton>
						</div>
					)}
				</div>
			)}
			{!prestate || !data ? (
				<div {...styles.empty()}>No state diff available.</div>
			) : data.accounts.length === 0 ? (
				<div {...styles.empty()}>No state changes.</div>
			) : (
				<div {...styles.root()}>
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
			{...cx(styles.rawToggle(), link(), linkHover(), pressDown())}
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
			<div {...styles.root()}>
				<div {...styles.accountHeader()}>
					<Link
						to="/address/$address"
						params={{ address }}
						{...cx(
							styles.accountLink(),
							truncate(),
							link(),
							linkHover(),
							pressDown(),
						)}
					>
						{contractName ? `${contractName} (${address})` : address}
					</Link>
					<span {...styles.accountCount()}>
						{nonceChange && 'nonce'}
						{nonceChange && storageChanges.length > 0 && ' + '}
						{storageChanges.length > 0 &&
							`${storageChanges.length} slot${storageChanges.length > 1 ? 's' : ''}`}
					</span>
				</div>

				<div {...styles.gridScroll()}>
					<div
						{...cx(
							styles.grid(),
							wrap && styles.gridWrap(),
							!wrap && styles.gridNoWrap(),
						)}
					>
						<div {...styles.gridHead()}>Slot</div>
						<div {...styles.gridHead()}>Before</div>
						<div {...styles.gridHead()}>After</div>
						{nonceChange && (
							<>
								<CopyCell
									value="nonce"
									className={styles.cellSlot().className}
									wrap={wrap}
								/>
								<CopyCell
									value={String(nonceChange.before)}
									className={styles.cellBefore().className}
									wrap={wrap}
								/>
								<CopyCell
									value={String(nonceChange.after)}
									className={styles.cellAfter().className}
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
										className={styles.cellSlot().className}
										wrap={wrap}
										isDecoded={Boolean(decoded?.slotLabel)}
									/>
									<CopyCell
										value={decoded?.beforeDisplay ?? change.before}
										copyValue={decoded?.beforeRaw ?? change.before}
										className={styles.cellBefore().className}
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
				{...cx(
					styles.cell({ className }),
					pressDown(),
					wrap && styles.breakAll(),
					!wrap && styles.nowrap(),
				)}
				onClick={() => copy.copy(valueToCopy)}
				title={isDecoded ? valueToCopy : undefined}
			>
				{value}
				{copy.notifying && (
					<div {...styles.copiedBadge()}>
						<div {...styles.copiedBadgeText()}>copied</div>
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
				{...cx(
					styles.cell(),
					styles.diffCell(),
					pressDown(),
					wrap && styles.breakAll(),
					!wrap && styles.nowrap(),
				)}
				onClick={() => copy.copy(valueToCopy)}
				title={isDecoded ? valueToCopy : undefined}
			>
				<span {...styles.primary()}>{value}</span>
				{/* A balance going down is not a failure, so it does not get failure
				    red. Green marks an increase; a decrease is just a value. This is
				    the same pairing the simulator's balance table uses. */}
				{diff && (
					<span
						{...cx(styles.diff(), diff.isPositive && styles.diffPositive())}
					>
						{diff.display}
					</span>
				)}
				{copy.notifying && (
					<div {...styles.copiedBadge()}>
						<div {...styles.copiedBadgeText()}>copied</div>
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

namespace styles {
	export const root = style({ display: 'flex', flexDirection: 'column' })

	export const header = style({
		alignItems: 'center',
		borderBottomWidth: 'regular',
		borderColor: 'line.secondary',
		borderStyle: 'solid',
		borderTopWidth: 'regular',
		display: 'flex',
		height: '40',
		justifyContent: 'space-between',
		paddingLeft: '16',
		paddingRight: '8',
	})

	export const headerLabel = style({ typography: 'body.b3' })

	export const tertiary = style({ color: 'content.tertiary' })

	export const primary = style({ color: 'content.primary' })

	export const rawToggle = style({ cursor: 'pointer', typography: 'body.b3' })

	export const headerActions = style({
		alignItems: 'center',
		color: 'content.tertiary',
		display: 'flex',
		gap: '4',
	})

	export const copied = style({ typography: 'body.b3', userSelect: 'none' })

	export const empty = style({
		color: 'content.tertiary',
		paddingBlock: '24',
		paddingInline: '20',
		textAlign: 'center',
		typography: 'body.b3',
	})

	export const accountHeader = style({
		alignItems: 'center',
		display: 'flex',
		gap: '8',
		paddingBottom: '8',
		paddingInline: '16',
		paddingTop: '12',
	})

	export const accountLink = style({
		minWidth: '0 !custom',
		typography: 'mono.inline',
	})

	export const accountCount = style({
		color: 'content.tertiary',
		flexShrink: 0,
		marginLeft: 'auto !custom',
		typography: 'body.b3',
	})

	export const gridScroll = style({
		overflowX: 'auto',
		paddingBottom: '12',
		paddingInline: '16',
	})

	export const grid = style({
		backgroundColor: 'background.secondary',
		borderColor: 'line.secondary',
		borderRadius: 'xs',
		borderStyle: 'solid',
		borderWidth: 'regular',
		display: 'grid',
		overflow: 'hidden',
		typography: 'mono.inline',
	})

	export const gridWrap = style({
		gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
	})

	export const gridNoWrap = style({
		gridTemplateColumns: 'auto auto auto',
		minWidth: '100% !custom',
		width: 'fit-content !custom',
	})

	// Header cells inherit the grid's mono face, as they always have.
	export const gridHead = style({
		backgroundColor: 'container.subtle',
		borderBottomWidth: 'regular',
		borderColor: 'line.secondary',
		borderStyle: 'solid',
		color: 'content.tertiary',
		paddingBlock: '8',
		paddingInline: '12',
	})

	export const cell = style({
		alignItems: 'flex-start',
		cursor: 'pointer',
		display: 'flex',
		paddingBlock: '8',
		paddingInline: '12',
		position: 'relative',
		textAlign: 'left',
		'@media (hover: hover)': {
			':hover': { backgroundColor: 'container.regular' },
		},
	})

	export const cellSlot = style({
		borderColor: 'line.secondary',
		borderStyle: 'solid',
		borderTopWidth: 'regular',
		color: 'content.secondary',
	})

	export const cellBefore = style({
		borderColor: 'line.secondary',
		borderStyle: 'solid',
		borderTopWidth: 'regular',
		color: 'content.tertiary',
	})

	export const cellAfter = style({
		borderColor: 'line.secondary',
		borderStyle: 'solid',
		borderTopWidth: 'regular',
		color: 'content.primary',
	})

	export const diffCell = style({
		borderColor: 'line.secondary',
		borderStyle: 'solid',
		borderTopWidth: 'regular',
		flexDirection: 'column',
	})

	export const breakAll = style({ wordBreak: 'break-all' })

	export const nowrap = style({ whiteSpace: 'nowrap' })

	export const diff = style({ color: 'content.secondary' })

	export const diffPositive = style({ color: 'content.positive' })

	export const copiedBadge = style({
		backgroundColor: 'background.elevated',
		borderRadius: '3xs',
		bottom: '2',
		color: 'content.secondary',
		paddingBlock: '2',
		paddingInline: '8',
		position: 'absolute',
		right: '2',
	})

	export const copiedBadgeText = style({ translate: '0 -2px !custom' })
}
