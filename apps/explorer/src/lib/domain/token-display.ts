import { tempo } from 'viem/chains'

const OUSD_ADDRESS = '0x20c0000000000000000000006a37da5c996874be'

export function getTokenDisplayName(
	chainId: number,
	address: string,
	name: string,
): string {
	if (chainId === tempo.id && address.toLowerCase() === OUSD_ADDRESS)
		return 'Open USD'
	return name
}
