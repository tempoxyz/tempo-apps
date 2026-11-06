import { Link } from '@tanstack/react-router'
import {
	Accordion,
	CopyButton,
	Gauge,
	Hex,
	ListGroup,
	style,
	Surface,
} from '@tempoxyz/ds'
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
 * beneath, then its fields as rows. The roots open in an accordion below the rows.
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
			<ListGroup.Root {...styles.rows()}>
				<ListGroup.Row>
					<ListGroup.Label>Time</ListGroup.Label>
					<time dateTime={date.toISOString()} {...styles.numeric()}>
						{utc.format(date)} UTC
					</time>
				</ListGroup.Row>
				<ListGroup.Row>
					<ListGroup.Label>Unix time</ListGroup.Label>
					<span {...styles.numeric()}>{String(timestamp)}</span>
				</ListGroup.Row>
				{hash && (
					<ListGroup.Row>
						<ListGroup.Label>Hash</ListGroup.Label>
						<Hex.Root value={hash} {...styles.hex()}>
							<Hex.Text />
							<Hex.Copy aria-label="Copy block hash" />
						</Hex.Root>
					</ListGroup.Row>
				)}
				<ListGroup.Row>
					<ListGroup.Label>Parent</ListGroup.Label>
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
				</ListGroup.Row>
				<ListGroup.Row>
					<ListGroup.Label>Miner</ListGroup.Label>
					{miner ? (
						<ValidatorTag address={miner} />
					) : (
						<span {...styles.secondary()}>—</span>
					)}
				</ListGroup.Row>
				<ListGroup.Row>
					<ListGroup.Label>Confirmations</ListGroup.Label>
					<span ref={confirmationsRef} {...styles.numeric()}>
						<span {...styles.secondary()}>—</span>
					</span>
				</ListGroup.Row>
				<ListGroup.Row>
					<ListGroup.Label>Gas used</ListGroup.Label>
					<BlockCard.GasUsed gasLimit={gasLimit} gasUsed={gasUsed} />
				</ListGroup.Row>
			</ListGroup.Root>
			<Accordion.Root>
				<Accordion.Item value="roots">
					<Accordion.Trigger>Roots</Accordion.Trigger>
					<Accordion.Panel>
						<ListGroup.Root>
							{roots.map((root) => (
								<ListGroup.Row key={root.label}>
									<ListGroup.Label>{root.label}</ListGroup.Label>
									<BlockCard.Root label={root.label} hash={root.value} />
								</ListGroup.Row>
							))}
						</ListGroup.Root>
					</Accordion.Panel>
				</Accordion.Item>
			</Accordion.Root>
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
	export const secondary = style({ color: 'content.secondary' })

	export const numeric = style({
		color: 'content.primary',
		fontVariantNumeric: 'tabular-nums !custom',
	})

	// The card's main value, at the size of a receipt's large `Amount`.
	export const number = style({
		color: 'content.primary',
		fontVariantNumeric: 'tabular-nums !custom',
		margin: '0',
		typography: 'value.v3',
	})

	export const age = style({
		color: 'content.secondary',
		display: 'block',
		marginBlockStart: '4',
		// Holds the line until the age renders after hydration.
		minHeight: '20',
		typography: 'body.b2',
	})

	// The card's list bleeds to its edges itself; this only spaces it from the age.
	export const rows = style({ marginBlockStart: '16' })

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
