import { useId } from 'react'

export function Midcut({
	align = 'start',
	ellipsis = '…',
	min = 1,
	prefix = '',
	value = '',
}: Midcut.Props) {
	const id = useId()
	const className = `midcut-${id.replaceAll(':', '')}`

	const body = value.slice(value.startsWith(prefix) ? prefix.length : 0)
	if (body.length < 2) return prefix + ellipsis

	const cutAt = 1 + Math.ceil((body.length - 1) / 2)
	const [start, end] = [body.slice(1, cutAt), body.slice(cutAt, -1)]
	const leading = `${prefix}${body.at(0)}`
	const trailing = body.at(-1)

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
				containerName: className,
			}}
		>
			<style>
				{`
            .${className}-text::before { content: attr(data-text) }
            .${className}-ellipsis { display: none }
            @container ${className} (max-width: ${value.length + 1}ch) {
              .${className}-ellipsis { display: flex }
              .${className}-part {
                overflow: hidden;
                width: calc((100cqw - ${prefix.length + 3}ch) / 2);
              }
            }
          `}
			</style>
			<span
				style={{
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
			<span
				aria-hidden="true"
				style={{
					position: 'absolute',
					inset: 0,
					display: 'inline-flex',
					justifyContent: align === 'end' ? 'flex-end' : undefined,
					pointerEvents: 'none',
					textDecoration: 'inherit',
				}}
			>
				<span
					style={{
						display: 'inline-flex',
						minWidth: `${minWidth}ch`,
						maxWidth: `${value.length - 1}ch`,
						width: 'round(down, calc(100% - 1ch), 2ch)',
						whiteSpace: 'nowrap',
					}}
				>
					<span className={`${className}-text`} data-text={leading} />
					<span
						className={`${className}-text ${className}-part`}
						data-text={start}
					/>
					<span
						className={`${className}-text ${className}-ellipsis`}
						data-text={ellipsis}
					/>
					<span
						className={`${className}-text ${className}-part`}
						data-text={end}
						style={{
							display: 'flex',
							justifyContent: 'flex-end',
						}}
					/>
				</span>
				<span className={`${className}-text`} data-text={trailing} />
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
