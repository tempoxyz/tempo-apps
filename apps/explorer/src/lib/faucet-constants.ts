import type { Address } from 'viem'

export const FAUCET_TOKENS: Array<{
	name: string
	symbol: string
	address: Address
	amount: string
}> = [
	{
		name: 'pathUSD',
		symbol: 'pathUSD',
		address: '0x20c0000000000000000000000000000000000000',
		amount: '1,000,000',
	},
	{
		name: 'AlphaUSD',
		symbol: 'AlphaUSD',
		address: '0x20c0000000000000000000000000000000000001',
		amount: '1,000,000',
	},
	{
		name: 'BetaUSD',
		symbol: 'BetaUSD',
		address: '0x20c0000000000000000000000000000000000002',
		amount: '1,000,000',
	},
	{
		name: 'ThetaUSD',
		symbol: 'ThetaUSD',
		address: '0x20c0000000000000000000000000000000000003',
		amount: '1,000,000',
	},
]
