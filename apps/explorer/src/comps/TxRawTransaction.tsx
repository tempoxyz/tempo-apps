import { Link } from '@tanstack/react-router'
import { CopyButton, style, variants } from '@tempoxyz/ds'
import * as Json from 'ox/Json'
import { useMemo } from 'react'
import { cx } from 'zyzz'
import * as z from 'zod/mini'
import { link, linkHover } from '#styles/explorer'

/**
 * The transaction and its receipt as aligned key and value lines. Each
 * section copies as JSON; values stay selectable text.
 */
export function TxRawTransaction(
	props: TxRawTransaction.Props,
): React.JSX.Element {
	const { data } = props
	const parsed = useMemo(() => {
		try {
			return TxRawTransaction.TxDataSchema.safeParse(Json.parse(data))
		} catch {
			return { success: false } as const
		}
	}, [data])

	const maxKeyLength = useMemo(() => {
		if (!parsed.success) return 0
		const txMax = TxRawTransaction.getMaxKeyLength(parsed.data.tx)
		const receiptMax = TxRawTransaction.getMaxKeyLength(parsed.data.receipt)
		return Math.max(txMax, receiptMax)
	}, [parsed])

	if (!parsed.success) return <pre {...styles.fallback()}>{data}</pre>

	return (
		<div {...styles.root()}>
			<TxRawTransaction.Section
				title="Transaction"
				data={parsed.data.tx}
				maxKeyLength={maxKeyLength}
			/>
			<TxRawTransaction.Section
				title="Receipt"
				data={parsed.data.receipt}
				maxKeyLength={maxKeyLength}
				showBorder
			/>
		</div>
	)
}

export namespace TxRawTransaction {
	export interface Props {
		data: string
	}

	export const TxDataSchema = z.object({
		receipt: z.record(z.string(), z.unknown()),
		tx: z.record(z.string(), z.unknown()),
	})

	export function formatValue(value: unknown): string {
		if (value === null || value === undefined) return ''
		return typeof value === 'object' ? stringify(value) : String(value)
	}

	export function getMaxKeyLength(data: Record<string, unknown>): number {
		let max = 0
		for (const [key, value] of Object.entries(data)) {
			max = Math.max(max, key.length)
			if (typeof value === 'object' && value !== null && !Array.isArray(value))
				max = Math.max(max, getMaxKeyLength(value as Record<string, unknown>))
			else if (Array.isArray(value))
				for (const item of value)
					if (typeof item === 'object' && item !== null && !Array.isArray(item))
						max = Math.max(
							max,
							getMaxKeyLength(item as Record<string, unknown>),
						)
		}
		return max
	}

	export function Section(props: Section.Props): React.JSX.Element {
		const { title, data, maxKeyLength, showBorder } = props
		const entries = Object.entries(data).sort(([a], [b]) => a.localeCompare(b))
		const json = useMemo(() => stringify(data), [data])

		return (
			<section {...styles.section({ border: Boolean(showBorder) })}>
				<div {...styles.sectionHeader()}>
					<h3 {...styles.sectionTitle()}>{title}</h3>
					<CopyButton
						aria-label={`Copy ${title.toLowerCase()} JSON`}
						value={json}
					/>
				</div>
				<div {...styles.column()}>
					{entries.map(([key, value]) => (
						<Row
							depth={0}
							key={key}
							label={key}
							pad={maxKeyLength}
							value={value}
						/>
					))}
				</div>
			</section>
		)
	}

	export namespace Section {
		export interface Props {
			title: string
			data: Record<string, unknown>
			maxKeyLength: number
			showBorder?: boolean
		}
	}

	// Fields that should be linked
	const linkableFields: Record<string, (value: string) => string> = {
		blockNumber: (v) => `/block/${v}`,
		blockHash: (v) => `/block/${v}`,
		hash: (v) => `/receipt/${v}`,
		from: (v) => `/address/${v}`,
		to: (v) => `/address/${v}`,
		contractAddress: (v) => `/address/${v}`,
		feePayer: (v) => `/address/${v}`,
		feeToken: (v) => `/token/${v}`,
	}

	export function Row(props: Row.Props): React.JSX.Element {
		const { label, value, pad = 21, depth = 0 } = props

		const isFilledArray = Array.isArray(value) && value.length > 0
		const isObject =
			typeof value === 'object' && value !== null && !Array.isArray(value)
		// Keys line up in one column, indented by depth.
		const keyStyle = { paddingLeft: `${depth * 8}px`, minWidth: `${pad}ch` }

		if (isFilledArray)
			return (
				<div {...styles.column()}>
					<span {...styles.groupKey({ style: keyStyle })}>{label}</span>
					{value.map((item, index) => (
						<ArrayItem
							key={`${index}${item}`}
							index={index}
							value={item}
							pad={pad}
							depth={depth + 1}
						/>
					))}
				</div>
			)

		if (isObject) {
			const entries = Object.entries(value as Record<string, unknown>).sort(
				([a], [b]) => a.localeCompare(b),
			)
			return (
				<div {...styles.column()}>
					<span {...styles.groupKey({ style: keyStyle })}>{label}</span>
					{entries.map(([key, val]) => (
						<Row
							key={key}
							label={key}
							value={val}
							pad={pad}
							depth={depth + 1}
						/>
					))}
				</div>
			)
		}

		const formattedValue = TxRawTransaction.formatValue(value)
		const linkTo = label in linkableFields ? linkableFields[label] : null

		return (
			<div {...styles.entry()}>
				<span {...styles.key({ style: keyStyle })}>{label}</span>
				{linkTo && formattedValue ? (
					<Link
						to={linkTo(formattedValue)}
						{...cx(styles.value(), link(), linkHover())}
					>
						{formattedValue}
					</Link>
				) : (
					<span {...styles.value()}>{formattedValue}</span>
				)}
			</div>
		)
	}

	export namespace Row {
		export interface Props {
			label: string
			value: unknown
			pad?: number
			depth?: number
		}
	}

	export function ArrayItem(props: ArrayItem.Props): React.JSX.Element {
		const { index, value, pad = 21, depth = 0 } = props

		const isObject =
			typeof value === 'object' && value !== null && !Array.isArray(value)
		const keyStyle = { paddingLeft: `${depth * 8}px`, minWidth: `${pad}ch` }

		if (isObject) {
			const entries = Object.entries(value as Record<string, unknown>).sort(
				([a], [b]) => a.localeCompare(b),
			)
			return (
				<div {...styles.column()}>
					<span {...styles.groupKey({ style: keyStyle })}>[{index}]</span>
					{entries.map(([key, val]) => (
						<Row
							key={key}
							label={key}
							value={val}
							pad={pad}
							depth={depth + 1}
						/>
					))}
				</div>
			)
		}

		return (
			<div {...styles.entry()}>
				<span {...styles.key({ style: keyStyle })}>[{index}]</span>
				<span {...styles.value()}>{TxRawTransaction.formatValue(value)}</span>
			</div>
		)
	}

	export namespace ArrayItem {
		export interface Props {
			index: number
			value: unknown
			pad?: number
			depth?: number
		}
	}
}

function stringify(value: unknown): string {
	return Json.stringify(value, (_, value) => {
		if (typeof value === 'bigint') return value.toString()
		return value
	})
}

namespace styles {
	export const fallback = style({ margin: '0', whiteSpace: 'pre-wrap' })

	export const root = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '24',
		typography: 'label.12.mono',
	})

	export const section = variants({
		base: {},
		defaultVariants: { border: false },
		variants: {
			border: {
				false: {},
				true: {
					borderColor: 'grayAlpha.200',
					borderTopWidth: '1px',
					paddingTop: '24',
				},
			},
		},
	})

	export const sectionHeader = style({
		alignItems: 'center',
		display: 'flex',
		justifyContent: 'space-between',
		marginBottom: '12',
	})

	export const sectionTitle = style({
		color: 'foreground',
		margin: '0',
		typography: 'label.12',
	})

	export const column = style({ display: 'flex', flexDirection: 'column' })

	export const groupKey = style({ color: 'gray.900', paddingBlock: '4' })

	export const entry = style({
		display: 'flex',
		gap: '16',
		paddingBlock: '4',
	})

	export const key = style({ color: 'gray.900', flexShrink: '0 !custom' })

	export const value = style({ minWidth: '0 !custom' })
}
