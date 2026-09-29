import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { SourceSection } from '#comps/ContractSource'

it('server-renders a loading state instead of the legacy source explorer', () => {
	const markup = renderToStaticMarkup(
		React.createElement(SourceSection, {
			kind: 'verified',
			chainId: 4217,
			address: '0x0000000000000000000000000000000000000001',
			match: null,
			runtimeMatch: null,
			verifiedAt: null,
			abi: [],
			stdJsonInput: {
				language: 'Solidity',
				settings: {},
				sources: {
					'Token.sol': {
						content: 'contract Token {}',
						highlightedHtml: '<pre>legacy source</pre>',
					},
				},
			},
			compilation: {
				compiler: 'solc',
				compilerVersion: '0.8.20',
				language: 'Solidity',
				name: 'Token',
				fullyQualifiedName: 'Token.sol:Token',
				compilerSettings: {},
			},
		}),
	)
	expect(markup).toContain('role="status"')
	expect(markup).toContain('Loading source viewer…')
	expect(markup).not.toContain('Token.sol')
	expect(markup).not.toContain('contract Token')
	expect(markup).not.toContain('<pre')
})
