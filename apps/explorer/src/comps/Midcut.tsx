import { useId } from 'react'

export function Midcut({
	align = 'start',
	ellipsis = '…',
	min = 1,
	prefix = '',
	value = '',
}: Midcut.Props) {
	const id = useId()

	const body = value.slice(value.startsWith(prefix) ? prefix.length : 0)
	if (body.length < 2) return prefix + ellipsis

	const cutAt = 1 + Math.ceil((body.length - 1) / 2)
	const [start, end] = [body.slice(1, cutAt), body.slice(cutAt, -1)]

	const minWidth = prefix.length + min * 2

	return (
		<span
			id={id}
			title={value}
			style={{
				display: 'inline-flex',
				justifyContent: align === 'end' ? 'flex-end' : undefined,
				position: 'relative',
				width: '100%',
				minWidth: `${minWidth + 1}ch`,
				textDecoration: 'inherit',
				containerType: 'inline-size',
				containerName: id,
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
				aria-hidden="true"
				style={{
					display: 'inline-flex',
					minWidth: `${minWidth}ch`,
					maxWidth: `${value.length - 1}ch`,
					width: 'round(down, calc(100% - 1ch), 2ch)',
					whiteSpace: 'nowrap',
				}}
			>
				{prefix}
				{body.at(0)}
				<span className={`${id}-part`}>{start}</span>
				<span className={`${id}-ellipsis`}>{ellipsis}</span>
				<span
					className={`${id}-part`}
					style={{
						display: 'flex',
						justifyContent: 'flex-end',
					}}
				>
					{end}
				</span>
			</span>
			<span aria-hidden="true">{body.at(-1)}</span>
			<span
				style={{
					position: 'absolute',
					top: 0,
					left: align === 'end' ? undefined : 0,
					right: align === 'end' ? 0 : undefined,
					display: 'block',
					width: 'max-content',
					maxWidth: '100%',
					overflow: 'hidden',
					whiteSpace: 'nowrap',
					color: 'transparent',
					font: 'inherit',
					lineHeight: 'inherit',
					pointerEvents: 'none',
					textAlign: align === 'end' ? 'right' : undefined,
				}}
			>
				{value}
			</span>
		</span>
	)
}

export namespace Midcut {
	export interface Props {
		align?: 'start' | 'end'
		ellipsis?: string
		min?: number
		prefix?: string
		value?: string
	}
}
