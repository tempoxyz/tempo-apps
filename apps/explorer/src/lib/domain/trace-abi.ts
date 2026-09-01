import type { Hex } from 'viem'
import { erc20Abi } from 'viem'
import { zonePortalAbi } from '#lib/abis'
import { getAbiItem } from '#lib/domain/contracts'

/**
 * Protocol ABIs that can identify calls even when a deployed contract has not
 * published an ABI and its selector is absent from the signature registry.
 */
export function getKnownTraceAbiItem(selector: Hex) {
	return (
		getAbiItem({ abi: zonePortalAbi, selector }) ??
		getAbiItem({ abi: erc20Abi, selector })
	)
}
