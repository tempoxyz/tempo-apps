import type { Address } from 'ox'
import { parseAbi, zeroAddress } from 'viem'
import { fetchEarnPositions } from '#lib/server/address-balances'
import { getBatchedClient } from '#wagmi.config.ts'

const distributorAbi = parseAbi(['function earnVault() view returns (address)'])

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
 * one share must not read as $1. Interest arrives as shares sent by the
 * vault's reward distributor, a contract whose earnVault() names the vault
 * behind that share token: that, not the sender's address alone, marks a
 * payout as interest.
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

	const candidates = [
		...new Set(
			rows.flatMap((row) => {
				const share = shares.get(row.token.address.toLowerCase())
				const from = row.from.toLowerCase()
				if (!share || row.to.toLowerCase() !== account.toLowerCase()) return []
				if (from === share.vault || from === zeroAddress) return []
				return [from]
			}),
		),
	]
	const client = getBatchedClient()
	const vaultOf = new Map(
		await Promise.all(
			candidates.map(async (sender) => {
				const vault = await client
					.readContract({
						address: sender as Address.Address,
						abi: distributorAbi,
						functionName: 'earnVault',
					})
					.catch(() => undefined)
				return [sender, vault?.toLowerCase()] as const
			}),
		),
	)

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
			vaultOf.get(row.from.toLowerCase()) === share.vault
		return {
			...row,
			valuation,
			...(isInterest ? { kind: 'earn-interest' as const } : {}),
		}
	})
}
