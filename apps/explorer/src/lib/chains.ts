import { type Chain } from 'viem'

export const signetParmigiana = {
	id: 88888,
	name: 'Signet Parmigiana',
	nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
	blockExplorers: {
		default: {
			name: 'Signet Explorer',
			url: 'https://explorer.parmigiana.signet.sh',
		},
	},
	rpcUrls: {
		default: {
			http: ['https://rpc.parmigiana.signet.sh'],
			webSocket: ['wss://rpc.parmigiana.signet.sh'],
		},
	},
} as const satisfies Chain

export const signetHost = {
	id: 3151908,
	name: 'Signet Host',
	nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
	blockExplorers: {
		default: {
			name: 'Signet Host Explorer',
			url: 'https://explorer-host.parmigiana.signet.sh',
		},
	},
	rpcUrls: {
		default: {
			http: ['https://host-rpc.parmigiana.signet.sh'],
			webSocket: ['wss://host-rpc.parmigiana.signet.sh'],
		},
	},
} as const satisfies Chain
