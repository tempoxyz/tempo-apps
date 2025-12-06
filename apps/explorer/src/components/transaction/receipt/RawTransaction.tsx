import { Json } from 'ox'
import { useMemo } from 'react'
import * as z from 'zod/mini'
import { useCopy } from '#lib/hooks'

export function RawTransaction(props: RawTransaction.Props) {
	const { data } = props
	const parsed = useMemo(() => {
		try {
			return RawTransaction.TxDataSchema.safeParse(Json.parse(data))
		} catch {
			return { success: false } as const
		}
	}, [data])

	const maxKeyLength = useMemo(() => {
		if (!parsed.success) return 0
		const txMax = RawTransaction.getMaxKeyLength(parsed.data.tx)
		const receiptMax = RawTransaction.getMaxKeyLength(parsed.data.receipt)
		return Math.max(txMax, receiptMax)
	}, [parsed])

	if (!parsed.success) return <pre className="whitespace-pre-wrap">{data}</pre>

	return (
		<div className="font-mono flex flex-col gap-[32px]">
			<RawTransaction.Section
				title="TX"
				data={parsed.data.tx}
				maxKeyLength={maxKeyLength}
			/>
			<RawTransaction.Section
				title="RECEIPT"
				data={parsed.data.receipt}
				maxKeyLength={maxKeyLength}
			/>
		</div>
	)
}

export namespace RawTransaction {
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

	export function Section(props: Section.Props) {
		const { title, data, maxKeyLength } = props
		const entries = Object.entries(data).sort(([a], [b]) => a.localeCompare(b))

		return (
			<div className="flex flex-col">
				<div className="text-primary uppercase mb-[4px]">{title}</div>
				<div className="flex flex-col">
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
			</div>
		)
	}

	export namespace Section {
		export interface Props {
			title: string
			data: Record<string, unknown>
			maxKeyLength: number
		}
	}

	export function Row(props: Row.Props) {
		const { label, value, pad = 21, depth = 0 } = props

		const { copy, notifying } = useCopy()

		const isArray = Array.isArray(value)
		const isFilledArray = isArray && value.length > 0
		const isObject =
			typeof value === 'object' && value !== null && !Array.isArray(value)
		const indent = depth * 8

		if (isFilledArray)
			return (
				<div className="flex flex-col">
					<button
						className="text-tertiary press-down cursor-pointer text-left"
						onClick={() => copy(stringify(value))}
						style={{
							paddingLeft: `${indent}px`,
							width: `${pad}ch`,
						}}
						type="button"
					>
						{notifying ? <span className="text-primary">copied</span> : label}
					</button>
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
				<div className="flex flex-col">
					<button
						className="text-tertiary press-down cursor-pointer text-left"
						onClick={() => copy(stringify(value))}
						style={{
							paddingLeft: `${indent}px`,
							width: `${pad}ch`,
						}}
						type="button"
					>
						{notifying ? <span className="text-primary">copied</span> : label}
					</button>
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
			<div className="flex gap-[16px]">
				<button
					className="flex items-start press-down cursor-pointer text-left"
					type="button"
					onClick={() => copy(RawTransaction.formatValue(value))}
					style={{
						paddingLeft: `${indent}px`,
						minWidth: `${pad}ch`,
					}}
				>
					<span className="text-tertiary shrink-0">
						{notifying ? <span className="text-primary">copied</span> : label}
					</span>
				</button>
				<button
					className="flex items-start press-down cursor-pointer text-left"
					type="button"
					onClick={() => copy(RawTransaction.formatValue(value))}
				>
					<span>{RawTransaction.formatValue(value)}</span>
				</button>
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

	export function ArrayItem(props: ArrayItem.Props) {
		const { index, value, pad = 21, depth = 0 } = props

		const { copy, notifying } = useCopy()

		const isObject =
			typeof value === 'object' && value !== null && !Array.isArray(value)
		const indent = depth * 8

		if (isObject) {
			const entries = Object.entries(value as Record<string, unknown>).sort(
				([a], [b]) => a.localeCompare(b),
			)
			return (
				<div className="flex flex-col">
					<div
						className="text-tertiary"
						style={{
							paddingLeft: `${indent}px`,
							width: `${pad}ch`,
						}}
					>
						[{index}]
					</div>
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
			<div className="flex gap-[16px]">
				<button
					className="text-tertiary text-left"
					onClick={() => copy(RawTransaction.formatValue(value))}
					style={{
						paddingLeft: `${indent}px`,
						width: `${pad}ch`,
					}}
					type="button"
				>
					{notifying ? (
						<span className="text-primary">copied</span>
					) : (
						`[${index}]`
					)}
				</button>
				<button
					className="press-down cursor-pointer text-left"
					type="button"
					onClick={() => copy(RawTransaction.formatValue(value))}
				>
					{RawTransaction.formatValue(value)}
				</button>
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
