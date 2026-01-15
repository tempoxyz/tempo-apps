import { type Address, type Hex, decodeFunctionData, formatUnits } from 'viem'
import { Abis, Addresses } from 'viem/tempo'

export type DecodedCall = {
	target: Address
	targetName: string
	functionName: string
	description: string
	args: DecodedArg[]
	value: bigint
}

export type DecodedArg = {
	name: string
	type: string
	value: unknown
	displayValue: string
}

const TIP20_ADDRESS_PREFIX = '0x20c0'

const SYSTEM_CONTRACTS: Record<
	string,
	{ name: string; abi: readonly unknown[] }
> = {
	[Addresses.tip20Factory.toLowerCase()]: {
		name: 'TIP-20 Factory',
		abi: Abis.tip20Factory,
	},
	[Addresses.feeManager.toLowerCase()]: {
		name: 'Fee Manager',
		abi: Abis.feeManager,
	},
	[Addresses.stablecoinDex.toLowerCase()]: {
		name: 'Stablecoin DEX',
		abi: Abis.stablecoinDex,
	},
	[Addresses.tip403Registry.toLowerCase()]: {
		name: 'TIP-403 Registry',
		abi: Abis.tip403Registry,
	},
}

const KNOWN_TOKENS: Record<string, string> = {
	'0x20c0000000000000000000000000000000000000': 'pathUSD',
	'0x20c0000000000000000000000000000000000001': 'AlphaUSD',
	'0x20c0000000000000000000000000000000000002': 'BetaUSD',
	'0x20c0000000000000000000000000000000000003': 'ThetaUSD',
}

function isTip20Address(address: Address): boolean {
	return address.toLowerCase().startsWith(TIP20_ADDRESS_PREFIX)
}

function getTokenName(address: Address): string {
	return KNOWN_TOKENS[address.toLowerCase()] ?? 'TIP-20 Token'
}

function shortenAddress(addr: string, chars = 4): string {
	return `${addr.slice(0, chars + 2)}…${addr.slice(-chars)}`
}

function formatArgValue(_name: string, type: string, value: unknown): string {
	if (type === 'address') {
		const addr = value as string
		const tokenName = KNOWN_TOKENS[addr.toLowerCase()]
		if (tokenName) return tokenName
		return shortenAddress(addr)
	}
	if (type === 'uint256' || type === 'uint128' || type === 'uint64') {
		const bigVal = value as bigint
		if (bigVal > 1_000_000n) return formatUnits(bigVal, 6)
		return bigVal.toString()
	}
	if (type === 'bytes' || type.startsWith('bytes')) {
		const hex = value as string
		if (hex === '0x' || hex === '0x00') return '(empty)'
		if (hex.length > 20) return `${hex.slice(0, 20)}…`
		return hex
	}
	if (type === 'bool') return value ? 'Yes' : 'No'
	if (Array.isArray(value)) return `[${value.length} items]`
	return String(value)
}

function getFunctionDescription(
	targetName: string,
	functionName: string,
	args: DecodedArg[],
): string {
	if (functionName === 'transfer' || functionName === 'transferWithMemo') {
		const to = args.find((a) => a.name === 'to')?.value as string
		const amount = args.find((a) => a.name === 'amount')?.value as bigint
		return `Transfer ${formatUnits(amount ?? 0n, 6)} to ${shortenAddress(to ?? '')}`
	}
	if (functionName === 'mint') {
		const to = args.find((a) => a.name === 'to')?.value as string
		const amount = args.find((a) => a.name === 'amount')?.value as bigint
		return `Mint ${formatUnits(amount ?? 0n, 6)} to ${shortenAddress(to ?? '')}`
	}
	if (functionName === 'burn' || functionName === 'burnWithMemo') {
		const amount = args.find((a) => a.name === 'amount')?.value as bigint
		return `Burn ${formatUnits(amount ?? 0n, 6)}`
	}
	if (functionName === 'burnBlocked') {
		const from = args.find((a) => a.name === 'from')?.value as string
		const amount = args.find((a) => a.name === 'amount')?.value as bigint
		return `Burn ${formatUnits(amount ?? 0n, 6)} from ${shortenAddress(from ?? '')}`
	}
	if (functionName === 'approve') {
		const spender = args.find((a) => a.name === 'spender')?.value as string
		const amount = args.find((a) => a.name === 'amount')?.value as bigint
		return `Approve ${formatUnits(amount ?? 0n, 6)} for ${shortenAddress(spender ?? '')}`
	}
	if (functionName === 'createToken') {
		const symbol = args.find((a) => a.name === 'symbol')?.value as string
		return `Create new TIP-20 token: ${symbol}`
	}
	if (
		functionName === 'swapExactAmountIn' ||
		functionName === 'swapExactAmountOut'
	) {
		return 'Swap tokens on Stablecoin DEX'
	}
	if (functionName === 'place' || functionName === 'placeFlip') {
		const token = args.find((a) => a.name === 'token')?.value as string
		const amount = args.find((a) => a.name === 'amount')?.value as bigint
		const isBid = args.find((a) => a.name === 'isBid')?.value as boolean
		const tokenName = KNOWN_TOKENS[token?.toLowerCase() ?? ''] ?? 'tokens'
		return `Place ${isBid ? 'bid' : 'ask'} order: ${formatUnits(amount ?? 0n, 6)} ${tokenName}`
	}
	if (functionName === 'cancel') {
		const orderId = args.find((a) => a.name === 'orderId')?.value as bigint
		return `Cancel DEX order #${orderId?.toString() ?? '?'}`
	}
	if (functionName === 'withdraw') {
		const token = args.find((a) => a.name === 'token')?.value as string
		const amount = args.find((a) => a.name === 'amount')?.value as bigint
		const tokenName = KNOWN_TOKENS[token?.toLowerCase() ?? ''] ?? 'tokens'
		return `Withdraw ${formatUnits(amount ?? 0n, 6)} ${tokenName} from DEX`
	}
	if (functionName === 'setUserToken') {
		const token = args.find((a) => a.name === 'token')?.value as string
		const tokenName =
			KNOWN_TOKENS[token?.toLowerCase() ?? ''] ?? shortenAddress(token ?? '')
		return `Set fee token to ${tokenName}`
	}
	if (functionName === 'setPolicy') return 'Update transfer policy'
	return `Call ${functionName} on ${targetName}`
}

export function decodeMultisigCall(
	to: Address,
	value: bigint,
	data: Hex,
): DecodedCall | null {
	if (!data || data === '0x') {
		const targetName = getTargetName(to)
		return {
			target: to,
			targetName,
			functionName: 'rawCall',
			description: 'Raw call with no data',
			args: [
				{ name: 'to', type: 'address', value: to, displayValue: targetName },
			],
			value,
		}
	}

	const targetName = getTargetName(to)
	const abi = getAbiForAddress(to)

	if (!abi) {
		return {
			target: to,
			targetName,
			functionName: 'unknown',
			description: `Call to ${targetName}`,
			args: [
				{
					name: 'data',
					type: 'bytes',
					value: data,
					displayValue: data.length > 20 ? `${data.slice(0, 20)}…` : data,
				},
			],
			value,
		}
	}

	try {
		const decoded = decodeFunctionData({ abi: abi as readonly unknown[], data })
		const functionAbi = (
			abi as readonly {
				name?: string
				inputs?: readonly { name: string; type: string }[]
			}[]
		).find((item) => 'name' in item && item.name === decoded.functionName)

		const args: DecodedArg[] = (decoded.args ?? []).map((val, i) => {
			const input = functionAbi?.inputs?.[i]
			const name = input?.name ?? `arg${i}`
			const type = input?.type ?? 'unknown'
			return {
				name,
				type,
				value: val,
				displayValue: formatArgValue(name, type, val),
			}
		})

		return {
			target: to,
			targetName,
			functionName: decoded.functionName,
			description: getFunctionDescription(
				targetName,
				decoded.functionName,
				args,
			),
			args,
			value,
		}
	} catch {
		return {
			target: to,
			targetName,
			functionName: 'unknown',
			description: `Call to ${targetName}`,
			args: [
				{
					name: 'data',
					type: 'bytes',
					value: data,
					displayValue: data.length > 20 ? `${data.slice(0, 20)}…` : data,
				},
			],
			value,
		}
	}
}

function getTargetName(address: Address): string {
	const lower = address.toLowerCase()
	const system = SYSTEM_CONTRACTS[lower]
	if (system) return system.name
	if (isTip20Address(address)) return getTokenName(address)
	return shortenAddress(address)
}

function getAbiForAddress(address: Address): readonly unknown[] | null {
	const lower = address.toLowerCase()
	const system = SYSTEM_CONTRACTS[lower]
	if (system) return system.abi
	if (isTip20Address(address)) return Abis.tip20
	return null
}

export function getCallIcon(decoded: DecodedCall): string {
	const fn = decoded.functionName.toLowerCase()
	if (fn.includes('transfer') || fn === 'send') return 'send'
	if (fn.includes('mint')) return 'plus'
	if (fn.includes('burn')) return 'minus'
	if (fn.includes('approve')) return 'check-circle'
	if (fn.includes('swap')) return 'repeat'
	if (fn === 'place' || fn === 'placeflip') return 'repeat'
	if (fn.includes('withdraw')) return 'upload'
	if (fn.includes('create')) return 'plus-circle'
	if (fn === 'cancel' || fn.includes('cancel')) return 'x-circle'
	if (fn.includes('set') || fn.includes('update')) return 'settings'
	return 'code'
}
