import type { Address } from 'ox'
import { erc20Abi } from 'viem'
import { useReadContracts } from 'wagmi'
import type { Actions } from 'wagmi/tempo'

type TokenMetadata = Actions.token.getMetadata.ReturnValue

/**
 * Plain ERC-20 detection for contracts outside the TIP-20 prefix: the address
 * is a token when `name`, `symbol`, `decimals` and `totalSupply` all
 * answer. Runs in the browser after hydration so it never delays SSR.
 */
export function useErc20Metadata(
	address: Address.Address,
	options: { enabled: boolean },
) {
	return useReadContracts({
		allowFailure: false,
		contracts: [
			{ address, abi: erc20Abi, functionName: 'name' },
			{ address, abi: erc20Abi, functionName: 'symbol' },
			{ address, abi: erc20Abi, functionName: 'decimals' },
			{ address, abi: erc20Abi, functionName: 'totalSupply' },
		],
		query: {
			enabled: options.enabled,
			retry: false,
			staleTime: Number.POSITIVE_INFINITY,
			select: ([name, symbol, decimals, totalSupply]): TokenMetadata => ({
				name,
				symbol,
				decimals,
				totalSupply,
				currency: '',
				logoURI: '',
			}),
		},
	})
}
