import * as React from 'react'
import { fitMidcut } from '#lib/midcut'

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
	const minChars = Math.max(1, min)
	const minWidth = prefixLength + minChars * 2 + ellipsis.length
	const [parts, setParts] = React.useState(() =>
		fitMidcut(value, {
			width: 0,
			measure: (text) => text.length,
			prefix,
			ellipsis,
			min,
		}),
	)

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
			context.letterSpacing =
				style.letterSpacing === 'normal' ? '0px' : style.letterSpacing
			const next = fitMidcut(value, {
				width: Math.floor(element.getBoundingClientRect().width),
				measure: (text) => context.measureText(text).width,
				prefix,
				ellipsis,
				min,
			})
			setParts((current) =>
				current.start === next.start &&
				current.end === next.end &&
				current.cut === next.cut
					? current
					: next,
			)
		}

		update()

		const observer = new ResizeObserver(update)
		observer.observe(element)
		void document.fonts?.ready.then(update)

		return () => {
			mounted = false
			observer.disconnect()
		}
	}, [value, prefix, ellipsis, min])

	return (
		<span
			ref={ref}
			className="midcut"
			data-align={align}
			data-cut={parts.cut ? 'true' : 'false'}
			title={value}
			style={{ minWidth: `${minWidth}ch` }}
		>
			<span className="midcut__findable">{value}</span>
			<span aria-hidden="true" className="midcut__visual">
				<span className="midcut__text" data-text={parts.start} />
				<span className="midcut__text" data-text={ellipsis} />
				<span className="midcut__text" data-text={parts.end} />
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
