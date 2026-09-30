import { z } from 'zod'

export const portalNetworks = {
	mainnet: 'https://explore.tempo.xyz',
	testnet: 'https://explore.testnet.tempo.xyz',
	devnet: 'https://explore.devnet.tempo.xyz',
	nextfork: 'https://explore.nextfork.devnet.tempo.xyz',
} as const

export const portalQuerySchema = z.object({
	network: z.enum(['mainnet', 'testnet', 'devnet', 'nextfork']),
})
export type PortalNetwork = z.infer<typeof portalQuerySchema>['network']

const count = z.number().int().nonnegative().safe()
const overviewSchema = z.object({
	isZonePortal: z.literal(true),
	counts: z.object({ deposits: count, withdrawals: count, batches: count }),
	assets: z.array(
		z.object({
			address: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
			balance: z.string().regex(/^\d+$/),
			decimals: z.number().int().min(0).max(255),
			symbol: z.string().max(64),
		}),
	),
})
export type PortalOverview = z.infer<typeof overviewSchema>

export function portalId(address: string): bigint | undefined {
	if (!/^0x5ad0[0-9a-f]{36}$/i.test(address)) return undefined
	const id = BigInt(`0x${address.slice(6)}`)
	return id > 0n && id <= 0xffff_ffffn ? id : undefined
}

export async function fetchPortalOverview(
	address: string,
	network: PortalNetwork,
	request: typeof fetch = fetch,
): Promise<PortalOverview> {
	if (portalId(address) === undefined)
		throw new Error('Invalid Zone Portal address')
	// Only deployment-owned origins are accepted; never fetch a URL from query input.
	const response = await request(
		`${portalNetworks[network]}/api/address/zone-portal/${address}`,
		{
			signal: AbortSignal.timeout(8_000),
			redirect: 'manual',
		},
	)
	if (!response.ok)
		throw new Error(`Portal overview returned ${response.status}`, {
			cause: response.status,
		})
	return overviewSchema.parse(await response.json())
}

export function formatPortalBalance(balance: string, decimals: number): string {
	const digits = BigInt(balance)
		.toString()
		.padStart(decimals + 1, '0')
	const whole = decimals ? digits.slice(0, -decimals) : digits
	const fraction = decimals
		? digits.slice(-decimals).slice(0, 6).replace(/0+$/, '')
		: ''
	if (BigInt(balance) > 0n && BigInt(whole) === 0n && !fraction)
		return '<0.000001'
	return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${fraction ? `.${fraction}` : ''}`
}
