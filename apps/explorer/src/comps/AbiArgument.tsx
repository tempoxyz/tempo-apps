import type { AbiParameter } from 'viem'
import { useCopy } from '#lib/hooks'

/** Render decoded ABI values using their structure, including unnamed tuples. */
export function AbiArgument(props: AbiArgument.Props): React.JSX.Element {
	const { input, value } = props
	const { copy, notifying } = useCopy()
	const name = input.name || '(unnamed)'
	const array = /^(.*)\[\d*\]$/.exec(input.type)
	const children =
		array && Array.isArray(value)
			? value.map((item, index) => ({
					input: {
						...input,
						type: array[1],
						name: `[${index}]`,
					} as AbiParameter,
					value: item,
				}))
			: input.type === 'tuple' && 'components' in input && value != null
				? input.components.map((component, index) => ({
						input: { ...component, name: component.name || `[${index}]` },
						value: Array.isArray(value)
							? value[index]
							: (value as Record<string, unknown>)[component.name ?? ''],
					}))
				: undefined

	if (children)
		return (
			<details
				open={input.type === 'tuple'}
				className="min-w-0 text-[12px] font-mono"
			>
				<summary className="cursor-pointer px-[10px] py-[10px] text-primary hover:bg-base-alt/50 break-all">
					<span className="font-medium">{name}</span>
					<span className="ml-[8px] text-tertiary">{input.type}</span>
					<span className="ml-[8px] text-tertiary">
						{children.length} {array ? 'items' : 'fields'}
					</span>
				</summary>
				{children.length ? (
					<div className="ml-[14px] mb-[6px] border-l border-card-border pl-[6px] divide-y divide-card-border">
						{children.map((child, index) => (
							<AbiArgument key={`${index}-${child.input.name}`} {...child} />
						))}
					</div>
				) : (
					<div className="px-[24px] pb-[10px] text-tertiary">
						Empty {array ? 'array' : 'tuple'}
					</div>
				)}
			</details>
		)

	return (
		<button
			type="button"
			onClick={() => copy(String(value))}
			title={`Copy ${name}`}
			className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-[4px] sm:gap-[12px] px-[10px] py-[8px] text-[12px] font-mono w-full text-left cursor-pointer press-down hover:bg-base-alt/50 transition-colors"
		>
			<span className="min-w-0 break-all">
				<span className="block text-primary">
					{notifying ? 'copied' : name}
				</span>
				<span className="block text-tertiary">{input.type}</span>
			</span>
			<span className="min-w-0 text-primary break-all max-h-[160px] overflow-auto">
				{String(value)}
			</span>
		</button>
	)
}

export declare namespace AbiArgument {
	type Props = {
		input: AbiParameter
		value: unknown
	}
}
