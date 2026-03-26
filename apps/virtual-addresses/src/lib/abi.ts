export const VIRTUAL_REGISTRY_ADDRESS =
	'0xFDC0000000000000000000000000000000000000' as const

export const PATH_USD_ADDRESS =
	'0x20c0000000000000000000000000000000000000' as const

export const virtualRegistryAbi = [
	{
		type: 'function',
		name: 'registerVirtualMaster',
		stateMutability: 'nonpayable',
		inputs: [{ name: 'salt', type: 'bytes32' }],
		outputs: [{ name: 'masterId', type: 'bytes4' }],
	},
	{
		type: 'function',
		name: 'getMaster',
		stateMutability: 'view',
		inputs: [{ name: 'masterId', type: 'bytes4' }],
		outputs: [{ name: '', type: 'address' }],
	},
	{
		type: 'function',
		name: 'resolveVirtualAddress',
		stateMutability: 'view',
		inputs: [{ name: 'virtualAddr', type: 'address' }],
		outputs: [{ name: 'master', type: 'address' }],
	},
	{
		type: 'function',
		name: 'isVirtualAddress',
		stateMutability: 'pure',
		inputs: [{ name: 'addr', type: 'address' }],
		outputs: [{ name: '', type: 'bool' }],
	},
	{
		type: 'function',
		name: 'decodeVirtualAddress',
		stateMutability: 'pure',
		inputs: [{ name: 'addr', type: 'address' }],
		outputs: [
			{ name: 'isVirtual', type: 'bool' },
			{ name: 'masterId', type: 'bytes4' },
			{ name: 'userTag', type: 'bytes6' },
		],
	},
	{
		type: 'event',
		name: 'MasterRegistered',
		inputs: [
			{ indexed: true, name: 'masterId', type: 'bytes4' },
			{ indexed: true, name: 'masterAddress', type: 'address' },
		],
	},
] as const

export const tip20Abi = [
	{
		type: 'function',
		name: 'transfer',
		stateMutability: 'nonpayable',
		inputs: [
			{ name: 'to', type: 'address' },
			{ name: 'amount', type: 'uint256' },
		],
		outputs: [{ name: '', type: 'bool' }],
	},
	{
		type: 'function',
		name: 'balanceOf',
		stateMutability: 'view',
		inputs: [{ name: 'account', type: 'address' }],
		outputs: [{ name: '', type: 'uint256' }],
	},
	{
		type: 'function',
		name: 'decimals',
		stateMutability: 'view',
		inputs: [],
		outputs: [{ name: '', type: 'uint8' }],
	},
	{
		type: 'function',
		name: 'symbol',
		stateMutability: 'view',
		inputs: [],
		outputs: [{ name: '', type: 'string' }],
	},
	{
		type: 'event',
		name: 'Transfer',
		inputs: [
			{ indexed: true, name: 'from', type: 'address' },
			{ indexed: true, name: 'to', type: 'address' },
			{ indexed: false, name: 'amount', type: 'uint256' },
		],
	},
] as const
