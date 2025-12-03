import { Json } from 'ox'
import { useMemo } from 'react'
import * as z from 'zod/mini'

export function RawTransaction(props: RawTransaction.Props) {
	const { data } = props
	const parsed = useMemo(() => {
		try {
			return RawTransaction.TxDataSchema.safeParse(Json.parse(data))
		} catch {
			return { success: false } as const
		}
	}, [data])

	if (!parsed.success)
		return <pre className="whitespace-pre-wrap break-all">{data}</pre>

	return (
		<div className="font-mono flex flex-col gap-[8px]">
			<RawTransaction.Section title="TX" data={parsed.data.tx} />
			<RawTransaction.Section title="RECEIPT" data={parsed.data.receipt} />
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
		return typeof value === 'object' ? Json.stringify(value) : String(value)
	}

	export function Section(props: Section.Props) {
		const { title, data } = props
		const entries = Object.entries(data)
		const maxKeyLength = Math.max(...entries.map(([k]) => k.length), 0)

		return (
			<div className="flex flex-col">
				<div className="text-tertiary uppercase tracking-wider mb-[4px]">
					{title}
				</div>
				<div className="flex flex-col">
					{entries.map(([key, value]) => (
						<Row
							key={key}
							label={key}
							value={value}
							pad={maxKeyLength}
							indent={1}
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
		}
	}

	export function Row(props: Row.Props) {
		const { label, value, pad = 21, indent = 0 } = props
		const isArray = Array.isArray(value)
		const isFilledArray = isArray && value.length > 0
		const isObject =
			typeof value === 'object' && value !== null && !Array.isArray(value)

		if (isFilledArray)
			return (
				<div className="flex flex-col" style={{ paddingLeft: indent * 8 }}>
					<div className="text-tertiary">{label}</div>
					{value.map((item, index) => (
						<ArrayItem
							key={`${index}${item}`}
							index={index}
							value={item}
							indent={1}
						/>
					))}
				</div>
			)

		if (isObject) {
			const entries = Object.entries(value as Record<string, unknown>)
			const nestedMaxKeyLength = Math.max(...entries.map(([k]) => k.length), 0)
			return (
				<div className="flex flex-col" style={{ paddingLeft: indent * 8 }}>
					<div className="text-tertiary">{label}</div>
					{entries.map(([key, val]) => (
						<Row
							key={key}
							label={key}
							value={val}
							pad={nestedMaxKeyLength}
							indent={1}
						/>
					))}
				</div>
			)
		}

		return (
			<div className="flex gap-[16px]" style={{ paddingLeft: indent * 8 }}>
				<span className="text-tertiary shrink-0" style={{ width: `${pad}ch` }}>
					{label}
				</span>
				<span className="break-all">{RawTransaction.formatValue(value)}</span>
			</div>
		)
	}

	export namespace Row {
		export interface Props {
			label: string
			value: unknown
			pad?: number
			indent?: number
		}
	}

	export function ArrayItem(props: ArrayItem.Props) {
		const { index, value, indent = 0 } = props
		const isObject =
			typeof value === 'object' && value !== null && !Array.isArray(value)

		if (isObject) {
			const entries = Object.entries(value as Record<string, unknown>)
			const maxKeyLength = Math.max(...entries.map(([k]) => k.length), 0)
			return (
				<div className="flex flex-col" style={{ paddingLeft: indent * 8 }}>
					<div className="text-tertiary">[{index}]</div>
					{entries.map(([key, val]) => {
						return (
							<Row
								key={key}
								label={key}
								value={val}
								pad={maxKeyLength}
								indent={1}
							/>
						)
					})}
				</div>
			)
		}

		return (
			<div className="flex gap-[16px]" style={{ paddingLeft: indent * 8 }}>
				<span className="text-tertiary">[{index}]</span>
				<span className="break-all">{RawTransaction.formatValue(value)}</span>
			</div>
		)
	}

	export namespace ArrayItem {
		export interface Props {
			index: number
			value: unknown
			indent?: number
		}
	}
}
