import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
	decodeAbiParameters,
	encodeAbiParameters,
	parseAbiParameters,
} from 'viem'
import { describe, expect, it } from 'vitest'
import { AbiArgument } from '#comps/AbiArgument'

describe('decoded ABI argument tree', () => {
	it('renders named tuple fields individually, including zero and false', () => {
		const [input] = parseAbiParameters(
			'(uint64 count, bool enabled) transition',
		)
		const [value] = decodeAbiParameters(
			[input],
			encodeAbiParameters([input], [{ count: 0n, enabled: false }]),
		)
		const html = renderToStaticMarkup(
			createElement(AbiArgument, { input, value }),
		)
		expect(html).toContain('<details open=""')
		expect(html).toContain('Copy count')
		expect(html).toContain('Copy enabled')
		expect(html).toContain('>0</span>')
		expect(html).toContain('>false</span>')
		expect(html).not.toContain('&quot;count&quot;')
	})

	it('uses positional values for partially named tuples and nests tuple arrays', () => {
		const [input] = parseAbiParameters(
			'(uint256, (uint64 count, bool enabled)[2] entries) batch',
		)
		const [value] = decodeAbiParameters(
			[input],
			encodeAbiParameters(
				[input],
				[
					[
						7n,
						[
							{ count: 11n, enabled: true },
							{ count: 22n, enabled: false },
						],
					],
				],
			),
		)
		const html = renderToStaticMarkup(
			createElement(AbiArgument, { input, value }),
		)
		expect(html.match(/<details/g)).toHaveLength(4)
		expect(html.match(/<details open=""/g)).toHaveLength(3)
		expect(html).toContain('Copy [0]')
		expect(html).toContain('>7</span>')
		expect(html).toContain('>11</span>')
		expect(html).toContain('>22</span>')
		expect(html).toContain('>entries</span>')
	})

	it('renders multidimensional arrays and an explicit empty state', () => {
		const [input] = parseAbiParameters('uint256[][] values')
		const html = renderToStaticMarkup(
			createElement(AbiArgument, { input, value: [[12n], []] }),
		)
		expect(html.match(/<details/g)).toHaveLength(3)
		expect(html).toContain('>12</span>')
		expect(html).toContain('Empty array')
		expect(html).not.toContain('open=""')
	})
})
