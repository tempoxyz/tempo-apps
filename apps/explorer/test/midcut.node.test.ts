import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Midcut } from '#comps/Midcut'
import { fitMidcut } from '#lib/midcut'

describe('Midcut', () => {
	it('keeps the full value as contiguous searchable text', () => {
		const value =
			'0x3d789254740b87080b5bb61d2a2f907b915f98fdf64de57f2bb4a8bbf731a8a9'

		const markup = renderToStaticMarkup(
			React.createElement(Midcut, {
				align: 'end',
				min: 4,
				prefix: '0x',
				value,
			}),
		)

		expect(markup.match(/>[^<]+</g)).toEqual([`>${value}<`])
		expect(markup).not.toContain('<style')
		expect(markup).toContain('data-text="0x3d78"')
		expect(markup).toContain('data-text="a8a9"')
	})

	it('fits whole characters at fractional character widths', () => {
		const result = fitMidcut('0x123456789abcdef0', {
			width: 105,
			measure: (text) => text.length * 10,
			prefix: '0x',
			ellipsis: '…',
			min: 2,
		})
		expect(result).toEqual({ start: '0x1234', end: 'ef0', cut: true })
	})

	it('uses the complete value when it exactly fits', () => {
		expect(
			fitMidcut('0x123456789abcdef0', {
				width: 180,
				measure: (text) => text.length * 10,
				prefix: '0x',
				ellipsis: '…',
				min: 2,
			}),
		).toEqual({ start: '0x123456789abcdef0', end: '', cut: false })
	})

	it('measures a custom ellipsis and variable-width characters', () => {
		expect(
			fitMidcut('WWiiiiWW', {
				width: 37,
				measure: (text) =>
					Array.from(text).reduce(
						(sum, char) => sum + (char === 'W' ? 10 : 3),
						0,
					),
				prefix: '',
				ellipsis: '...',
				min: 1,
			}),
		).toEqual({ start: 'W', end: 'W', cut: true })
	})
})
