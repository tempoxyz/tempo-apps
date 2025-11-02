import { tempoDev } from 'tempo.ts/chains'
import { createConfig, http } from 'wagmi'

export const config = createConfig({
	chains: [tempoDev],
	transports: {
		[tempoDev.id]: http('https://devnet.tempoxyz.dev', {
			fetchOptions: {
				headers: {
					Authorization: `Basic ${btoa('eng:zealous-mayer')}`,
				},
			},
		}),
	},
})

declare module 'wagmi' {
	interface Register {
		config: typeof config
	}
}
