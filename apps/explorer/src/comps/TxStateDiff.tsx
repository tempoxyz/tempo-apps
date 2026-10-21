import { CopyButton, Empty, style, Table, variants } from '@tempoxyz/ds'
import { ArrowCornerDownLeft } from '@tempoxyz/ds/icons'
import * as React from 'react'
import type { Hex } from 'viem'
import { Address } from '#comps/Address'
import { getContractInfo } from '#lib/domain/contracts'
import {
	decodeStorageChange,
	extractCandidateAddresses,
	type DecodedStorageChange,
	type StorageDecodeContext,
} from '#lib/domain/storage-decode'
import type { CallTrace, PrestateDiff } from '#lib/queries'
import { PanelToolbar, ViewToggle } from './PanelToolbar'

export function TxStateDiff(props: TxStateDiff.Props): React.JSX.Element {
	const {
		prestate,
		trace,
		receipt,
		logs,
		tokenMetadata,
		label = 'State changes',
	} = props
	const [wrap, setWrap] = React.useState(true)
	const [raw, setRaw] = React.useState(false)

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
	const ascii = React.useMemo(
		() => (data ? TxStateDiff.toAscii(data, { raw }) : ''),
		[data, raw],
	)

	const controls = data && (
		<>
			<CopyButton aria-label="Copy state changes" value={ascii} />
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
				<Empty.Root>
					<Empty.Title>No state diff</Empty.Title>
					<Empty.Description>
						The node returned no state trace.
					</Empty.Description>
				</Empty.Root>
			) : data.accounts.length === 0 ? (
				<Empty.Root>
					<Empty.Title>No state changes</Empty.Title>
					<Empty.Description>
						No account's storage or nonce changed.
					</Empty.Description>
				</Empty.Root>
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

	export function AccountView(props: AccountView.Props): React.JSX.Element {
		const { account, wrap, raw } = props
		const { address, contractName, nonceChange, storageChanges } = account

		return (
			<div {...styles.root()}>
				<div {...styles.accountHeader()}>
					{contractName && (
						<span {...styles.contractName()}>{contractName}</span>
					)}
					<Address address={address} />
					<span {...styles.accountCount()}>
						{nonceChange && 'nonce'}
						{nonceChange && storageChanges.length > 0 && ' + '}
						{storageChanges.length > 0 &&
							`${storageChanges.length} slot${storageChanges.length > 1 ? 's' : ''}`}
					</span>
				</div>

				<div {...styles.scroll()}>
					<Table.Root
						aria-label={`State changes for ${contractName ?? address}`}
						size="small"
						{...styles.table({ wrap })}
					>
						<Table.Head>
							<Table.Row>
								<Table.HeaderCell>Slot</Table.HeaderCell>
								<Table.HeaderCell>Before</Table.HeaderCell>
								<Table.HeaderCell>After</Table.HeaderCell>
							</Table.Row>
						</Table.Head>
						<Table.Body>
							{nonceChange && (
								<Table.Row>
									<Table.Cell mono>nonce</Table.Cell>
									<Table.Cell mono>{nonceChange.before}</Table.Cell>
									<Table.Cell mono numeric>
										{nonceChange.after}
									</Table.Cell>
								</Table.Row>
							)}
							{storageChanges.map((change) => {
								const decoded = !raw ? change.decoded : undefined
								return (
									<Table.Row key={change.slot}>
										{/* A decoded value names its raw value in a tooltip. */}
										<Table.Cell
											mono
											title={decoded?.slotLabel ? change.slot : undefined}
										>
											{decoded?.slotLabel ?? change.slot}
										</Table.Cell>
										<Table.Cell
											mono
											title={
												decoded?.beforeDisplay
													? (decoded.beforeRaw ?? change.before)
													: undefined
											}
										>
											{decoded?.beforeDisplay ?? change.before}
										</Table.Cell>
										<Table.Cell
											mono
											numeric
											title={
												decoded?.afterDisplay
													? (decoded.afterRaw ?? change.after)
													: undefined
											}
										>
											<span {...styles.after()}>
												<span>{decoded?.afterDisplay ?? change.after}</span>
												{decoded?.diff && (
													<span {...styles.diff()}>{decoded.diff.display}</span>
												)}
											</span>
										</Table.Cell>
									</Table.Row>
								)
							})}
						</Table.Body>
					</Table.Root>
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
		borderBottomWidth: '1px',
		borderColor: 'grayAlpha.200',
		borderStyle: 'solid',
		borderTopWidth: '1px',
		display: 'flex',
		gap: '8',
		justifyContent: 'space-between',
		minHeight: '48',
		paddingBlock: '8',
		paddingLeft: '16',
		paddingRight: '8',
	})

	export const headerLabel = style({
		color: 'gray.900',
		typography: 'label.12',
	})

	export const headerActions = style({
		alignItems: 'center',
		display: 'flex',
		gap: '4',
	})

	export const accountHeader = style({
		alignItems: 'center',
		display: 'flex',
		gap: '8',
		minWidth: '0 !custom',
		paddingBottom: '8',
		paddingInline: '16',
		paddingTop: '12',
		typography: 'copy.14',
	})

	export const contractName = style({
		flexShrink: '0 !custom',
		typography: 'label.14.strong',
	})

	export const accountCount = style({
		color: 'gray.900',
		flexShrink: '0 !custom',
		marginLeft: 'auto !custom',
		typography: 'label.12',
	})

	export const scroll = style({
		overflowX: 'auto',
		paddingBottom: '12',
		paddingInline: '16',
	})

	// Table leaves wrapping unset: wrapped values break anywhere to fit the
	// width, unwrapped ones keep one line and scroll.
	export const table = variants({
		base: {},
		defaultVariants: { wrap: true },
		variants: {
			wrap: {
				false: { whiteSpace: 'nowrap' },
				true: { wordBreak: 'break-all' },
			},
		},
	})

	export const after = style({ display: 'flex', flexDirection: 'column' })

	export const diff = style({ color: 'gray.900' })
}
