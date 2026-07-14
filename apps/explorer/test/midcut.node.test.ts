import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Midcut } from '#comps/Midcut'

function textContentFromMarkup(markup: string) {
	return markup.replace(/<[^>]*>/g, '')
}

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

		expect(textContentFromMarkup(markup)).toBe(value)
		expect(markup).toContain(`>${value}<`)
		expect(markup).not.toContain('<style')
		expect(markup).toContain('data-text="0x3"')
		expect(markup).toContain('data-text="d789254740b87080b5bb61d2a2f907b9"')
	})
})
