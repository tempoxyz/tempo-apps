/** biome-ignore-all lint/a11y/useSemanticElements: cells are laid out by one CSS grid per account, which native table rows cannot join, so the grid takes table roles instead */
/** biome-ignore-all lint/a11y/useFocusableInteractive: role="table" rows and headers are static, not interactive grid cells */
import { Link } from '@tanstack/react-router'
import { style } from '@tempoxyz/ds/platform'
import { ArrowCornerDownLeft, Check, Copy } from '@tempoxyz/ds/platform/icons'
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
import { PanelToolbar, ViewToggle } from './PanelToolbar'
import type { CallTrace, PrestateDiff } from '#lib/queries'
import { link, linkHover, pressDown, truncate } from '#styles/explorer'

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

	const controls = data && (
		<>
			<PanelToolbar.IconButton
				onClick={() => copy.copy(TxStateDiff.toAscii(data, { raw }))}
				label="Copy state changes"
			>
				{copy.notifying ? <Check /> : <Copy />}
			</PanelToolbar.IconButton>
			<PanelToolbar.IconButton
				onClick={() => setWrap(!wrap)}
				active={wrap}
				label={wrap ? 'Disable line wrap' : 'Enable line wrap'}
			>
				<ArrowCornerDownLeft />
			</PanelToolbar.IconButton>
			<ViewToggle
				label="State format"
				value={raw ? 'raw' : 'decoded'}
				options={[
					{ value: 'decoded', label: 'Decoded' },
					{ value: 'raw', label: 'Raw' },
				]}
				onChange={(value) => setRaw(value === 'raw')}
			/>
		</>
	)

	return (
		<div {...styles.root()}>
			{/* With a label this is a section header on the transaction page. Without
			    one — the simulator, where the tab already names the panel — it is the
			    same toolbar the trace uses, so the two panels are visibly siblings. */}
			{label === null ? (
				hasData &&
				data && (
					<PanelToolbar
						summary={`${data.accounts.length} account${data.accounts.length === 1 ? '' : 's'} changed`}
					>
						{controls}
					</PanelToolbar>
				)
			) : (
				<div {...styles.header()}>
					<span {...styles.headerLabel()}>{label}</span>
					{hasData && <div {...styles.headerActions()}>{controls}</div>}
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
						role="table"
						aria-label={`State changes for ${contractName ?? address}`}
						{...cx(
							styles.grid(),
							wrap && styles.gridWrap(),
							!wrap && styles.gridNoWrap(),
						)}
					>
						<div role="row" {...styles.row()}>
							<div role="columnheader" {...styles.gridHead()}>
								Slot
							</div>
							<div role="columnheader" {...styles.gridHead()}>
								Before
							</div>
							<div role="columnheader" {...styles.gridHead()}>
								After
							</div>
						</div>
						{nonceChange && (
							<div role="row" {...styles.row()}>
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
							</div>
						)}
						{storageChanges.map((change) => {
							const decoded = !raw ? change.decoded : undefined
							return (
								<div role="row" key={change.slot} {...styles.row()}>
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
								</div>
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

	/** A cell whose value copies on click; the toast confirms the copy. */
	export function CopyCell(props: CopyCell.Props) {
		const { value, copyValue, className, wrap, isDecoded } = props
		const copy = useCopy()
		const valueToCopy = copyValue ?? value

		return (
			<div role="cell" {...styles.cell({ className })}>
				<button
					type="button"
					{...cx(
						styles.cellButton(),
						pressDown(),
						wrap && styles.breakAll(),
						!wrap && styles.nowrap(),
					)}
					onClick={() => copy.copy(valueToCopy)}
					title={isDecoded ? valueToCopy : undefined}
				>
					{value}
				</button>
			</div>
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
			<div role="cell" {...cx(styles.cell(), styles.cellAfter())}>
				<button
					type="button"
					{...cx(
						styles.cellButton(),
						styles.diffCell(),
						pressDown(),
						wrap && styles.breakAll(),
						!wrap && styles.nowrap(),
					)}
					onClick={() => copy.copy(valueToCopy)}
					title={isDecoded ? valueToCopy : undefined}
				>
					<span>{value}</span>
					{diff && <span {...styles.diff()}>{diff.display}</span>}
				</button>
			</div>
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
		gap: '8',
		justifyContent: 'space-between',
		minHeight: '48',
		paddingBlock: '8',
		paddingLeft: '16',
		paddingRight: '8',
	})

	export const headerLabel = style({
		color: 'content.secondary',
		typography: 'body.b3',
	})

	export const headerActions = style({
		alignItems: 'center',
		display: 'flex',
		gap: '4',
	})

	export const empty = style({
		color: 'content.secondary',
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
		color: 'content.secondary',
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

	// Rows only group cells for assistive tech; the grid lays the cells out.
	export const row = style({ display: 'contents' })

	export const gridHead = style({
		backgroundColor: 'container.subtle',
		borderBottomWidth: 'regular',
		borderColor: 'line.secondary',
		borderStyle: 'solid',
		color: 'content.secondary',
		paddingBlock: '8',
		paddingInline: '12',
	})

	export const cell = style({
		borderColor: 'line.secondary',
		borderStyle: 'solid',
		borderTopWidth: 'regular',
		display: 'flex',
	})

	export const cellButton = style({
		alignItems: 'flex-start',
		color: 'inherit !custom',
		cursor: 'pointer',
		display: 'flex',
		flex: 1,
		minWidth: '0 !custom',
		paddingBlock: '8',
		paddingInline: '12',
		textAlign: 'left',
		'@media (hover: hover)': {
			':hover': { backgroundColor: 'container.regular' },
		},
		// The grid clips its overflow, which would cut an outset ring.
		':focus-visible': { outlineOffset: '-2px !custom' },
	})

	export const cellSlot = style({ color: 'content.secondary' })

	export const cellBefore = style({ color: 'content.secondary' })

	export const cellAfter = style({ color: 'content.primary' })

	export const diffCell = style({ flexDirection: 'column' })

	export const breakAll = style({ wordBreak: 'break-all' })

	export const nowrap = style({ whiteSpace: 'nowrap' })

	export const diff = style({ color: 'content.secondary' })
}
