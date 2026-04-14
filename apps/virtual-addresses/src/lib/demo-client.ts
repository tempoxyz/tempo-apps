import type { Address, Hex } from 'viem'

export async function demoRegister(salt: Hex) {
	const res = await fetch('/api/demo/register', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ salt }),
	})
	if (!res.ok) throw new Error('Register failed')
	return res.json() as Promise<{
		txHash: string | null
		blockNumber: number | null
		masterId: string
		exchangeAddress: string
		alreadyRegistered: boolean
	}>
}

export async function demoTransfer(virtualAddress: Address, amount: string) {
	const res = await fetch('/api/demo/transfer', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ virtualAddress, amount }),
	})
	if (!res.ok) throw new Error('Transfer failed')
	return res.json() as Promise<{
		txHash: string
		blockNumber: number
		events: { from: Address; to: Address; amount: string }[]
	}>
}

export async function demoBalance(virtualAddress?: Address) {
	const params = virtualAddress ? `?virtualAddress=${virtualAddress}` : ''
	const res = await fetch(`/api/demo/balance${params}`)
	if (!res.ok) throw new Error('Balance fetch failed')
	return res.json() as Promise<{
		exchange: string
		sender: string
		virtual: string
		exchangeAddress: string | null
		senderAddress: string | null
	}>
}

export async function demoFund(address?: Address) {
	const res = await fetch('/api/fund', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ address }),
	})
	if (!res.ok) throw new Error('Fund failed')
	return res.json() as Promise<{ funded: string[] }>
}
