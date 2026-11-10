import type { Address } from 'ox'
import { erc20Abi } from 'viem'
import { useReadContracts } from 'wagmi'
import type { Actions } from 'wagmi/tempo'
import {
	ERC20_PROBE_INTERFACES,
	erc20Bytes32MetadataAbi,
	erc165Abi,
	interpretErc20Probe,
	ZERO_ADDRESS,
} from '#lib/domain/erc20'

type TokenMetadata = Actions.token.getMetadata.ReturnValue

/**
 * Plain ERC-20 detection for contracts outside the TIP-20 prefix. EIP-20 has
 * no on-chain marker, so the address counts as a token when its required
 * views (`totalSupply`, `balanceOf`, `allowance`) and `decimals` answer and
 * it doesn't claim ERC-721 or ERC-1155 through ERC-165. `name` and `symbol`
 * are optional and may be bytes32. Runs in the browser after hydration so it
 * never delays SSR.
 */
export function useErc20Metadata(
	address: Address.Address,
	options: { enabled: boolean },
) {
	return useReadContracts({
		allowFailure: true,
		contracts: [
			{ address, abi: erc20Abi, functionName: 'decimals' },
			{ address, abi: erc20Abi, functionName: 'totalSupply' },
			{
				address,
				abi: erc20Abi,
				functionName: 'balanceOf',
				args: [ZERO_ADDRESS],
			},
			{
				address,
				abi: erc20Abi,
				functionName: 'allowance',
				args: [ZERO_ADDRESS, ZERO_ADDRESS],
			},
			{ address, abi: erc20Abi, functionName: 'name' },
			{ address, abi: erc20Abi, functionName: 'symbol' },
			{ address, abi: erc20Bytes32MetadataAbi, functionName: 'name' },
			{ address, abi: erc20Bytes32MetadataAbi, functionName: 'symbol' },
			{
				address,
				abi: erc165Abi,
				functionName: 'supportsInterface',
				args: [ERC20_PROBE_INTERFACES.erc721],
			},
			{
				address,
				abi: erc165Abi,
				functionName: 'supportsInterface',
				args: [ERC20_PROBE_INTERFACES.erc1155],
			},
		],
		query: {
			enabled: options.enabled,
			retry: false,
			// totalSupply moves with mints and burns, so refresh it like other token data.
			staleTime: 60_000,
			select: (results): TokenMetadata | undefined => {
				const value = <T>(index: number) =>
					results[index]?.status === 'success'
						? (results[index].result as T)
						: undefined
				const probe = interpretErc20Probe(address, {
					decimals: value<number>(0),
					totalSupply: value<bigint>(1),
					balanceOf: value<bigint>(2),
					allowance: value<bigint>(3),
					name: value<string>(4),
					symbol: value<string>(5),
					nameBytes32: value<`0x${string}`>(6),
					symbolBytes32: value<`0x${string}`>(7),
					isErc721: value<boolean>(8),
					isErc1155: value<boolean>(9),
				})
				if (!probe) return undefined
				return { ...probe, currency: '', logoURI: '' }
			},
		},
	})
}
