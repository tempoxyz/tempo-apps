import { Link } from '@tanstack/react-router'
import { CopyButton, Gauge, Hex, Rows, style, Surface } from '@tempoxyz/ds'
import type { Hex as HexType } from 'ox'
import * as React from 'react'
import { cx } from 'zyzz'
import { InfoCard } from '#comps/InfoCard'
import { RelativeTime } from '#comps/RelativeTime'
import { ValidatorTag } from '#comps/ValidatorTag'
import { useAnimatedBlockNumber } from '#lib/block-number'
import { useIsMounted } from '#lib/hooks'
import type { BlockWithTransactions } from '#lib/queries'
import { link, linkHover } from '#styles/explorer'

const utc = new Intl.DateTimeFormat('en-US', {
	day: 'numeric',
	hour: '2-digit',
	hourCycle: 'h23',
	minute: '2-digit',
	month: 'short',
	second: '2-digit',
	timeZone: 'UTC',
	year: 'numeric',
})

/**
 * A block's receipt: the block number as the card's main value, its age
 * beneath, then its fields as rows. The roots expand under the last row.
 */
export function BlockCard(props: BlockCard.Props): React.JSX.Element {
	const { block } = props
	const {
		number: blockNumber,
		hash,
		timestamp,
		parentHash,
		miner,
		gasUsed,
		gasLimit,
		stateRoot,
		transactionsRoot,
		receiptsRoot,
	} = block

	const [showRoots, setShowRoots] = React.useState(false)
	const rootsId = React.useId()
	const confirmationsRef = React.useRef<HTMLSpanElement>(null)
	const latestBlockRef = React.useRef(blockNumber ?? 0n)
	const isMounted = useIsMounted()
	const liveBlockNumber = useAnimatedBlockNumber()

	const getConfirmations = React.useCallback(
		(latest?: bigint) => {
			if (!blockNumber || !latest || latest < blockNumber) return undefined
			return Number(latest - blockNumber) + 1
		},
		[blockNumber],
	)

	React.useEffect(() => {
		if (!isMounted || liveBlockNumber == null) return
		if (liveBlockNumber > (latestBlockRef.current ?? 0n)) {
			latestBlockRef.current = liveBlockNumber
			const confirmations = getConfirmations(liveBlockNumber)
			if (confirmationsRef.current) {
				confirmationsRef.current.textContent =
					confirmations !== undefined
						? confirmations.toLocaleString('en-US')
						: '—'
			}
		}
	}, [isMounted, liveBlockNumber, getConfirmations])

	const date = new Date(Number(timestamp) * 1000)
	const roots = [
		{ label: 'State root', value: stateRoot },
		{ label: 'Transactions root', value: transactionsRoot },
		{ label: 'Receipts root', value: receiptsRoot },
	]

	return (
		<Surface>
			<Surface.Header>
				<InfoCard.Title>Block</InfoCard.Title>
				<CopyButton
					aria-label="Copy block number"
					value={String(blockNumber ?? 0n)}
				/>
			</Surface.Header>
			<p {...styles.number()}>{(blockNumber ?? 0n).toLocaleString('en-US')}</p>
			<RelativeTime timestamp={timestamp} {...styles.age()} />
			<div {...styles.rows()}>
				<Rows.Root dividers="full">
					<Rows.Row>
						<Rows.Label>Time</Rows.Label>
						<time dateTime={date.toISOString()} {...styles.numeric()}>
							{utc.format(date)} UTC
						</time>
					</Rows.Row>
					<Rows.Row>
						<Rows.Label>Unix time</Rows.Label>
						<span {...styles.numeric()}>{String(timestamp)}</span>
					</Rows.Row>
					{hash && (
						<Rows.Row>
							<Rows.Label>Hash</Rows.Label>
							<Hex.Root value={hash} {...styles.hex()}>
								<Hex.Text />
								<Hex.Copy aria-label="Copy block hash" />
							</Hex.Root>
						</Rows.Row>
					)}
					<Rows.Row>
						<Rows.Label>Parent</Rows.Label>
						<Hex.Root value={parentHash} {...styles.hex()}>
							<Link
								to="/block/$id"
								params={{ id: parentHash }}
								{...cx(styles.hexLink(), link(), linkHover())}
							>
								<Hex.Text />
							</Link>
							<Hex.Copy aria-label="Copy parent block hash" />
						</Hex.Root>
					</Rows.Row>
					<Rows.Row>
						<Rows.Label>Miner</Rows.Label>
						{miner ? (
							<ValidatorTag address={miner} />
						) : (
							<span {...styles.secondary()}>—</span>
						)}
					</Rows.Row>
					<Rows.Row>
						<Rows.Label>Confirmations</Rows.Label>
						<span ref={confirmationsRef} {...styles.numeric()}>
							<span {...styles.secondary()}>—</span>
						</span>
					</Rows.Row>
					<Rows.Row>
						<Rows.Label>Gas used</Rows.Label>
						<BlockCard.GasUsed gasLimit={gasLimit} gasUsed={gasUsed} />
					</Rows.Row>
					<Rows.Row
						action="expand"
						aria-controls={rootsId}
						aria-expanded={showRoots}
						onClick={() => setShowRoots((open) => !open)}
					>
						Roots
					</Rows.Row>
					{showRoots && (
						<Rows.Panel id={rootsId}>
							<Rows.Root dividers="none" size="small">
								{roots.map((root) => (
									<Rows.Row key={root.label} spacing="none">
										<Rows.Label>{root.label}</Rows.Label>
										<BlockCard.Root label={root.label} hash={root.value} />
									</Rows.Row>
								))}
							</Rows.Root>
						</Rows.Panel>
					)}
				</Rows.Root>
			</div>
		</Surface>
	)
}

export namespace BlockCard {
	export interface Props {
		block: BlockWithTransactions
	}

	/** Gas used as a share of the gas limit: a ring, then the exact values. */
	export function GasUsed(props: GasUsed.Props): React.JSX.Element {
		const { gasLimit, gasUsed } = props
		if (gasUsed === undefined || !gasLimit)
			return <span {...styles.secondary()}>—</span>
		// Most blocks use well under 1% of the limit, so keep two decimals.
		const percent = `${((Number(gasUsed) / Number(gasLimit)) * 100).toFixed(2)}%`
		return (
			<span {...styles.gas()}>
				<Gauge
					aria-label="Gas used"
					getAriaValueText={() =>
						`${percent} of ${gasLimit.toLocaleString('en-US')}`
					}
					max={Number(gasLimit)}
					size="small"
					value={Number(gasUsed)}
				/>
				<span {...styles.numeric()}>
					{gasUsed.toLocaleString('en-US')}{' '}
					<span {...styles.secondary()}>({percent})</span>
				</span>
			</span>
		)
	}

	export namespace GasUsed {
		export interface Props {
			gasLimit?: bigint | undefined
			gasUsed?: bigint | undefined
		}
	}

	export function Root(props: Root.Props): React.JSX.Element {
		const { label, hash } = props
		if (!hash) return <span {...styles.secondary()}>—</span>
		return (
			<Hex.Root value={hash} {...styles.hex()}>
				<Hex.Text />
				<Hex.Copy aria-label={`Copy ${label.toLowerCase()}`} />
			</Hex.Root>
		)
	}

	export namespace Root {
		export interface Props {
			label: string
			hash?: HexType.Hex | undefined
		}
	}
}

namespace styles {
	export const secondary = style({ color: 'gray.900' })

	export const numeric = style({
		color: 'foreground',
		fontVariantNumeric: 'tabular-nums !custom',
	})

	// The card's main value, at the size of a receipt's large `Amount`.
	export const number = style({
		color: 'foreground',
		fontVariantNumeric: 'tabular-nums !custom',
		margin: '0',
		typography: 'heading.32',
	})

	export const age = style({
		color: 'gray.900',
		display: 'block',
		marginBlockStart: '4',
		// Holds the line until the age renders after hydration.
		minHeight: '20',
		typography: 'copy.14',
	})

	// Surface pads 24px, so the rows reach its edges and keep their own inset.
	// They follow the number, so a wrapper sets the margins.
	export const rows = style({
		marginBlockStart: '16',
		marginInline: '-24px !custom',
	})

	export const hex = style({ minWidth: '0 !custom' })

	export const hexLink = style({
		display: 'inline-flex',
		maxWidth: '100% !custom',
		minWidth: '0 !custom',
	})

	export const gas = style({
		alignItems: 'center',
		display: 'flex',
		gap: '8',
	})
}
