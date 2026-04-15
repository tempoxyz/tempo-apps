export const vyperSource = `# @version ^0.3.10
# Simple Vyper contract for testing

owner: public(address)
value: public(uint256)

event ValueChanged:
    sender: indexed(address)
    newValue: uint256

@deploy
def __init__():
    self.owner = msg.sender
    self.value = 0

@external
def set_value(_value: uint256):
    self.value = _value
    log ValueChanged(msg.sender, _value)

@external
@view
def get_value() -> uint256:
    return self.value
`

// Realistic Vyper compiler output – bytecodes are shortened but structurally valid
// hex strings that exercise the Vyper matching branches.
const VYPER_RUNTIME_BYTECODE =
	'6003361161000c57610108565b5f3560e01c346101045763b0f2b72a811861002e575f5460405260206040f35b632baeceb78118610068575f5f5460018101818111610104579050815f5560405260016020527f0ef4482aceb854636f33f9cd319f9e1cd6fe3aa2e60523f3583c287b8938244560406020a1005b63d09de08a8118610072575b005b63d14e62b881186100d757602436103417610104576004358060405260015f5460018101818111610104579050815f5560605260016040527f0ef4482aceb854636f33f9cd319f9e1cd6fe3aa2e60523f3583c287b8938244560606040a1005b638da5cb5b81186100f557600154604052602060406100fc565b5f5ffd5b5f5ffd5bf35b5f5ffd'
const VYPER_CREATION_BYTECODE =
	'61012461001161000039610124610000f36003361161000c57610108565b5f3560e01c346101045763b0f2b72a811861002e575f5460405260206040f35b632baeceb78118610068575f5f5460018101818111610104579050815f5560405260016020527f0ef4482aceb854636f33f9cd319f9e1cd6fe3aa2e60523f3583c287b8938244560406020a1005b63d09de08a8118610072575b005b63d14e62b881186100d757602436103417610104576004358060405260015f5460018101818111610104579050815f5560605260016040527f0ef4482aceb854636f33f9cd319f9e1cd6fe3aa2e60523f3583c287b8938244560606040a1005b638da5cb5b81186100f557600154604052602060406100fc565b5f5ffd5b5f5ffd5bf35b5f5ffd'

export const vyperFixture = {
	chainId: 31_318,
	address: '0x2222222222222222222222222222222222222222' as const,
	compilerVersion: '0.3.10',
	contractIdentifier: 'vyper_contract.vy:vyper_contract',

	stdJsonInput: {
		language: 'Vyper',
		sources: {
			'vyper_contract.vy': { content: vyperSource },
		},
		settings: {
			outputSelection: {
				'*': {
					'*': ['abi', 'evm.bytecode', 'evm.deployedBytecode'],
				},
			},
			evmVersion: 'cancun',
		},
	},

	vyperCompileOutput: {
		contracts: {
			'vyper_contract.vy': {
				vyper_contract: {
					abi: [
						{
							inputs: [],
							stateMutability: 'nonpayable',
							type: 'constructor',
						},
						{
							anonymous: false,
							inputs: [
								{
									indexed: true,
									name: 'sender',
									type: 'address',
								},
								{
									indexed: false,
									name: 'newValue',
									type: 'uint256',
								},
							],
							name: 'ValueChanged',
							type: 'event',
						},
						{
							inputs: [],
							name: 'owner',
							outputs: [{ name: '', type: 'address' }],
							stateMutability: 'view',
							type: 'function',
						},
						{
							inputs: [],
							name: 'value',
							outputs: [{ name: '', type: 'uint256' }],
							stateMutability: 'view',
							type: 'function',
						},
						{
							inputs: [{ name: '_value', type: 'uint256' }],
							name: 'set_value',
							outputs: [],
							stateMutability: 'nonpayable',
							type: 'function',
						},
						{
							inputs: [],
							name: 'get_value',
							outputs: [{ name: '', type: 'uint256' }],
							stateMutability: 'view',
							type: 'function',
						},
					],
					evm: {
						bytecode: {
							object: VYPER_CREATION_BYTECODE,
							sourceMap: '',
						},
						deployedBytecode: {
							object: VYPER_RUNTIME_BYTECODE,
							sourceMap: '',
						},
					},
					metadata: '',
				},
			},
		},
		sources: {
			'vyper_contract.vy': { id: 0 },
		},
	},

	// On-chain bytecode matches the compiled runtime bytecode exactly (happy path)
	onchainRuntimeBytecode: `0x${VYPER_RUNTIME_BYTECODE}` as const,

	// A slightly different bytecode to simulate a mismatch
	mismatchedOnchainBytecode:
		'0xaabbccdd00000000000000000000000000000000000000000000000000000000000000000000000000000000' as const,
} as const
