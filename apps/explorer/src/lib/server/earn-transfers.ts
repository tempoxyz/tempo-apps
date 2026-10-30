import type { Address } from 'ox'
import { fetchEarnPositions } from '#lib/server/address-balances'

/**
 * Earn reward distributors, by the vault they pay interest for. Taken from
 * the MerkleDistributorInstalled events of the distributor factory
 * 0x04fe080546c7fae60bd41c131600f824d54f464b on mainnet (as of block
 * 46600664); add new ones from that factory's events. A sender's own answer
 * to earnVault() can't be trusted: any contract can return a real vault.
 */
const KNOWN_EARN_DISTRIBUTORS: ReadonlyMap<string, string> = new Map([
	[
		'0x6c857bf1fe7de1bc1d5c639c721b2633f8fe34f3',
		'0xd730394f3bb85a4828e35fc5e361dcc9f894fa4f',
	],
	[
		'0xa65c6ed737b52543123817977d8d2c0e554bfc2d',
		'0xd730394f3bb85a4828e35fc5e361dcc9f894fa4f',
	],
	[
		'0x53be019722acea7fff9091f15cb383b4e6dbb0c7',
		'0xd730394f3bb85a4828e35fc5e361dcc9f894fa4f',
	],
	[
		'0xb7a9dfc2522f4c5d59547ea3b5662109c01fc114',
		'0x7fc6f9b52e556fea3ac594e5c895b21c828181e3',
	],
	[
		'0xb656837f0192cdee96defda187f176591d04adf4',
		'0x7fc6f9b52e556fea3ac594e5c895b21c828181e3',
	],
])

/** What the Transfers tab adds to an Earn share movement. */
export type EarnTransferAnnotation = {
	/** An Earn interest payout to the account, from its vault's distributor. */
	kind?: 'earn-interest' | undefined
	/** The shares' worth in the vault's asset, at the account's current rate. */
	valuation?: { value: string; currency: string; decimals: number } | undefined
}

type TransferRow = {
	from: Address.Address
	to: Address.Address
	value: string
	token: { address: Address.Address }
}

/**
 * Earn shares are worth more than a dollar each (the vault's rate grows), so
 * one share must not read as $1. Interest arrives as shares sent by one of
 * the vault's known reward distributors.
 */
export async function annotateEarnTransfers<row extends TransferRow>(
	account: Address.Address,
	chainId: number,
	rows: readonly row[],
): Promise<Array<row & EarnTransferAnnotation>> {
	if (rows.length === 0) return [...rows]
	const positions = await fetchEarnPositions({
		address: account,
		chainId,
		limit: 50,
	}).catch(() => [])
	const shares = new Map(
		positions.flatMap((position) => {
			const { assetAmount, shareAmount, vaultAddress } = position
			if (!shareAmount || !vaultAddress || BigInt(shareAmount.amount) <= 0n)
				return []
			return [
				[
					position.shareToken.address.toLowerCase(),
					{
						vault: vaultAddress.toLowerCase(),
						assets: BigInt(assetAmount.amount),
						shares: BigInt(shareAmount.amount),
						currency: assetAmount.currency,
						decimals: assetAmount.decimals,
					},
				] as const,
			]
		}),
	)
	if (shares.size === 0) return [...rows]

	return rows.map((row) => {
		const share = shares.get(row.token.address.toLowerCase())
		if (!share) return row
		const valuation = {
			value: ((BigInt(row.value) * share.assets) / share.shares).toString(),
			currency: share.currency,
			decimals: share.decimals,
		}
		const isInterest =
			row.to.toLowerCase() === account.toLowerCase() &&
			KNOWN_EARN_DISTRIBUTORS.get(row.from.toLowerCase()) === share.vault
		return {
			...row,
			valuation,
			...(isInterest ? { kind: 'earn-interest' as const } : {}),
		}
	})
}
