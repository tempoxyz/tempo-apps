import { style } from '@tempoxyz/ds/platform'
import * as React from 'react'
import { cx } from 'zyzz'

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
	const shorten = (count: number) => {
		const start = Math.ceil(count / 2)
		const end = Math.floor(count / 2)
		return `${value.slice(0, prefixLength)}${body.slice(0, start)}${ellipsis}${end ? body.slice(-end) : ''}`
	}
	const [display, setDisplay] = React.useState(() =>
		body.length > minChars * 2 ? shorten(minChars * 2) : value,
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
			context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
			const spacing = Number.parseFloat(style.letterSpacing) || 0
			const fits = (text: string) =>
				context.measureText(text).width + text.length * spacing <=
				element.clientWidth
			if (fits(value)) {
				setDisplay(value)
				return
			}
			const candidate = (count: number) => {
				const start = Math.ceil(count / 2)
				const end = Math.floor(count / 2)
				return `${value.slice(0, prefixLength)}${body.slice(0, start)}${ellipsis}${end ? body.slice(-end) : ''}`
			}
			let low = 0
			let high = Math.max(0, body.length - 1)
			while (low < high) {
				const middle = Math.ceil((low + high) / 2)
				if (fits(candidate(middle))) low = middle
				else high = middle - 1
			}
			const next = candidate(low)
			setDisplay(fits(next) ? next : fits(ellipsis) ? ellipsis : '')
		}

		update()
		const observer = new ResizeObserver(update)
		observer.observe(element)
		void document.fonts?.ready.then(update)
		return () => {
			mounted = false
			observer.disconnect()
		}
	}, [body, ellipsis, prefixLength, value])

	return (
		<span
			ref={ref}
			{...cx(
				// `midcut` and its parts are styled globally in `#styles/globals`.
				styles.root({ className: 'midcut' }),
				prefix === '0x' && styles.mono(),
			)}
			data-align={align}
			data-cut={display !== value ? 'true' : 'false'}
			title={value}
		>
			<span className="midcut__findable">{value}</span>
			<span aria-hidden="true" className="midcut__visual" data-text={display} />
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

namespace styles {
	export const root = style()

	export const mono = style({
		fontFamily: '"JetBrains Mono", monospace',
		fontWeight: 400,
		letterSpacing: '0px',
	})
}
