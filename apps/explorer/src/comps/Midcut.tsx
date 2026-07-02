import * as React from 'react'

export function Midcut(props: Midcut.Props): React.JSX.Element {
	const {
		align = 'start',
		ellipsis = '…',
		min = 1,
		prefix = '',
		value = '',
	} = props
	const ref = React.useRef<HTMLSpanElement>(null)
	const prefixLength = value.startsWith(prefix) ? prefix.length : 0
	const body = value.slice(prefixLength)
	const minChars = Math.max(1, min)
	const minWidth = prefixLength + minChars * 2 + 1
	const [cut, setCut] = React.useState(value.length > minWidth)

	React.useLayoutEffect(() => {
		const element = ref.current
		if (!element) return

		const canvas = document.createElement('canvas')
		const context = canvas.getContext('2d')
		if (!context) return
		let mounted = true

		const update = () => {
			if (!mounted) return

			const style = getComputedStyle(element)

			context.font = style.font
			const fullWidth = context.measureText(value).width
			const nextCut = fullWidth > element.clientWidth + 0.5
			setCut((current) => (current === nextCut ? current : nextCut))
		}

		update()

		const observer = new ResizeObserver(update)
		observer.observe(element)
		void document.fonts?.ready.then(update)

		return () => {
			mounted = false
			observer.disconnect()
		}
	}, [value])

	const cutAt = 1 + Math.ceil((body.length - 1) / 2)
	const leading = `${prefix}${body[0] ?? ''}`
	const start = body.slice(1, cutAt)
	const end = body.slice(cutAt, -1)
	const trailing = body.at(-1) ?? ''

	return (
		<span
			ref={ref}
			className="midcut"
			data-align={align}
			data-cut={cut ? 'true' : 'false'}
			title={value}
			style={{ minWidth: `${minWidth}ch` }}
		>
			<span className="midcut__findable">{value}</span>
			<span aria-hidden="true" className="midcut__visual">
				<span className="midcut__text" data-text={leading} />
				<span className="midcut__text midcut__part" data-text={start} />
				<span className="midcut__text midcut__ellipsis" data-text={ellipsis} />
				<span
					className="midcut__text midcut__part midcut__part--end"
					data-text={end}
				/>
				<span className="midcut__text" data-text={trailing} />
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
