import { useId } from 'react'

export function Midcut({
	ellipsis = '…',
	prefix = '',
	value = '',
	min = 1,
	align = 'start',
}: Midcut.Props) {
	const id = useId()

	const body = value.slice(value.startsWith(prefix) ? prefix.length : 0)
	if (body.length < 2) return prefix + ellipsis

	const cutAt = 1 + Math.ceil((body.length - 1) / 2)
	const [start, end] = [body.slice(1, cutAt), body.slice(cutAt, -1)]

	const minWidth = prefix.length + min * 2 + 3

	return (
		<span
			id={id}
			title={value}
			className={`inline-flex w-full select-none ${align === 'end' ? 'justify-end' : ''}`}
			style={{
				containerType: 'inline-size',
				containerName: id,
				minWidth: `${minWidth}ch`,
			}}
		>
			<style>
				{`
            .${id}-ellipsis { display: none }
            @container ${id} (max-width: ${value.length + 1}ch) {
              .${id}-ellipsis { display: flex }
              .${id}-part {
                overflow: hidden;
                width: calc((100cqw - ${prefix.length + 3}ch) / 2);
              }
            }
          `}
			</style>
			<span
				className="inline-flex whitespace-nowrap"
				style={{
					maxWidth: `${value.length - 1}ch`,
					width: `round(down, calc(100% - 1ch), 2ch)`,
				}}
			>
				{prefix}
				{body.at(0)}
				<span className={`${id}-part`}>{start}</span>
				<span className={`${id}-ellipsis`}>{ellipsis}</span>
				<span className={`${id}-part flex justify-end`}>{end}</span>
			</span>
			{body.at(-1)}
		</span>
	)
}

export namespace Midcut {
	export interface Props {
		ellipsis?: string
		prefix?: string
		value?: string
		min?: number
		align?: 'start' | 'end'
	}
}
