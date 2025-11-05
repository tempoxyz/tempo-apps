import { tempoDev } from 'tempo.ts/chains'
import { createClient, type OneOf } from 'viem'
import { type Config, createConfig, http } from 'wagmi'
import * as Actions from 'wagmi/actions'

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

export function getClient<
	config extends Config,
	chainId extends config['chains'][number]['id'] | number | undefined,
>(
	config: config,
	parameters: OneOf<
		| Actions.GetClientParameters<config, chainId>
		| { rpcUrl?: string | undefined }
	> = {},
): Actions.GetClientReturnType<config, chainId> {
	const { rpcUrl } = parameters
	const client = Actions.getClient(config, parameters)
	if (rpcUrl && client) {
		return createClient({
			...client,
			chain: undefined,
			transport: http(rpcUrl) as never,
		}) as never
	}
	return client as never
}

declare module 'wagmi' {
	interface Register {
		config: typeof config
	}
}
